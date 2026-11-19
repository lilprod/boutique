<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Database\Seeders\ComptesSaasSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Non-régression des points 8, 9, 12 et 13 de l'audit : mots de passe, production, portées, pagination. */
class MiseEnProductionTest extends TestCase
{
    use RefreshDatabase;

    /** Entreprise abonnée, une boutique, son gérant et un vendeur. */
    private function entreprise(): array
    {
        $s = 'prod-'.Str::lower(Str::random(8));
        $plan = Plan::create(['nom' => $s, 'slug' => $s, 'prix' => 1000, 'intervalle' => 'month', 'max_boutiques' => 1, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $tenant = Tenant::create(['nom' => $s, 'slug' => $s, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $s, 'statut' => 'active']);
        $sub = $tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'billing_provider' => 'cash']);
        $tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => strtoupper($s), 'activated_at' => now(), 'expires_at' => now()->addMonth()]);
        $compte = fn (string $role) => User::factory()->create([
            'nom' => $role, 'email' => $role.'-'.$s, 'role' => $role, 'actif' => true, 'is_super_admin' => false,
            'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id,
        ]);

        return ['tenant' => $tenant, 'boutique' => $boutique, 'sub' => $sub, 'gerant' => $compte('tenant_admin'), 'vendeur' => $compte('vendeur'), 's' => $s];
    }

    // Point 8 — mots de passe et comptes de démonstration

    public function test_un_mot_de_passe_de_moins_de_8_caracteres_est_refuse(): void
    {
        $c = $this->entreprise();
        Sanctum::actingAs($c['gerant']);
        $compte = ['nom' => 'N', 'email' => 'n-'.$c['s'], 'role' => 'vendeur', 'actif' => true];

        $this->postJson('/api/users', $compte + ['mot_de_passe' => '1234567'])->assertStatus(422)->assertJsonValidationErrors('mot_de_passe');
        $this->postJson('/api/users', $compte + ['mot_de_passe' => '12345678'])->assertCreated();
    }

    public function test_les_donnees_de_demonstration_sont_refusees_en_production(): void
    {
        $this->app['env'] = 'production';

        foreach ([DemoSeeder::class, ComptesSaasSeeder::class] as $seeder) {
            try {
                // Appel direct : en production, `db:seed` demanderait d'abord une confirmation.
                $this->app->make($seeder)->run();
                $this->fail($seeder.' a tourné en production.');
            } catch (\RuntimeException $e) {
                $this->assertStringContainsString('production', $e->getMessage());
            }
        }
        $this->assertDatabaseMissing('users', ['email' => 'admin']);
        $this->assertDatabaseMissing('users', ['email' => 'superadmin']);
    }

    public function test_le_seeder_par_defaut_ne_cree_aucun_compte(): void
    {
        $avant = User::count();
        $this->seed();
        $this->assertSame($avant, User::count());
    }

    public function test_la_commande_cree_le_super_admin_avec_un_mot_de_passe_saisi(): void
    {
        $this->artisan('plateforme:super-admin', ['identifiant' => 'plateforme'])
            ->expectsQuestion('Mot de passe (12 caractères au moins)', 'un-long-mot-de-passe')
            ->expectsQuestion('Confirmez le mot de passe', 'un-long-mot-de-passe')
            ->assertSuccessful();

        $sa = User::where('email', 'plateforme')->firstOrFail();
        $this->assertTrue($sa->is_super_admin);
        $this->assertNull($sa->tenant_id);
        $this->assertTrue(Hash::check('un-long-mot-de-passe', $sa->password));

        $this->artisan('plateforme:super-admin', ['identifiant' => 'court'])
            ->expectsQuestion('Mot de passe (12 caractères au moins)', 'court')
            ->assertFailed();
        $this->assertDatabaseMissing('users', ['email' => 'court']);
    }

    // Point 9 — production

    public function test_les_reponses_portent_les_en_tetes_de_securite(): void
    {
        foreach ([$this->getJson('/api/me'), $this->postJson('/api/login', [])] as $r) { // 401 et 422 compris
            $r->assertHeader('X-Content-Type-Options', 'nosniff')
                ->assertHeader('X-Frame-Options', 'DENY')
                ->assertHeader('Referrer-Policy', 'no-referrer');
            $this->assertStringContainsString("default-src 'none'", $r->headers->get('Content-Security-Policy'));
            $this->assertStringContainsString("frame-ancestors 'none'", $r->headers->get('Content-Security-Policy'));
        }
    }

    public function test_le_mode_debug_est_coupe_en_production(): void
    {
        config(['app.debug' => true]);
        $this->app['env'] = 'production';

        (new AppServiceProvider($this->app))->boot();

        $this->assertFalse(config('app.debug'));
    }

    // Point 12 — portée sans utilisateur

    public function test_une_portee_sans_utilisateur_ne_renvoie_rien(): void
    {
        $c = $this->entreprise();
        Client::create(['nom' => 'Ama', 'tenant_id' => $c['tenant']->id, 'boutique_id' => $c['boutique']->id]);

        $this->assertSame(0, Client::query()->forCurrentTenant(null)->count());
        $this->assertSame(0, Client::query()->forCurrentBoutique(null)->count());
        $this->assertSame(0, Client::query()->forCurrentContext(null)->count());
        $this->assertSame(1, Client::query()->forCurrentContext($c['vendeur'])->count());
    }

    // Point 13 — pagination

    public function test_la_liste_des_clients_est_paginee(): void
    {
        $c = $this->entreprise();
        foreach (range(1, 5) as $i) {
            Client::create(['nom' => 'Client '.$i, 'tenant_id' => $c['tenant']->id, 'boutique_id' => $c['boutique']->id]);
        }
        Sanctum::actingAs($c['vendeur']);

        $this->getJson('/api/clients?per_page=2')->assertOk()
            ->assertJsonPath('total', 5)->assertJsonPath('last_page', 3)->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.nom', 'Client 1')->assertJsonPath('data.0.depense', 0);
        $this->getJson('/api/clients?per_page=2&page=3')->assertJsonCount(1, 'data');
        $this->getJson('/api/clients?per_page=5000')->assertJsonPath('per_page', 200);
    }

    public function test_les_listes_de_paiements_sont_paginees(): void
    {
        $c = $this->entreprise();
        foreach (range(1, 3) as $i) {
            Payment::create([
                'tenant_id' => $c['tenant']->id, 'subscription_id' => $c['sub']->id, 'amount' => 1000 * $i, 'status' => 'paid',
                'payment_method' => 'cash', 'payment_reference' => 'R-'.$c['s'].'-'.$i, 'processed_at' => now(),
            ]);
        }

        Sanctum::actingAs($c['gerant']);
        $this->getJson('/api/tenant/payments?per_page=2')->assertOk()
            ->assertJsonCount(2, 'transactions')->assertJsonPath('pagination.total', 3)->assertJsonPath('pagination.last_page', 2);
        $this->getJson('/api/tenant/payments?per_page=2&page=2')->assertJsonCount(1, 'transactions');

        Sanctum::actingAs(User::factory()->create(['nom' => 'SA', 'email' => 'sa-'.$c['s'], 'role' => 'super_admin', 'actif' => true, 'is_super_admin' => true]));
        $this->getJson('/api/super-admin/payments?per_page=2')->assertOk()
            ->assertJsonCount(2, 'transactions')->assertJsonPath('pagination.total', 3)
            ->assertJsonPath('totals.paid', 3)->assertJsonPath('totals.paid_amount', 6000); // les totaux portent sur toute la liste
    }
}
