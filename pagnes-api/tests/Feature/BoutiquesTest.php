<?php

namespace Tests\Feature;

use App\Models\Boutique;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Produit;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Création de boutiques par le gérant (limite de la formule) et ouverture d'une boutique avec X-Boutique. */
class BoutiquesTest extends TestCase
{
    use RefreshDatabase;

    /** Entreprise abonnée à une formule de `$maxBoutiques` boutiques, avec sa première boutique, son gérant et un vendeur. */
    private function entreprise(int $maxBoutiques = 2): array
    {
        $s = 'bq-'.Str::lower(Str::random(8));
        $plan = Plan::create(['nom' => $s, 'slug' => $s, 'prix' => 1000, 'intervalle' => 'month', 'max_boutiques' => $maxBoutiques, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $tenant = Tenant::create(['nom' => $s, 'slug' => $s, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $s.' principale', 'statut' => 'active']);
        $sub = $tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'billing_provider' => 'cash']);
        $tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => strtoupper($s), 'activated_at' => now(), 'expires_at' => now()->addMonth()]);
        $compte = fn (string $role) => User::factory()->create([
            'nom' => $role, 'email' => $role.'-'.$s, 'role' => $role, 'actif' => true, 'is_super_admin' => false,
            'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id,
        ]);

        return ['tenant' => $tenant, 'plan' => $plan, 'boutique' => $boutique, 'gerant' => $compte('tenant_admin'), 'badmin' => $compte('boutique_admin'), 'vendeur' => $compte('vendeur'), 's' => $s];
    }

    private function produit(Boutique $b, string $nom): Produit
    {
        return Produit::create([
            'tenant_id' => $b->tenant_id, 'boutique_id' => $b->id, 'nom' => $nom, 'type' => 'Wax', 'yards_par_pagne' => 6,
            'vend_pagne' => true, 'vend_yard' => false, 'prix_pagne' => 6000, 'prix_yard' => 0, 'prix_achat_pagne' => 3000,
        ]);
    }

    public function test_le_gerant_cree_une_boutique_dans_la_limite_de_sa_formule(): void
    {
        $c = $this->entreprise(2);
        Sanctum::actingAs($c['gerant']);

        $r = $this->postJson('/api/tenant/boutiques', ['nom' => 'Pagnes Bè', 'adresse' => 'Bè, Lomé', 'telephone' => '+228 90 00 00 01'])
            ->assertCreated()->assertJsonPath('nom', 'Pagnes Bè')->assertJsonPath('statut', 'active');

        // Ses paramètres existent déjà, au nom de la boutique (ticket, en-tête de l'application).
        $p = Parametre::where('boutique_id', $r->json('id'))->firstOrFail();
        $this->assertSame('Pagnes Bè', $p->boutique);
        $this->assertSame($c['tenant']->id, (int) $p->tenant_id);

        // Formule de 2 boutiques : la troisième est refusée.
        $this->postJson('/api/tenant/boutiques', ['nom' => 'Une de trop'])->assertStatus(422);
        $this->assertSame(2, $c['tenant']->boutiques()->count());
        $this->getJson('/api/tenant/boutiques')->assertOk()->assertJsonCount(2);
    }

    public function test_une_formule_retiree_du_catalogue_permet_toujours_d_ajouter(): void
    {
        $c = $this->entreprise(3);
        $c['plan']->update(['actif' => false]); // formule plus vendue, toujours valable pour ce client
        Sanctum::actingAs($c['gerant']);

        $this->postJson('/api/tenant/boutiques', ['nom' => 'B2'])->assertCreated();
        $this->postJson('/api/tenant/boutiques', ['nom' => 'B3'])->assertCreated();
    }

    public function test_seul_le_gerant_cree_une_boutique(): void
    {
        $c = $this->entreprise();
        foreach (['vendeur', 'badmin'] as $qui) {
            Sanctum::actingAs($c[$qui]);
            $this->postJson('/api/tenant/boutiques', ['nom' => 'Pirate'])->assertForbidden();
        }
        $this->assertSame(1, $c['tenant']->boutiques()->count());
    }

    public function test_le_gerant_travaille_dans_la_boutique_ouverte_avec_x_boutique(): void
    {
        $c = $this->entreprise();
        $this->produit($c['boutique'], 'Wax principale');
        Sanctum::actingAs($c['gerant']);
        $nouvelle = $this->postJson('/api/tenant/boutiques', ['nom' => 'Pagnes Bè'])->json('id');

        // Sans en-tête : sa boutique de rattachement.
        $this->getJson('/api/produits')->assertOk()->assertJsonPath('0.nom', 'Wax principale');
        $this->getJson('/api/parametres')->assertJsonPath('boutique_id', $c['boutique']->id);

        // Avec l'en-tête : la nouvelle boutique, vide, avec ses propres paramètres.
        $h = ['X-Boutique' => (string) $nouvelle];
        $this->getJson('/api/produits', $h)->assertOk()->assertJsonCount(0);
        $this->getJson('/api/parametres', $h)->assertJsonPath('boutique', 'Pagnes Bè');
        $this->getJson('/api/me', $h)->assertJsonPath('boutique', 'Pagnes Bè');

        // Un compte créé depuis cette boutique y est rattaché.
        $this->postJson('/api/users', ['nom' => 'Vendeuse Bè', 'email' => 'v-be-'.$c['s'], 'mot_de_passe' => 'motdepasse', 'role' => 'vendeur', 'actif' => true], $h)
            ->assertCreated()->assertJsonPath('boutique_id', $nouvelle);

        // Le rattachement du gérant en base ne change jamais.
        $this->assertSame($c['boutique']->id, $c['gerant']->fresh()->boutique_id);
    }

    public function test_x_boutique_refuse_une_boutique_d_une_autre_entreprise_ou_fermee(): void
    {
        $c = $this->entreprise();
        $autre = $this->entreprise();
        $fermee = $c['tenant']->boutiques()->create(['nom' => 'Fermée', 'statut' => 'inactive']);
        Sanctum::actingAs($c['gerant']);

        $this->getJson('/api/produits', ['X-Boutique' => (string) $autre['boutique']->id])->assertForbidden();
        $this->getJson('/api/produits', ['X-Boutique' => (string) $fermee->id])->assertForbidden();
        $this->getJson('/api/produits', ['X-Boutique' => 'abc'])->assertForbidden();
    }

    public function test_les_autres_roles_restent_dans_leur_boutique_malgre_x_boutique(): void
    {
        $c = $this->entreprise();
        $this->produit($c['boutique'], 'Wax principale');
        Sanctum::actingAs($c['gerant']);
        $nouvelle = $this->postJson('/api/tenant/boutiques', ['nom' => 'Pagnes Bè'])->json('id');
        $this->produit(Boutique::findOrFail($nouvelle), 'Wax Bè');

        foreach (['vendeur', 'badmin'] as $qui) {
            Sanctum::actingAs($c[$qui]);
            $this->getJson('/api/produits', ['X-Boutique' => (string) $nouvelle])->assertOk()
                ->assertJsonCount(1)->assertJsonPath('0.nom', 'Wax principale');
        }
    }
}
