<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Boutique;
use App\Models\Parametre;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TenantPortalController extends Controller
{
    public function plans(): JsonResponse
    {
        return response()->json(Plan::where('actif', true)->orderBy('prix')->get());
    }

    public function dashboard(Request $request)
    {
        $user = $request->user();

        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        $tenant = Tenant::with(['boutiques', 'subscription.plan', 'licenses.subscription'])->findOrFail($user->tenant_id);
        $subscription = $tenant->subscription()->with('plan')->first();
        $license = $tenant->licenses()->latest('activated_at')->first();
        $boutiques = Boutique::where('tenant_id', $tenant->id)->orderBy('nom')->get();

        $stats = [
            'boutiques_total' => $boutiques->count(),
            'users_total' => $tenant->users()->count(),
            'subscription_status' => $subscription?->status ?? 'none',
            'license_status' => $license?->status ?? 'none',
            'plan_name' => $subscription?->plan?->nom ?? null,
            'license_expires_at' => $license?->expires_at,
        ];

        return response()->json([
            'tenant' => $tenant,
            'boutiques' => $boutiques,
            'boutique_access' => $user->boutique_id !== null
                && $boutiques->contains(fn (Boutique $b) => $b->id === $user->boutique_id && $b->statut === 'active'),
            'subscription' => $subscription,
            'license' => $license,
            'stats' => $stats,
        ]);
    }

    /** Cloche de l'espace entreprise : licence qui expire, paiements des 30 derniers jours. */
    public function notifications(Request $request, NotificationService $notifications)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        return response()->json($notifications->pourTenant(Tenant::findOrFail($user->tenant_id)));
    }

    public function boutiques(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        return response()->json(
            Boutique::where('tenant_id', $user->tenant_id)->orderBy('nom')->get()
        );
    }

    /**
     * Le gérant ajoute une boutique à son entreprise, dans la limite de sa formule (max_boutiques).
     * Elle reçoit ses propres paramètres (nom repris sur le ticket et dans l'en-tête) ; le gérant
     * l'ouvre ensuite avec l'en-tête X-Boutique et y crée ses comptes.
     */
    public function storeBoutique(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'adresse' => 'nullable|string|max:190',
            'telephone' => 'nullable|string|max:40',
        ], [
            'nom.required' => __('Le nom de la boutique est obligatoire.'),
        ]);

        $boutique = DB::transaction(function () use ($user, $data) {
            // Verrou sur l'entreprise : deux créations simultanées ne dépassent pas la limite.
            $tenant = Tenant::whereKey($user->tenant_id)->lockForUpdate()->firstOrFail();
            if (! $tenant->canAddBoutique()) {
                abort(422, __('Limite de boutiques atteinte pour votre offre. Changez d\'offre pour en ajouter.'));
            }

            $boutique = Boutique::create([
                'tenant_id' => $tenant->id, 'nom' => trim($data['nom']),
                'adresse' => $data['adresse'] ?? null, 'telephone' => $data['telephone'] ?? null,
                'devise' => 'XOF', 'timezone' => 'Africa/Lome', 'statut' => 'active',
            ]);
            Parametre::create([
                'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id,
                'boutique' => $boutique->nom, 'adresse' => $boutique->adresse, 'telephone' => $boutique->telephone,
                'ticket_format' => '80mm', 'remise_max_vendeur' => 15,
                'autorise_pagne' => true, 'autorise_yard' => false, 'autorise_metre' => false,
                'quantite_min_panier' => 1, 'unite_stock' => 'yard',
            ]);

            return $boutique;
        });

        return response()->json($boutique, 201);
    }

    /**
     * Le gérant corrige le nom, l'adresse ou le téléphone d'une boutique. Ses paramètres suivent :
     * le nom affiché sur les tickets et dans l'en-tête de l'application reste celui de la boutique.
     */
    public function updateBoutique(Request $request, int $boutiqueId)
    {
        $boutique = $this->boutiqueDeLEntreprise($request, $boutiqueId);
        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'adresse' => 'nullable|string|max:190',
            'telephone' => 'nullable|string|max:40',
        ], [
            'nom.required' => __('Le nom de la boutique est obligatoire.'),
        ]);
        $valeurs = ['nom' => trim($data['nom']), 'adresse' => $data['adresse'] ?? null, 'telephone' => $data['telephone'] ?? null];

        DB::transaction(function () use ($boutique, $valeurs) {
            $boutique->update($valeurs);
            Parametre::where('tenant_id', $boutique->tenant_id)->where('boutique_id', $boutique->id)
                ->update(['boutique' => $valeurs['nom'], 'adresse' => $valeurs['adresse'], 'telephone' => $valeurs['telephone']]);
        });

        return response()->json($boutique->fresh());
    }

    /**
     * Ferme une boutique : ses données sont conservées, mais plus personne n'y travaille.
     * Ses comptes (hors gérants) sont déconnectés et ne peuvent plus se connecter ; sa place
     * dans la formule est libérée. La dernière boutique active de l'entreprise ne se ferme pas.
     */
    public function fermerBoutique(Request $request, int $boutiqueId)
    {
        $boutique = DB::transaction(function () use ($request, $boutiqueId) {
            Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $boutique = $this->boutiqueDeLEntreprise($request, $boutiqueId);
            if ($boutique->statut !== 'active') {
                abort(422, __('Cette boutique est déjà fermée.'));
            }
            $autresActives = Boutique::where('tenant_id', $boutique->tenant_id)->where('statut', 'active')->whereKeyNot($boutique->id)->exists();
            if (! $autresActives) {
                abort(422, __('Impossible de fermer la dernière boutique ouverte de l\'entreprise.'));
            }

            $boutique->update(['statut' => 'inactive']);
            // Sessions coupées tout de suite ; les gérants (admin, tenant_admin) gardent leur espace entreprise.
            $comptes = $boutique->users()->whereNotIn('role', ['admin', 'tenant_admin'])->pluck('id');
            DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', $comptes)->delete();

            return $boutique;
        });

        return response()->json($boutique->fresh());
    }

    /** Rouvre une boutique fermée : elle reprend une place dans la formule (refus au-delà de la limite). */
    public function rouvrirBoutique(Request $request, int $boutiqueId)
    {
        $boutique = DB::transaction(function () use ($request, $boutiqueId) {
            $tenant = Tenant::whereKey($request->user()->tenant_id)->lockForUpdate()->firstOrFail();
            $boutique = $this->boutiqueDeLEntreprise($request, $boutiqueId);
            if ($boutique->statut === 'active') {
                abort(422, __('Cette boutique est déjà ouverte.'));
            }
            if (! $tenant->canAddBoutique()) {
                abort(422, __('Limite de boutiques atteinte pour votre offre. Changez d\'offre pour en ajouter.'));
            }
            $boutique->update(['statut' => 'active']);

            return $boutique;
        });

        return response()->json($boutique->fresh());
    }

    /** Boutique de l'entreprise du gérant ; une boutique d'une autre entreprise est introuvable (404). */
    private function boutiqueDeLEntreprise(Request $request, int $boutiqueId): Boutique
    {
        return Boutique::where('tenant_id', $request->user()->tenant_id)->findOrFail($boutiqueId);
    }

    public function subscription(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        $tenant = Tenant::with(['subscription.plan', 'licenses'])->findOrFail($user->tenant_id);

        return response()->json([
            'tenant' => $tenant,
            'subscription' => $tenant->subscription()->with('plan')->first(),
            'license' => $tenant->licenses()->latest('activated_at')->first(),
        ]);
    }

    public function payments(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        $tenant = Tenant::findOrFail($user->tenant_id);
        $page = $tenant->payments()->with('subscription.plan')->latest('created_at')->latest('id')
            ->paginate(SuperAdminController::parPage($request));

        return response()->json([
            'pagination' => SuperAdminController::pagination($page),
            'transactions' => $page->getCollection()->map(function (Payment $payment) {
                return [
                    'id' => $payment->id,
                    'amount' => (int) $payment->amount,
                    'status' => $payment->status,
                    'payment_method' => $payment->payment_method,
                    'payment_reference' => $payment->payment_reference,
                    'notes' => $payment->notes,
                    'processed_at' => $payment->processed_at?->toISOString(),
                    'created_at' => $payment->created_at?->toISOString(),
                    'invoice_number' => $payment->invoice_number,
                    'attachment_name' => $payment->attachment_name,
                    'has_attachment' => (bool) $payment->attachment_path,
                    'plan' => $payment->subscription?->plan ? [
                        'id' => $payment->subscription->plan->id,
                        'nom' => $payment->subscription->plan->nom,
                    ] : null,
                ];
            }),
        ]);
    }

    public function invoice(Request $request, int $paymentId): Response
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        $payment = Tenant::findOrFail($user->tenant_id)->payments()
            ->with(['tenant', 'subscription.plan'])
            ->findOrFail($paymentId);

        return response()->view('payments.invoice', ['payment' => $payment]);
    }

    public function attachment(Request $request, int $paymentId): StreamedResponse
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, __('Aucun tenant associé à ce compte.'));

        $payment = Tenant::findOrFail($user->tenant_id)->payments()->findOrFail($paymentId);
        abort_unless($payment->attachment_path && Storage::disk('local')->exists($payment->attachment_path), 404);

        return Storage::disk('local')->download($payment->attachment_path, $payment->attachment_name, [
            'Content-Type' => $payment->attachment_mime ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
