<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Mouvement;
use App\Models\Plan;
use App\Models\Produit;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SaasBusinessIsolationTest extends TestCase
{
    public function test_stock_history_and_dashboard_are_scoped_to_current_boutique(): void
    {
        $namespace = 'isolation-'.Str::lower(Str::random(8));
        $plan = Plan::create([
            'nom' => 'Isolation', 'slug' => $namespace, 'prix' => 1000, 'intervalle' => 'month',
            'max_boutiques' => 2, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true,
        ]);
        $first = $this->createContext($namespace.'-first', $plan);
        $second = $this->createContext($namespace.'-second', $plan);
        $firstSaleNumber = random_int(100000, 999990);

        foreach ([$first, $second] as $index => $context) {
            Mouvement::create([
                'tenant_id' => $context['tenant']->id,
                'boutique_id' => $context['boutique']->id,
                'variante_id' => $context['variante']->id,
                'type' => 'entree',
                'quantite' => 4,
                'user_id' => $context['admin']->id,
                'motif' => 'Réception',
            ]);

            Vente::create([
                'tenant_id' => $context['tenant']->id,
                'boutique_id' => $context['boutique']->id,
                'numero' => $firstSaleNumber + $index,
                'vendeur_id' => $context['admin']->id,
                'sous_total' => 1000,
                'remise_type' => 'pct',
                'remise_valeur' => 0,
                'remise_montant' => 0,
                'total' => 1000,
                'marge' => 300,
                'paiement_mode' => 'especes',
                'statut' => 'validee',
            ]);
        }

        Sanctum::actingAs($first['admin']);

        $products = $this->getJson('/api/produits')->assertOk();
        $this->assertCount(1, $products->json());
        $this->putJson('/api/produits/'.$second['produit']->id, [])->assertNotFound();
        $movements = $this->getJson('/api/mouvements')->assertOk();
        $this->assertCount(1, $movements->json('data'));
        $dashboard = $this->getJson('/api/tableau-de-bord')->assertOk()->json();
        $this->assertSame(['ventes' => 1, 'ca' => 1000, 'marge' => 300], $dashboard['jour']);

        $this->postJson('/api/variantes/'.$second['variante']->id.'/ajuster', [
            'nouveau_stock' => 0,
            'motif' => 'Test inter-boutique',
        ])->assertNotFound();
        $this->assertSame(20.0, (float) $second['variante']->fresh()->stock);
    }

    public function test_user_management_and_sales_reject_other_tenant_records(): void
    {
        $namespace = 'users-'.Str::lower(Str::random(8));
        $plan = Plan::create([
            'nom' => 'Users', 'slug' => $namespace, 'prix' => 1000, 'intervalle' => 'month',
            'max_boutiques' => 2, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true,
        ]);
        $first = $this->createContext($namespace.'-first', $plan);
        $second = $this->createContext($namespace.'-second', $plan);
        $otherUser = User::factory()->create([
            'nom' => 'Other user', 'email' => $namespace.'-other@example.com', 'role' => 'vendeur',
            'tenant_id' => $second['tenant']->id, 'boutique_id' => $second['boutique']->id,
        ]);
        $otherClient = Client::create([
            'tenant_id' => $second['tenant']->id,
            'boutique_id' => $second['boutique']->id,
            'nom' => 'Other tenant client',
        ]);

        Sanctum::actingAs($first['admin']);
        $userList = $this->getJson('/api/users')->assertOk();
        $this->assertContains($first['admin']->id, array_column($userList->json(), 'id'));
        $this->assertNotContains($otherUser->id, array_column($userList->json(), 'id'));
        $this->putJson('/api/users/'.$otherUser->id, [
            'nom' => 'Changed', 'email' => $otherUser->email, 'role' => 'vendeur', 'actif' => true,
        ])->assertNotFound();

        $created = $this->postJson('/api/users', [
            'nom' => 'New seller', 'email' => $namespace.'-new@example.com', 'mot_de_passe' => 'secret123',
            'role' => 'vendeur', 'actif' => true,
        ])->assertCreated();
        $this->assertDatabaseHas('users', [
            'id' => $created->json('id'),
            'tenant_id' => $first['tenant']->id,
            'boutique_id' => $first['boutique']->id,
        ]);

        $this->postJson('/api/ventes', [
            'client_id' => $otherClient->id,
            'remise_type' => 'pct',
            'remise_valeur' => 0,
            'paiement' => ['mode' => 'especes'],
            'lignes' => [[
                'variante_id' => $first['variante']->id,
                'unite' => 'yard',
                'quantite' => 1,
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors('client_id');
    }

    public function test_super_admin_is_forbidden_from_unscoped_boutique_endpoints(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Super Admin',
            'email' => 'super-admin-shop-'.Str::lower(Str::random(8)).'@example.com',
            'role' => 'super_admin',
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $this->getJson('/api/produits')->assertForbidden();
        $this->getJson('/api/mouvements')->assertForbidden();
        $this->postJson('/api/clients', ['nom' => 'Unscoped'])->assertForbidden();
    }

    private function createContext(string $slug, Plan $plan): array
    {
        $tenant = Tenant::create(['nom' => $slug, 'slug' => $slug, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $slug.' shop', 'statut' => 'active']);
        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(14),
            'billing_provider' => 'manual',
        ]);
        $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => strtoupper($slug),
            'activated_at' => now(),
            'expires_at' => now()->addMonth(),
            'quota_usage' => ['boutiques' => 1, 'utilisateurs' => 1],
        ]);
        $admin = User::factory()->create([
            'nom' => $slug.' admin',
            'email' => $slug.'-admin@example.com',
            'role' => 'boutique_admin',
            'tenant_id' => $tenant->id,
            'boutique_id' => $boutique->id,
            'is_super_admin' => false,
        ]);
        $produit = Produit::create([
            'tenant_id' => $tenant->id,
            'boutique_id' => $boutique->id,
            'nom' => $slug.' wax',
            'type' => 'Wax',
            'motif' => 'Uni',
            'origine' => 'Togo',
            'yards_par_pagne' => 6,
            'vend_pagne' => true,
            'vend_yard' => true,
            'prix_pagne' => 6000,
            'prix_yard' => 1000,
            'prix_achat_pagne' => 3000,
        ]);
        $variante = $produit->variantes()->create([
            'tenant_id' => $tenant->id,
            'boutique_id' => $boutique->id,
            'coloris' => 'Bleu',
            'sku' => strtoupper($slug),
            'c1' => '#123456',
            'c2' => '#654321',
            'stock' => 20,
            'seuil' => 2,
        ]);

        return compact('tenant', 'boutique', 'admin', 'produit', 'variante');
    }
}
