<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Boutique;
use App\Models\License;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Services\LicenceService;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SuperAdminController extends Controller
{
    /** Messages de saisie d'un paiement, dans la langue de la requête. */
    private static function messagesPaiement(): array
    {
        return [
            'payment_reference.unique' => __('Cette référence a déjà été enregistrée pour ce mode de paiement.'),
            'payment_reference.required' => __('La référence du paiement est obligatoire (n° de reçu, de transaction ou de ticket carte).'),
            'payment_method.in' => __('Mode de paiement invalide : espèces, carte, T-Money ou Flooz.'),
        ];
    }

    public function index(Request $request)
    {
        return response()->json(
            Tenant::with(['boutiques', 'subscription.plan', 'licenses'])->orderBy('nom')->paginate(20)
        );
    }

    /** Cloche de la console : licences à renouveler, paiements à vérifier, essais qui se terminent. */
    public function notifications(NotificationService $notifications): JsonResponse
    {
        return response()->json($notifications->pourSuperAdmin());
    }

    public function dashboard(): JsonResponse
    {
        $totals = [
            'total_tenants' => Tenant::count(),
            'active_tenants' => Tenant::where('statut', 'active')->count(),
            'total_boutiques' => Boutique::count(),
            'active_subscriptions' => Subscription::where('status', 'active')->count(),
            'trial_subscriptions' => Subscription::where('status', 'trial')->count(),
            'expired_licenses' => License::where('status', 'expired')->count(),
            'expiring_licenses' => License::where('status', 'active')->where('expires_at', '<=', now()->addDays(7))->count(),
            'mrr' => (int) Subscription::query()
                ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
                ->where('subscriptions.status', 'active')
                ->sum('plans.prix'),
        ];

        $tenants = Tenant::with(['boutiques', 'subscription.plan', 'licenses'])
            ->orderByDesc('updated_at')
            ->limit(10)
            ->get();

        return response()->json([
            'totals' => $totals,
            'tenants' => $tenants,
            'plans' => Plan::orderBy('prix')->get(),
        ]);
    }

    public function storeTenant(Request $request)
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:120', 'unique:tenants,slug'],
            'boutique' => ['nullable', 'array'],
            'boutique.nom' => ['nullable', 'string', 'max:255'],
            'boutique.adresse' => ['nullable', 'string', 'max:255'],
            'boutique.telephone' => ['nullable', 'string', 'max:50'],
        ]);

        $tenant = Tenant::create([
            'nom' => $data['nom'],
            'slug' => $data['slug'],
            'statut' => 'active',
        ]);

        $boutique = null;
        if (! empty($data['boutique']['nom'])) {
            $boutique = Boutique::create([
                'tenant_id' => $tenant->id,
                'nom' => $data['boutique']['nom'],
                'adresse' => $data['boutique']['adresse'] ?? null,
                'telephone' => $data['boutique']['telephone'] ?? null,
                'devise' => 'XOF',
                'timezone' => 'Africa/Lome',
                'statut' => 'active',
            ]);

            $request->user()->update([
                'tenant_id' => $tenant->id,
                'boutique_id' => $boutique->id,
            ]);
        }

        return response()->json([
            'tenant' => $tenant->load('boutiques'),
            'boutique' => $boutique,
        ]);
    }

    public function plans(): JsonResponse
    {
        return response()->json(Plan::orderBy('prix')->get());
    }

    public function storePlan(Request $request)
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:120'],
            'slug' => ['required', 'string', 'max:120', 'unique:plans,slug'],
            'prix' => ['required', 'integer', 'min:0'],
            'intervalle' => ['required', 'in:month,year'],
            'max_boutiques' => ['nullable', 'integer', 'min:1'],
            'max_utilisateurs' => ['nullable', 'integer', 'min:1'],
            'features' => ['nullable', 'array'],
            'actif' => ['nullable', 'boolean'],
        ]);

        $plan = Plan::create([
            'nom' => $data['nom'],
            'slug' => $data['slug'],
            'prix' => $data['prix'],
            'intervalle' => $data['intervalle'],
            'max_boutiques' => $data['max_boutiques'] ?? 1,
            'max_utilisateurs' => $data['max_utilisateurs'] ?? 5,
            'features' => $data['features'] ?? [],
            'actif' => $data['actif'] ?? true,
        ]);

        return response()->json($plan, 201);
    }

    public function tenantSubscription(Tenant $tenant)
    {
        $subscription = $tenant->subscription()->with('plan')->first();

        return response()->json([
            'tenant' => $tenant->load('boutiques'),
            'subscription' => $subscription,
            'licenses' => $tenant->licenses()->with('subscription')->get(),
        ]);
    }

    public function subscribeTenant(Tenant $tenant, Request $request)
    {
        $data = $request->validate([
            'plan_id' => ['required', 'exists:plans,id'],
            'status' => ['nullable', 'in:active,trial,expired,cancelled'],
            'billing_provider' => ['nullable', 'in:cash,flooz,tmoney,card,manual', 'string', 'max:80'],
            'external_reference' => ['nullable', 'string', 'max:200'],
            'payment_method' => ['nullable', 'in:cash,flooz,tmoney,card,manual', 'string', 'max:80'],
            'payment_reference' => ['nullable', 'string', 'max:200'],
        ]);

        $plan = Plan::findOrFail($data['plan_id']);
        $paymentMethod = $data['payment_method'] ?? $data['billing_provider'] ?? 'manual';
        $paymentReference = $data['payment_reference'] ?? $data['external_reference'] ?? null;

        $subscription = Subscription::updateOrCreate(
            ['tenant_id' => $tenant->id],
            [
                'plan_id' => $plan->id,
                'status' => $data['status'] ?? 'active',
                'starts_at' => now(),
                'ends_at' => $plan->intervalle === 'year' ? now()->addYear() : now()->addMonth(),
                'trial_ends_at' => now()->addDays(14),
                'billing_provider' => $paymentMethod,
                'external_reference' => $paymentReference,
            ]
        );

        $license = License::firstOrCreate(
            ['tenant_id' => $tenant->id],
            [
                'subscription_id' => $subscription->id,
                'status' => 'active',
                'cle' => strtoupper(Str::random(16)),
                'activated_at' => now(),
                'expires_at' => now()->addMonth(),
                'quota_usage' => [
                    'boutiques' => 0,
                    'utilisateurs' => 0,
                ],
            ]
        );

        return response()->json([
            'subscription' => $subscription->load('plan'),
            'license' => $license,
        ]);
    }

    public function updateSubscriptionStatus(Tenant $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:active,trial,expired,cancelled'],
            'billing_provider' => ['nullable', 'string', 'max:80'],
            'license_status' => ['nullable', 'in:active,trial,expired,suspended'],
        ]);

        $subscription = $tenant->subscription()->firstOrFail();
        $subscription->update([
            'status' => $data['status'],
            'billing_provider' => $data['billing_provider'] ?? $subscription->billing_provider,
        ]);

        $license = $tenant->licenses()->latest('id')->first();
        if ($license && array_key_exists('license_status', $data)) {
            $license->update(['status' => $data['license_status']]);
        }

        return response()->json([
            'subscription' => $subscription->fresh()->load('plan'),
            'license' => $license?->fresh(),
        ]);
    }

    public function payments(Request $request): JsonResponse
    {
        $query = $this->filteredPayments($request);
        $transactions = (clone $query)->with(['tenant', 'subscription.plan'])
            ->latest('created_at')
            ->get()
            ->map(function (Payment $payment) {
                return [
                    'id' => $payment->id,
                    'tenant' => $payment->tenant ? [
                        'id' => $payment->tenant->id,
                        'nom' => $payment->tenant->nom,
                        'slug' => $payment->tenant->slug,
                    ] : null,
                    'subscription_id' => $payment->subscription_id,
                    'plan' => $payment->subscription?->plan ? [
                        'id' => $payment->subscription->plan->id,
                        'nom' => $payment->subscription->plan->nom,
                    ] : null,
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
                ];
            });

        $totalsQuery = $this->filteredPayments($request);

        return response()->json([
            'totals' => [
                'paid' => (clone $totalsQuery)->where('status', 'paid')->count(),
                'unpaid' => (clone $totalsQuery)->where('status', 'unpaid')->count(),
                'rejected' => (clone $totalsQuery)->where('status', 'rejected')->count(),
                'pending' => (clone $totalsQuery)->where('status', 'pending')->count(),
                'paid_amount' => (int) (clone $totalsQuery)->where('status', 'paid')->sum('amount'),
            ],
            'transactions' => $transactions,
        ]);
    }

    public function exportPayments(Request $request): StreamedResponse
    {
        $payments = $this->filteredPayments($request)
            ->with(['tenant', 'subscription.plan'])
            ->latest('created_at');

        return response()->streamDownload(function () use ($payments): void {
            $stream = fopen('php://output', 'w');
            fwrite($stream, "\xEF\xBB\xBF");
            fputcsv($stream, ['Facture', 'Tenant', 'Plan', 'Montant XOF', 'Statut', 'Moyen', 'Reference', 'Justificatif', 'Date'], ',', '"', '\\');

            foreach ($payments->reorder()->with(['tenant', 'subscription.plan'])->lazyById(500) as $payment) {
                $values = [
                    $payment->invoice_number,
                    $payment->tenant?->nom,
                    $payment->subscription?->plan?->nom,
                    $payment->amount,
                    $payment->status,
                    $payment->payment_method,
                    $payment->payment_reference,
                    $payment->attachment_name,
                    $payment->created_at?->toDateTimeString(),
                ];
                $values = array_map(fn ($value) => $this->safeCsvValue($value), $values);
                fputcsv($stream, $values, ',', '"', '\\');
            }

            fclose($stream);
        }, 'paiements-'.now()->format('Y-m-d').'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** Encaissement d'un renouvellement : enregistre le paiement et prolonge abonnement et licence. */
    public function renouveler(Tenant $tenant, Request $request, LicenceService $licences): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'exists:plans,id'],
            'periodes' => ['required', 'integer', 'min:1', 'max:36'],
            'amount' => ['required', 'integer', 'min:0'],
            ...$this->reglesPaiement($request),
        ], self::messagesPaiement());

        $resultat = $licences->renouveler(
            $tenant, Plan::findOrFail($data['plan_id']), (int) $data['periodes'],
            Arr::only($data, ['amount', 'payment_method', 'payment_reference', 'notes']),
            $request->file('attachment'), $request->user()
        );

        return response()->json($resultat, 201);
    }

    /** Mode, référence (unique par mode, pour contrôle), note et justificatif d'un paiement saisi. */
    private function reglesPaiement(Request $request): array
    {
        return [
            'payment_method' => ['required', Rule::in(LicenceService::MODES)],
            'payment_reference' => [
                'required', 'string', 'max:200',
                Rule::unique('payments', 'payment_reference')->where('payment_method', $request->input('payment_method')),
            ],
            'notes' => ['nullable', 'string', 'max:1000'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }

    public function storePayment(Tenant $tenant, Request $request): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:0'],
            'status' => ['required', 'in:paid,unpaid,rejected,pending'],
            'subscription_id' => ['nullable', 'exists:subscriptions,id'],
            ...$this->reglesPaiement($request),
        ], self::messagesPaiement());

        $subscription = $tenant->subscription()->first();
        if ($data['subscription_id'] ?? null) {
            $subscription = $tenant->subscriptions()->findOrFail($data['subscription_id']);
        }

        $attachmentPath = null;
        try {
            $payment = DB::transaction(function () use ($tenant, $subscription, $data, $request, &$attachmentPath): Payment {
                $payment = Payment::create([
                    'tenant_id' => $tenant->id,
                    'subscription_id' => $subscription?->id,
                    'amount' => $data['amount'],
                    'status' => $data['status'],
                    'payment_method' => $data['payment_method'],
                    'payment_reference' => $data['payment_reference'],
                    'notes' => $data['notes'] ?? null,
                    'processed_at' => now(),
                    'created_by_user_id' => $request->user()?->id,
                ]);
                $payment->update(['invoice_number' => LicenceService::numeroFacture($payment)]);

                if ($request->file('attachment')) {
                    $file = $request->file('attachment');
                    $attachmentPath = app(LicenceService::class)->stockerJustificatif($tenant, $file);

                    $payment->update([
                        'attachment_path' => $attachmentPath,
                        'attachment_name' => $file->getClientOriginalName(),
                        'attachment_mime' => $file->getMimeType(),
                    ]);
                }

                return $payment->fresh();
            });
        } catch (\Throwable $exception) {
            if ($attachmentPath) {
                Storage::disk('local')->delete($attachmentPath);
            }
            throw $exception;
        }

        if ($subscription && $data['status'] === 'paid') {
            $subscription->update([
                'status' => 'active',
                'billing_provider' => $data['payment_method'],
                'external_reference' => $data['payment_reference'],
            ]);
        }

        return response()->json([
            'payment' => $payment->load(['tenant', 'subscription.plan']),
        ]);
    }

    public function invoice(Payment $payment): Response
    {
        $payment->load(['tenant', 'subscription.plan']);

        return response()->view('payments.invoice', ['payment' => $payment]);
    }

    public function attachment(Payment $payment): StreamedResponse
    {
        abort_unless($payment->attachment_path && Storage::disk('local')->exists($payment->attachment_path), 404);

        return Storage::disk('local')->download($payment->attachment_path, $payment->attachment_name, [
            'Content-Type' => $payment->attachment_mime ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function filteredPayments(Request $request): Builder
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:paid,unpaid,rejected,pending'],
            'tenant_id' => ['nullable', 'integer', 'exists:tenants,id'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        return Payment::query()
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['tenant_id'] ?? null, fn (Builder $query, int $tenantId) => $query->where('tenant_id', $tenantId))
            ->when($filters['from'] ?? null, fn (Builder $query, string $date) => $query->whereDate('created_at', '>=', $date))
            ->when($filters['to'] ?? null, fn (Builder $query, string $date) => $query->whereDate('created_at', '<=', $date));
    }

    private function safeCsvValue(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        return preg_match('/^[\x00-\x20]*[=+@\-]/', $value) ? "'".$value : $value;
    }
}
