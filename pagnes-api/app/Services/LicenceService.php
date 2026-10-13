<?php

namespace App\Services;

use App\Models\License;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Sans intégrateur de paiement, seul le super admin encaisse : il enregistre le paiement
 * reçu (espèces, carte, T-Money, Flooz) et cela renouvelle l'abonnement et la licence.
 */
class LicenceService
{
    /** Modes proposés à la saisie. `manual` reste lisible dans les anciennes données. */
    public const MODES = ['cash', 'card', 'tmoney', 'flooz'];

    /**
     * @param  array{amount: int, payment_method: string, payment_reference: string, notes?: ?string}  $paiement
     * @return array{payment: Payment, subscription: Subscription, license: License}
     */
    public function renouveler(Tenant $tenant, Plan $plan, int $periodes, array $paiement, ?UploadedFile $justificatif, User $par): array
    {
        $chemin = null;
        try {
            return DB::transaction(function () use ($tenant, $plan, $periodes, $paiement, $justificatif, $par, &$chemin) {
                $subscription = $tenant->subscriptions()->latest('id')->lockForUpdate()->first();
                // Renouvellement anticipé : la nouvelle période part de la fin de l'actuelle, aucun jour n'est perdu.
                $finEnCours = $this->finEnCours($subscription);
                $debut = $finEnCours ?? now();
                $fin = $plan->intervalle === 'year' ? $debut->copy()->addYearsNoOverflow($periodes) : $debut->copy()->addMonthsNoOverflow($periodes);

                $valeurs = [
                    'plan_id' => $plan->id,
                    'status' => 'active',
                    'ends_at' => $fin,
                    'billing_provider' => $paiement['payment_method'],
                    'external_reference' => $paiement['payment_reference'],
                ];
                if ($subscription) {
                    $subscription->update($valeurs + ($finEnCours ? [] : ['starts_at' => $debut]));
                } else {
                    $subscription = $tenant->subscriptions()->create($valeurs + ['starts_at' => $debut]);
                }

                $license = $tenant->licenses()->latest('id')->lockForUpdate()->first();
                if ($license) {
                    $license->update([
                        'subscription_id' => $subscription->id,
                        'status' => 'active',
                        'expires_at' => $fin,
                        'activated_at' => $license->status === 'active' && $license->activated_at ? $license->activated_at : now(),
                    ]);
                } else {
                    $license = $tenant->licenses()->create([
                        'subscription_id' => $subscription->id,
                        'status' => 'active',
                        'cle' => strtoupper(Str::random(16)),
                        'activated_at' => now(),
                        'expires_at' => $fin,
                        'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
                    ]);
                }

                $payment = Payment::create([
                    'tenant_id' => $tenant->id,
                    'subscription_id' => $subscription->id,
                    'amount' => $paiement['amount'],
                    'status' => 'paid',
                    'payment_method' => $paiement['payment_method'],
                    'payment_reference' => $paiement['payment_reference'],
                    'notes' => $paiement['notes'] ?? null,
                    'processed_at' => now(),
                    'created_by_user_id' => $par->id,
                ]);
                $payment->update(['invoice_number' => self::numeroFacture($payment)]);

                if ($justificatif) {
                    $chemin = $this->stockerJustificatif($tenant, $justificatif);
                    $payment->update([
                        'attachment_path' => $chemin,
                        'attachment_name' => $justificatif->getClientOriginalName(),
                        'attachment_mime' => $justificatif->getMimeType(),
                    ]);
                }

                return [
                    'payment' => $payment->fresh(['tenant', 'subscription.plan', 'createdBy:id,nom']),
                    'subscription' => $subscription->fresh('plan'),
                    'license' => $license->fresh(),
                ];
            });
        } catch (\Throwable $e) {
            if ($chemin) {
                Storage::disk('local')->delete($chemin);
            }
            throw $e;
        }
    }

    public static function numeroFacture(Payment $payment): string
    {
        return 'FAC-'.now()->format('Y').'-'.str_pad((string) $payment->id, 8, '0', STR_PAD_LEFT);
    }

    public function stockerJustificatif(Tenant $tenant, UploadedFile $fichier): string
    {
        $chemin = $fichier->storeAs('payments/'.$tenant->id, Str::uuid().'.'.$fichier->extension(), 'local');
        if (! $chemin) {
            throw new \RuntimeException('Impossible de stocker le justificatif.');
        }

        return $chemin;
    }

    private function finEnCours(?Subscription $subscription): ?Carbon
    {
        $enCours = $subscription
            && in_array($subscription->status, ['active', 'trial'], true)
            && $subscription->ends_at
            && $subscription->ends_at->isFuture();

        return $enCours ? $subscription->ends_at->copy() : null;
    }
}
