<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Promotion;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Variante;
use App\Models\Vente;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Caisse hors ligne : la tablette envoie plus tard une vente encaissée sans réseau. Elle est enregistrée
 * à son heure réelle, sans doublon si elle est renvoyée, et ce qui a changé entre-temps (stock, montant,
 * remise) est signalé à l'administrateur au lieu de bloquer la vente.
 */
class CaisseHorsLigneTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $vendeur;
    private Variante $variante;

    protected function setUp(): void
    {
        parent::setUp();
        $s = 'hl-'.Str::lower(Str::random(8));
        $plan = Plan::create(['nom' => $s, 'slug' => $s, 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 1, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $tenant = Tenant::create(['nom' => $s, 'slug' => $s, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $s, 'statut' => 'active']);
        $sub = $tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'billing_provider' => 'cash']);
        $tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => strtoupper($s), 'activated_at' => now(), 'expires_at' => now()->addMonth()]);
        $compte = fn (string $role) => User::factory()->create(['nom' => $role, 'email' => $role.'-'.$s, 'role' => $role, 'actif' => true, 'is_super_admin' => false, 'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id]);
        $this->admin = $compte('boutique_admin');
        $this->vendeur = $compte('vendeur');
        Parametre::actuel($this->admin)->update(['unite_stock' => 'pagne', 'remise_max_vendeur' => 10]);

        Sanctum::actingAs($this->admin);
        $produit = $this->postJson('/api/produits', [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 10000, 'prix_yard' => 0, 'prix_achat_pagne' => 6000,
            'variantes' => [['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 1, 'stock' => 2]],
        ])->assertOk()->json();
        $this->variante = Variante::findOrFail($produit['variantes'][0]['id']);
    }

    private function venteHorsLigne(array $extra = [], int $quantite = 1, ?string $uuid = null, ?string $le = null, ?int $total = null)
    {
        Sanctum::actingAs($this->vendeur);

        return $this->postJson('/api/ventes', $extra + [
            'uuid' => $uuid ?? (string) Str::uuid(),
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [['variante_id' => $this->variante->id, 'unite' => 'pagne', 'quantite' => $quantite]],
            'hors_ligne' => ['vendue_le' => $le ?? now()->subHours(2)->toIso8601String(), 'total' => $total ?? 10000 * $quantite],
        ]);
    }

    public function test_une_vente_hors_ligne_garde_son_heure_et_n_est_jamais_enregistree_deux_fois(): void
    {
        $uuid = (string) Str::uuid();
        $le = now()->subHours(3)->startOfMinute();

        $r = $this->venteHorsLigne(uuid: $uuid, le: $le->toIso8601String())->assertCreated()
            ->assertJsonPath('hors_ligne', true)->assertJsonPath('total_encaisse', 10000)->assertJsonPath('anomalies', null);
        $vente = Vente::findOrFail($r->json('id'));
        $this->assertTrue($vente->created_at->equalTo($le));                 // heure réelle de la vente
        $this->assertNotNull($vente->synchronisee_le);
        $this->assertTrue(Mouvement::where('vente_id', $vente->id)->firstOrFail()->created_at->equalTo($le));

        // Renvoi (coupure pendant la réponse) : même vente, rien de nouveau.
        $this->venteHorsLigne(uuid: $uuid)->assertOk()->assertJsonPath('id', $vente->id);
        $this->assertSame(1, Vente::count());
        $this->assertSame(1.0, (float) $this->variante->fresh()->stock);
    }

    public function test_stock_insuffisant_a_la_reception_la_vente_est_acceptee_et_le_stock_reste_a_zero(): void
    {
        // Stock 2 ; la tablette hors ligne en a vendu 3 (une vente en ligne était passée entre-temps).
        $r = $this->venteHorsLigne(quantite: 3)->assertCreated();

        // Jamais négatif : le stock s'arrête à 0, le pagne manquant est noté sur la ligne et signalé.
        $this->assertSame(0.0, (float) $this->variante->fresh()->stock);
        $this->assertSame('stock', $r->json('anomalies.0.type'));
        $this->assertSame(1, (int) $r->json('anomalies.0.manque'));
        $this->assertSame(1.0, (float) $r->json('lignes.0.manque_stock'));
        $this->assertSame(-2.0, (float) Mouvement::where('vente_id', $r->json('id'))->sum('quantite')); // seuls 2 sont sortis


        // En ligne, la même vente reste refusée.
        Sanctum::actingAs($this->vendeur);
        $this->postJson('/api/ventes', [
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [['variante_id' => $this->variante->id, 'unite' => 'pagne', 'quantite' => 1]],
        ])->assertStatus(422);

        // L'administrateur est prévenu par la cloche ; le vendeur, non.
        Sanctum::actingAs($this->admin);
        $this->assertContains('Ventes hors ligne à vérifier', collect($this->getJson('/api/notifications')->json())->pluck('titre')->all());
        Sanctum::actingAs($this->vendeur);
        $this->assertNotContains('Ventes hors ligne à vérifier', collect($this->getJson('/api/notifications')->json())->pluck('titre')->all());

        // Annulée, elle ne rend que ce qui est vraiment sorti du stock.
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/ventes/'.$r->json('id').'/annuler', ['motif' => 'Erreur'])->assertOk();
        $this->assertSame(2.0, (float) $this->variante->fresh()->stock);
    }

    public function test_les_promotions_sont_celles_du_jour_de_la_vente_et_un_ecart_est_signale(): void
    {
        // Promotion de −20 % terminée hier : elle valait encore pour une vente faite hier hors ligne.
        Promotion::create([
            'tenant_id' => $this->admin->tenant_id, 'boutique_id' => $this->admin->boutique_id, 'nom' => 'Fin de stock',
            'type_remise' => 'pct', 'valeur' => 20, 'cible' => 'tout', 'quantite_min' => 0,
            'debut' => now()->subDays(5)->toDateString(), 'fin' => now()->subDay()->toDateString(), 'actif' => true,
        ]);

        $hier = $this->venteHorsLigne(le: now()->subDay()->setTime(10, 0)->toIso8601String(), total: 8000)->assertCreated();
        $this->assertSame(8000, $hier->json('total'));
        $this->assertNull($hier->json('anomalies'));

        // La tablette a encaissé 8 000 aujourd'hui (catalogue en cache périmé) : enregistrée à 10 000, écart signalé.
        $auj = $this->venteHorsLigne(total: 8000)->assertCreated();
        $this->assertSame(10000, $auj->json('total'));
        $this->assertSame(['type' => 'ecart', 'encaisse' => 8000, 'calcule' => 10000], $auj->json('anomalies.0'));
    }

    public function test_plafond_de_remise_depasse_hors_ligne_signale_et_points_refuses(): void
    {
        // Plafond vendeur abaissé à 10 % pendant que la tablette vendait avec 15 %.
        $r = $this->venteHorsLigne(['remise_type' => 'pct', 'remise_valeur' => 15], total: 8500)->assertCreated();
        $this->assertSame('remise', $r->json('anomalies.0.type'));

        // Les points ne s'utilisent pas hors ligne (solde inconnu de la tablette).
        $client = Client::create(['tenant_id' => $this->admin->tenant_id, 'boutique_id' => $this->admin->boutique_id, 'nom' => 'Ama']);
        $this->venteHorsLigne(['client_id' => $client->id, 'points_utilises' => 100])->assertStatus(422);
    }

    public function test_deux_lignes_du_meme_coloris_se_partagent_le_manque(): void
    {
        Sanctum::actingAs($this->vendeur);
        $r = $this->postJson('/api/ventes', [
            'uuid' => (string) Str::uuid(), 'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [
                ['variante_id' => $this->variante->id, 'unite' => 'pagne', 'quantite' => 2],
                ['variante_id' => $this->variante->id, 'unite' => 'pagne', 'quantite' => 2],
            ],
            'hors_ligne' => ['vendue_le' => now()->subHour()->toIso8601String(), 'total' => 40000],
        ])->assertCreated();

        // Stock 2 pour 4 vendus : la première ligne sort ses 2 pagnes, la seconde n'en trouve plus.
        $this->assertSame([0.0, 2.0], array_map('floatval', array_column($r->json('lignes'), 'manque_stock')));
        $this->assertSame(0.0, (float) $this->variante->fresh()->stock);
    }

    public function test_la_base_refuse_un_stock_negatif(): void
    {
        $this->expectException(\Illuminate\Database\QueryException::class);
        Variante::whereKey($this->variante->id)->update(['stock' => -1]);
    }

    public function test_une_vente_hors_ligne_trop_ancienne_ou_datee_dans_le_futur(): void
    {
        $this->venteHorsLigne(le: now()->subDays(31)->toIso8601String())->assertStatus(422);

        // Horloge de la tablette en avance : ramenée à l'heure de réception.
        $r = $this->venteHorsLigne(le: now()->addDay()->toIso8601String())->assertCreated();
        $this->assertTrue(Vente::findOrFail($r->json('id'))->created_at->lessThanOrEqualTo(now()));
    }

    // Historique des prix

    public function test_chaque_changement_de_prix_est_historise(): void
    {
        $produit = $this->variante->produit;
        Sanctum::actingAs($this->admin);
        $this->assertCount(1, $this->getJson('/api/produits/'.$produit->id.'/prix')->assertOk()->json()); // création

        // Changement sans toucher aux prix : rien de nouveau. Nouveau prix de vente, puis nouveau prix d'achat (entrée de stock).
        $produit->update(['motif' => 'Damier']);
        $produit->update(['prix_pagne' => 12000]);
        $this->postJson('/api/variantes/'.$this->variante->id.'/entree', ['unite' => 'pagne', 'quantite' => 5, 'prix_achat_pagne' => 7000])->assertOk();

        $h = $this->getJson('/api/produits/'.$produit->id.'/prix')->assertOk()->json();
        $this->assertCount(3, $h);
        $this->assertSame([7000, 12000], [$h[0]['prix_achat_pagne'], $h[0]['prix_pagne']]);
        $this->assertSame($this->admin->nom, $h[0]['utilisateur']['nom']);

        Sanctum::actingAs($this->vendeur);
        $this->getJson('/api/produits/'.$produit->id.'/prix')->assertForbidden();
    }

    public function test_une_vente_hors_ligne_prend_les_prix_du_moment_de_la_vente(): void
    {
        // Les prix d'il y a deux heures : 10 000 la vente, 6 000 l'achat. Le prix passe ensuite à 12 000.
        \App\Models\PrixProduit::where('produit_id', $this->variante->produit_id)->update(['valable_du' => now()->subDays(2)]);
        $this->travel(-1)->hours(); // le changement de prix date d'il y a une heure
        $this->variante->produit->update(['prix_pagne' => 12000, 'prix_achat_pagne' => 7000]);
        $this->travelBack();

        // Vente faite il y a deux heures, hors ligne, encaissée 10 000 : aucun écart, marge au prix d'achat d'alors.
        $r = $this->venteHorsLigne(le: now()->subHours(2)->toIso8601String(), total: 10000)->assertCreated();
        $this->assertSame(10000, $r->json('total'));
        $this->assertNull($r->json('anomalies'));
        $this->assertSame(4000, Vente::findOrFail($r->json('id'))->marge);

        // Une vente hors ligne faite après le changement prend le nouveau prix.
        $this->venteHorsLigne(le: now()->subMinutes(10)->toIso8601String(), total: 12000)->assertCreated()->assertJsonPath('total', 12000);
    }
}
