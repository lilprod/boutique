<?php

namespace Tests\Feature;

use App\Models\Boutique;
use App\Models\LigneVente;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Produit;
use App\Models\Tenant;
use App\Models\User;
use App\Services\VenteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Boutique tenue par plusieurs personnes : chaque motif de pagne appartient à un propriétaire. */
class ProprietairesTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Boutique $boutique;

    private User $admin;

    private User $vendeur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['nom' => 'Afi & Kossi', 'slug' => 'afi-kossi-'.uniqid(), 'statut' => 'active']);
        $this->boutique = $this->tenant->boutiques()->create(['nom' => 'Grand Marché', 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'P', 'slug' => 'p-'.uniqid(), 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 2, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $sub = $this->tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth()]);
        $this->tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => 'PROP-'.uniqid(), 'activated_at' => now(), 'expires_at' => now()->addMonth(), 'quota_usage' => []]);
        $this->admin = $this->compte('admin', 'admin');
        $this->vendeur = $this->compte('vendeur', 'vendeur');
        Parametre::actuel($this->admin)->update(['autorise_yard' => true, 'multi_proprietaires' => true]);
    }

    private function compte(string $id, string $role, ?Boutique $boutique = null): User
    {
        return User::create([
            'nom' => ucfirst($id), 'email' => $id.'-'.uniqid(), 'password' => 'secret123', 'role' => $role, 'actif' => true,
            'tenant_id' => $this->tenant->id, 'boutique_id' => ($boutique ?? $this->boutique)->id,
        ]);
    }

    private function proprietaire(string $nom, array $motifs = [])
    {
        Sanctum::actingAs($this->admin);

        return $this->postJson('/api/proprietaires', ['nom' => $nom, 'motifs' => $motifs]);
    }

    private function produit(string $nom, string $motif, array $override = []): array
    {
        Sanctum::actingAs($this->admin);

        return $this->postJson('/api/produits', $override + [
            'nom' => $nom, 'type' => 'Wax', 'motif' => $motif, 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 30000, 'prix_yard' => 6000, 'prix_achat_pagne' => 20000,
            'variantes' => [['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 6, 'stock' => 60]],
        ])->assertOk()->json();
    }

    public function test_le_motif_attribue_le_produit_et_reattribue_les_existants(): void
    {
        $afi = $this->proprietaire('Afi', ['Damier'])->assertCreated()->json();
        $floral = $this->produit('Ankara Fleurs', 'Floral'); // aucun propriétaire pour ce motif, pour l'instant

        $damier = $this->produit('Wax Damier', 'Damier');
        $this->assertSame($afi['id'], $damier['proprietaire_id']);
        $this->assertNull($floral['proprietaire_id']);

        $kossi = $this->proprietaire('Kossi', ['Floral'])->assertCreated()->json();
        $this->assertSame($kossi['id'], Produit::find($floral['id'])->proprietaire_id);
        $this->assertSame(1, $kossi['produits_count']);
    }

    public function test_un_motif_n_appartient_qu_a_une_personne(): void
    {
        $this->proprietaire('Afi', ['Damier'])->assertCreated();

        $this->proprietaire('Kossi', ['damier']) // la casse ne compte pas
            ->assertStatus(422)->assertJsonPath('message', 'Le motif « Damier » appartient déjà à Afi.');
    }

    public function test_attribution_explicite_limitee_a_la_boutique(): void
    {
        $autre = $this->tenant->boutiques()->create(['nom' => 'Autre', 'statut' => 'active']);
        Sanctum::actingAs($this->compte('admin2', 'admin', $autre));
        $etranger = $this->postJson('/api/proprietaires', ['nom' => 'Étranger'])->assertCreated()->json();

        Sanctum::actingAs($this->admin);
        $this->postJson('/api/produits', [
            'nom' => 'X', 'type' => 'Wax', 'motif' => 'Uni', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 1000, 'prix_yard' => 0, 'prix_achat_pagne' => 500, 'proprietaire_id' => $etranger['id'],
            'variantes' => [['coloris' => 'A', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1]],
        ])->assertStatus(422)->assertJsonPath('message', 'Propriétaire inconnu dans cette boutique.');
        $this->assertCount(0, $this->getJson('/api/proprietaires')->json()); // la liste est propre à la boutique
    }

    /** Un ticket mélange les pagnes des deux : chacun reçoit sa part, remise globale répartie au prorata. */
    public function test_rapport_reparti_par_proprietaire_avec_remise_globale(): void
    {
        $afi = $this->proprietaire('Afi', ['Damier'])->json();
        $kossi = $this->proprietaire('Kossi', ['Floral'])->json();
        $damier = $this->produit('Wax Damier', 'Damier')['variantes'][0]['id'];
        $floral = $this->produit('Ankara Fleurs', 'Floral')['variantes'][0]['id'];
        $libre = $this->produit('Bazin', 'Uni')['variantes'][0]['id'];

        Sanctum::actingAs($this->vendeur);
        $vente = fn (array $lignes, int $remise = 0) => $this->postJson('/api/ventes', [
            'remise_type' => 'fcfa', 'remise_valeur' => $remise, 'paiement' => ['mode' => 'especes'],
            'lignes' => array_map(fn ($l) => $l + ['unite' => 'pagne', 'quantite' => 1], $lignes),
        ])->assertCreated()->json();

        // 2 pagnes d'Afi (60 000) + 1 de Kossi (30 000) = 90 000, remise de 3 000 FCFA -> 58 000 / 29 000.
        $mixte = $vente([['variante_id' => $damier, 'quantite' => 2], ['variante_id' => $floral]], 3000);
        $this->assertSame(87000, $mixte['total']);
        $this->assertSame(87000, (int) LigneVente::where('vente_id', $mixte['id'])->sum('net'));
        $this->assertEqualsCanonicalizing([58000, 29000], LigneVente::where('vente_id', $mixte['id'])->pluck('net')->all());
        $vente([['variante_id' => $libre]]);
        $annulee = $vente([['variante_id' => $floral]]);

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$annulee['id']}/annuler", ['motif' => 'Erreur'])->assertOk();

        $r = collect($this->getJson('/api/rapports/proprietaires')->assertOk()->json('proprietaires'))->keyBy('nom');
        $this->assertSame(58000, $r['Afi']['ventes']['ca']);
        $this->assertSame(29000, $r['Kossi']['ventes']['ca']); // la vente annulée ne compte pas
        $this->assertSame(30000, $r['Non attribué']['ventes']['ca']);
        $this->assertSame(58000 - 40000, $r['Afi']['ventes']['marge']);
        $this->assertEquals(48, $r['Afi']['stock']['quantite']); // 60 - 12 yards
        $this->assertSame(160000, $r['Afi']['stock']['valeur']); // 48 yards = 8 pagnes × 20 000
        $this->assertSame([$afi['id'], $kossi['id']], [$r['Afi']['id'], $r['Kossi']['id']]);

        // Réattribuer le motif plus tard ne réécrit pas l'historique des ventes.
        $this->putJson("/api/proprietaires/{$kossi['id']}", ['nom' => 'Kossi', 'motifs' => ['Floral', 'Damier']])->assertStatus(422);
        $this->putJson("/api/proprietaires/{$afi['id']}", ['nom' => 'Afi', 'motifs' => []])->assertOk();
        $this->putJson("/api/proprietaires/{$kossi['id']}", ['nom' => 'Kossi', 'motifs' => ['Floral', 'Damier']])->assertOk();
        $r = collect($this->getJson('/api/rapports/proprietaires')->json('proprietaires'))->keyBy('nom');
        $this->assertSame(58000, $r['Afi']['ventes']['ca']);
        $this->assertEquals(0, $r['Afi']['stock']['quantite']); // le stock, lui, a changé de main
    }

    public function test_suppression_refusee_si_le_proprietaire_a_des_ventes(): void
    {
        $afi = $this->proprietaire('Afi', ['Damier'])->json();
        $kossi = $this->proprietaire('Kossi', ['Floral'])->json();
        $vid = $this->produit('Wax Damier', 'Damier')['variantes'][0]['id'];
        $floral = $this->produit('Ankara Fleurs', 'Floral');
        Sanctum::actingAs($this->vendeur);
        $this->postJson('/api/ventes', ['remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [['variante_id' => $vid, 'unite' => 'pagne', 'quantite' => 1]]])->assertCreated();

        Sanctum::actingAs($this->admin);
        $this->deleteJson("/api/proprietaires/{$afi['id']}")->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'désactivez-le'));
        $this->putJson("/api/proprietaires/{$afi['id']}", ['nom' => 'Afi', 'actif' => false, 'motifs' => ['Damier']])->assertOk()->assertJsonPath('actif', false);

        $this->deleteJson("/api/proprietaires/{$kossi['id']}")->assertNoContent();
        $this->assertNull(Produit::find($floral['id'])->proprietaire_id);
    }

    public function test_un_vendeur_voit_les_proprietaires_sans_pouvoir_les_gerer(): void
    {
        $this->proprietaire('Afi', ['Damier']);
        Sanctum::actingAs($this->vendeur);

        $this->assertCount(1, $this->getJson('/api/proprietaires')->assertOk()->json());
        $this->postJson('/api/proprietaires', ['nom' => 'Moi'])->assertForbidden();
        $this->getJson('/api/rapports/proprietaires')->assertForbidden();
    }

    public function test_repartition_de_la_remise_tombe_juste(): void
    {
        $nets = VenteService::repartirRemise([10000, 10000, 10000], 1000);
        $this->assertSame(29000, array_sum($nets));
        $this->assertSame([10000, 5000], VenteService::repartirRemise([10000, 5000], 0));
    }
}
