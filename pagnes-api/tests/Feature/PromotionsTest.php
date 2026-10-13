<?php

namespace Tests\Feature;

use App\Models\Boutique;
use App\Models\LigneVente;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Promotion;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Promotions appliquées par le serveur à la caisse : une par ligne, la plus avantageuse. */
class PromotionsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Boutique $boutique;

    private User $admin;

    private User $vendeur;

    /** Wax Damier : pagne 30 000, yard 6 000 ; coloris Orange et Vert. */
    private array $wax;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['nom' => 'Promo', 'slug' => 'promo-'.uniqid(), 'statut' => 'active']);
        $this->boutique = $this->tenant->boutiques()->create(['nom' => 'Grand Marché', 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'P', 'slug' => 'p-'.uniqid(), 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 2, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $sub = $this->tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth()]);
        $this->tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => 'PROMO-'.uniqid(), 'activated_at' => now(), 'expires_at' => now()->addMonth(), 'quota_usage' => []]);
        $this->admin = $this->compte('admin', 'admin');
        $this->vendeur = $this->compte('vendeur', 'vendeur');
        Parametre::actuel($this->admin)->update(['autorise_yard' => true, 'remise_max_vendeur' => 15]);

        Sanctum::actingAs($this->admin);
        $this->wax = $this->postJson('/api/produits', [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'motif' => 'Damier', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 30000, 'prix_yard' => 6000, 'prix_achat_pagne' => 20000,
            'variantes' => [
                ['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 6, 'stock' => 120],
                ['coloris' => 'Vert', 'c1' => '#1F8A5B', 'c2' => '#F2C230', 'seuil' => 6, 'stock' => 120],
            ],
        ])->assertOk()->json();
    }

    private function compte(string $id, string $role, ?Boutique $boutique = null): User
    {
        return User::create([
            'nom' => ucfirst($id), 'email' => $id.'-'.uniqid(), 'password' => 'secret123', 'role' => $role, 'actif' => true,
            'tenant_id' => $this->tenant->id, 'boutique_id' => ($boutique ?? $this->boutique)->id,
        ]);
    }

    private function promo(array $champs)
    {
        Sanctum::actingAs($this->admin);

        return $this->postJson('/api/promotions', $champs + ['nom' => 'Promo', 'type_remise' => 'pct', 'valeur' => 10, 'cible' => 'tout']);
    }

    private function vente(array $lignes, ?User $par = null, array $extra = [])
    {
        Sanctum::actingAs($par ?? $this->vendeur);

        return $this->postJson('/api/ventes', $extra + [
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => array_map(fn ($l) => $l + ['variante_id' => $this->wax['variantes'][0]['id'], 'unite' => 'pagne', 'quantite' => 1], $lignes),
        ]);
    }

    public function test_promotion_en_pourcentage_appliquee_et_figee_sur_la_ligne(): void
    {
        $this->promo(['nom' => 'Fête des mères', 'cible' => 'type', 'cible_texte' => 'wax'])->assertCreated();

        $v = $this->vente([[]])->assertCreated()->json();

        $this->assertSame(27000, $v['total']);
        $this->assertSame('Fête des mères', $v['lignes'][0]['promotion_libelle']);
        $this->assertSame(3000, $v['lignes'][0]['remise_promo']);
        $this->assertSame(30000, $v['lignes'][0]['brut']);
    }

    public function test_la_promotion_la_plus_avantageuse_gagne_sans_cumul(): void
    {
        $this->promo(['nom' => 'Tout le magasin', 'valeur' => 5])->assertCreated();
        $this->promo(['nom' => 'Damier', 'cible' => 'motif', 'cible_texte' => 'Damier', 'valeur' => 15])->assertCreated();

        $v = $this->vente([[]])->assertCreated()->json();
        $this->assertSame('Damier', $v['lignes'][0]['promotion_libelle']);
        $this->assertSame(25500, $v['total']); // 15 %, pas 20 %
    }

    public function test_remise_en_fcfa_par_unite_precise(): void
    {
        $this->promo(['type_remise' => 'fcfa', 'valeur' => 2000])->assertStatus(422)->assertJsonValidationErrors('unite');
        $this->promo(['nom' => '−2 000 le pagne', 'type_remise' => 'fcfa', 'valeur' => 2000, 'unite' => 'pagne'])->assertCreated();

        $this->assertSame(56000, $this->vente([['quantite' => 2]])->assertCreated()->json('total'));
        $auYard = $this->vente([['unite' => 'yard', 'quantite' => 3]])->assertCreated()->json();
        $this->assertSame(18000, $auYard['total']); // la promo ne vise que le pagne
        $this->assertNull($auYard['lignes'][0]['promotion_libelle']);
    }

    /** « Dès 3 pagnes » se compte sur tout le panier, même réparti sur plusieurs coloris. */
    public function test_quantite_declenchante_comptee_sur_le_panier(): void
    {
        $this->promo(['nom' => 'Dès 3 pagnes', 'cible' => 'type', 'cible_texte' => 'Wax', 'unite' => 'pagne', 'quantite_min' => 3])->assertCreated();
        $vert = $this->wax['variantes'][1]['id'];

        $this->assertSame(60000, $this->vente([['quantite' => 2]])->assertCreated()->json('total'));
        $v = $this->vente([['quantite' => 2], ['variante_id' => $vert]])->assertCreated()->json();
        $this->assertSame(81000, $v['total']); // 90 000 − 10 %
        $this->assertSame(['Dès 3 pagnes', 'Dès 3 pagnes'], array_column($v['lignes'], 'promotion_libelle'));
    }

    public function test_promotions_inactives_a_venir_ou_terminees_ignorees(): void
    {
        $this->promo(['nom' => 'Désactivée', 'actif' => false])->assertCreated();
        $this->promo(['nom' => 'À venir', 'debut' => now()->addDay()->toDateString()])->assertCreated();
        $this->promo(['nom' => 'Terminée', 'debut' => now()->subDays(10)->toDateString(), 'fin' => now()->subDay()->toDateString()])->assertCreated();
        $this->promo(['nom' => 'Aujourd’hui seulement', 'valeur' => 1, 'debut' => now()->toDateString(), 'fin' => now()->toDateString()])->assertCreated();

        $this->assertSame('Aujourd’hui seulement', $this->vente([[]])->assertCreated()->json('lignes.0.promotion_libelle'));

        Sanctum::actingAs($this->vendeur);
        $this->assertSame(['Aujourd’hui seulement'], array_column($this->getJson('/api/promotions')->assertOk()->json(), 'nom'));
        Sanctum::actingAs($this->admin);
        $this->assertCount(4, $this->getJson('/api/promotions')->json());
    }

    /** Une promotion est décidée par l'administrateur : elle ne consomme pas le plafond de remise du vendeur. */
    public function test_la_promotion_ne_compte_pas_dans_le_plafond_vendeur(): void
    {
        $this->vente([['remise_type' => 'pct', 'remise_valeur' => 20]])->assertStatus(422);

        $this->promo(['nom' => 'Soldes', 'valeur' => 30])->assertCreated();
        $v = $this->vente([['remise_type' => 'pct', 'remise_valeur' => 10]])->assertCreated()->json();
        $this->assertSame(18900, $v['total']); // 30 000 − 30 % = 21 000, puis − 10 %
    }

    public function test_promotion_propre_a_la_boutique_et_reservee_a_l_admin(): void
    {
        $autre = $this->tenant->boutiques()->create(['nom' => 'Autre', 'statut' => 'active']);
        Sanctum::actingAs($this->compte('admin2', 'admin', $autre));
        $this->postJson('/api/promotions', ['nom' => 'Ailleurs', 'type_remise' => 'pct', 'valeur' => 50, 'cible' => 'tout'])->assertCreated();
        $this->postJson('/api/promotions', ['nom' => 'X', 'type_remise' => 'pct', 'valeur' => 5, 'cible' => 'produit', 'produit_id' => $this->wax['id']])
            ->assertStatus(422)->assertJsonValidationErrors('produit_id'); // produit d'une autre boutique

        $this->assertSame(30000, $this->vente([[]])->assertCreated()->json('total'));

        Sanctum::actingAs($this->vendeur);
        $this->postJson('/api/promotions', ['nom' => 'Moi', 'type_remise' => 'pct', 'valeur' => 50, 'cible' => 'tout'])->assertForbidden();
    }

    public function test_validation_et_nom_gele_apres_suppression(): void
    {
        $this->promo(['valeur' => 120])->assertStatus(422)->assertJsonValidationErrors('valeur');
        $this->promo(['debut' => '2026-12-10', 'fin' => '2026-12-01'])->assertStatus(422)->assertJsonValidationErrors('fin');
        $this->promo(['cible' => 'motif'])->assertStatus(422)->assertJsonValidationErrors('cible_texte');

        $id = $this->promo(['nom' => 'Tabaski', 'cible' => 'variante', 'variante_id' => $this->wax['variantes'][0]['id']])->assertCreated()->json('id');
        $v = $this->vente([[]])->assertCreated()->json();
        Sanctum::actingAs($this->admin);
        $this->deleteJson("/api/promotions/{$id}")->assertNoContent();

        $ligne = LigneVente::where('vente_id', $v['id'])->first();
        $this->assertNull($ligne->promotion_id);
        $this->assertSame('Tabaski', $ligne->promotion_libelle);
        $this->assertSame(3000, $ligne->remise_promo);
        $this->assertSame(0, Promotion::count());
    }
}
