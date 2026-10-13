<?php

namespace Database\Seeders;

use App\Models\Payment;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\LicenceService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Comptes et données de démo de la partie SaaS : un super admin, un admin d'entreprise
 * sur le tenant de démo, des formules payantes, et deux entreprises clientes dont la
 * licence expire bientôt ou a expiré, pour alimenter le tableau « À surveiller ».
 *
 * Relançable sans risque : php artisan db:seed --class=ComptesSaasSeeder
 */
class ComptesSaasSeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::firstOrCreate(['email' => 'superadmin'], [
            'nom' => 'Équipe Plateforme', 'password' => Hash::make('super123'),
            'role' => 'super_admin', 'is_super_admin' => true, 'actif' => true,
        ]);

        // Le tenant de démo est celui du compte « admin » : créé par DemoSeeder, ou par la migration
        // de reprise des données d'avant le multi-tenant (slug différent selon le cas).
        $admin = User::where('email', 'admin')->first();
        if ($admin?->tenant_id) {
            User::firstOrCreate(['email' => 'gerant'], [
                'nom' => 'Délali Agbéko', 'password' => Hash::make('gerant123'), 'role' => 'tenant_admin', 'actif' => true,
                'tenant_id' => $admin->tenant_id, 'boutique_id' => $admin->boutique_id,
            ]);
        } else {
            $this->command?->warn('Compte « admin » absent : lancez d’abord DemoSeeder pour créer le compte « gerant ».');
        }

        $essentiel = $this->formule('Essentiel', 'essentiel', 15000, 'month', 1, 3);
        $pro = $this->formule('Pro', 'pro', 35000, 'month', 3, 10);
        $this->formule('Pro annuel', 'pro-annuel', 350000, 'year', 3, 10);

        $this->client('Wax Akofa', 'wax-akofa', 'Akofa Grand Marché', $pro, now()->addDays(5), [
            ['tmoney', 'TM-240517-8812', 'paid', 2],
            ['flooz', 'FZ-240617-4410', 'paid', 1],
        ], $superAdmin);
        $this->client('Kente Royal', 'kente-royal', 'Kente Royal Adidogomé', $essentiel, now()->subDays(10), [
            ['cash', 'RECU-0007', 'paid', 2],
            ['flooz', 'FZ-240801-9921', 'pending', 0], // référence transmise, encore à vérifier
        ], $superAdmin);
    }

    private function formule(string $nom, string $slug, int $prix, string $intervalle, int $boutiques, int $utilisateurs): Plan
    {
        return Plan::firstOrCreate(['slug' => $slug], [
            'nom' => $nom, 'prix' => $prix, 'intervalle' => $intervalle,
            'max_boutiques' => $boutiques, 'max_utilisateurs' => $utilisateurs,
            'features' => ['stock', 'ventes', 'users'], 'actif' => true,
        ]);
    }

    /** @param  array<array{0: string, 1: string, 2: string, 3: int}>  $paiements  [mode, référence, statut, il y a N mois] */
    private function client(string $nom, string $slug, string $boutique, Plan $plan, \DateTimeInterface $fin, array $paiements, User $par): void
    {
        if (Tenant::where('slug', $slug)->exists()) {
            return;
        }

        $tenant = Tenant::create(['nom' => $nom, 'slug' => $slug, 'statut' => 'active']);
        $tenant->boutiques()->create(['nom' => $boutique, 'adresse' => 'Lomé', 'devise' => 'XOF', 'timezone' => 'Africa/Lome', 'statut' => 'active']);
        $expiree = $fin < now();
        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id, 'status' => $expiree ? 'expired' : 'active',
            'starts_at' => now()->subMonths(3), 'ends_at' => $fin, 'billing_provider' => $paiements[0][0],
        ]);
        $tenant->licenses()->create([
            'subscription_id' => $subscription->id, 'status' => $expiree ? 'expired' : 'active',
            'cle' => strtoupper(Str::random(16)), 'activated_at' => now()->subMonths(3), 'expires_at' => $fin, 'quota_usage' => [],
        ]);

        foreach ($paiements as [$mode, $reference, $statut, $ilYa]) {
            $payment = Payment::create([
                'tenant_id' => $tenant->id, 'subscription_id' => $subscription->id, 'amount' => $plan->prix,
                'status' => $statut, 'payment_method' => $mode, 'payment_reference' => $reference,
                'processed_at' => now()->subMonths($ilYa), 'created_by_user_id' => $par->id,
            ]);
            $payment->forceFill(['invoice_number' => LicenceService::numeroFacture($payment), 'created_at' => now()->subMonths($ilYa)])->save();
        }
    }
}
