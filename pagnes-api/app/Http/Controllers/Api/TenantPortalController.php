<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Boutique;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

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
                && $boutiques->contains('id', $user->boutique_id),
            'subscription' => $subscription,
            'license' => $license,
            'stats' => $stats,
        ]);
    }

    public function boutiques(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

        return response()->json(
            Boutique::where('tenant_id', $user->tenant_id)->orderBy('nom')->get()
        );
    }

    public function subscription(Request $request)
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

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
        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

        $tenant = Tenant::findOrFail($user->tenant_id);

        return response()->json([
            'transactions' => $tenant->payments()->with('subscription.plan')->latest('created_at')->get()->map(function (Payment $payment) {
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
        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

        $payment = Tenant::findOrFail($user->tenant_id)->payments()
            ->with(['tenant', 'subscription.plan'])
            ->findOrFail($paymentId);

        return response()->view('payments.invoice', ['payment' => $payment]);
    }

    public function attachment(Request $request, int $paymentId): StreamedResponse
    {
        $user = $request->user();
        abort_unless($user && $user->tenant_id, 403, 'Aucun tenant associé à ce compte.');

        $payment = Tenant::findOrFail($user->tenant_id)->payments()->findOrFail($paymentId);
        abort_unless($payment->attachment_path && Storage::disk('local')->exists($payment->attachment_path), 404);

        return Storage::disk('local')->download($payment->attachment_path, $payment->attachment_name, [
            'Content-Type' => $payment->attachment_mime ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
