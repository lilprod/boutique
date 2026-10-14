<?php

namespace Tests\Feature;

use App\Models\Boutique;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Les messages de l'API suivent la langue choisie dans l'application (en-tête X-Langue), français par défaut. */
class LangueTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Boutique $boutique;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['nom' => 'Langues', 'slug' => 'langues-'.uniqid(), 'statut' => 'active']);
        $this->boutique = $this->tenant->boutiques()->create(['nom' => 'Grand Marché', 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'P', 'slug' => 'p-'.uniqid(), 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 1, 'max_utilisateurs' => 5, 'features' => [], 'actif' => true]);
        $sub = $this->tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addDays(3)]);
        $this->tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => 'L-'.uniqid(), 'activated_at' => now(), 'expires_at' => now()->addDays(3), 'quota_usage' => []]);
        $this->admin = User::create(['nom' => 'Admin', 'email' => 'admin-'.uniqid(), 'password' => 'secret123', 'role' => 'admin', 'actif' => true,
            'tenant_id' => $this->tenant->id, 'boutique_id' => $this->boutique->id]);
        Parametre::actuel($this->admin)->update(['autorise_yard' => true]);
        Sanctum::actingAs($this->admin);
    }

    private function venteVide(?string $langue)
    {
        return $this->withHeaders($langue ? ['X-Langue' => $langue] : [])
            ->postJson('/api/ventes', ['remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'], 'lignes' => []]);
    }

    public function test_validation_en_francais_par_defaut_et_en_anglais_sur_demande(): void
    {
        $this->venteVide(null)->assertStatus(422)->assertJsonPath('errors.lignes.0', 'Le champ articles est obligatoire.');
        $this->venteVide('en')->assertStatus(422)->assertJsonPath('errors.lignes.0', 'The items field is required.');
        $this->venteVide('de')->assertStatus(422)->assertJsonPath('errors.lignes.0', 'Le champ articles est obligatoire.'); // langue inconnue : français

        // Résumé de plusieurs erreurs et nom de champ lisible.
        $plusieurs = fn (?string $l) => $this->withHeaders($l ? ['X-Langue' => $l] : [])->postJson('/api/ventes', []);
        $plusieurs(null)->assertStatus(422)->assertJsonPath('errors.remise_type.0', 'Le champ type de remise est obligatoire.')
            ->assertJsonPath('message', fn ($m) => str_ends_with($m, 'autres erreurs)'));
        $plusieurs('en')->assertStatus(422)->assertJsonPath('errors.remise_type.0', 'The discount type field is required.')
            ->assertJsonPath('message', fn ($m) => str_ends_with($m, 'more errors)'));
    }

    public function test_message_metier_traduit_avec_ses_valeurs(): void
    {
        Sanctum::actingAs($this->admin);
        $produit = $this->postJson('/api/produits', [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'motif' => 'Damier', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 30000, 'prix_yard' => 0, 'prix_achat_pagne' => 20000,
            'variantes' => [['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 6, 'stock' => 6]],
        ])->assertOk()->json();
        $vente = fn (?string $l) => $this->withHeaders($l ? ['X-Langue' => $l] : [])->postJson('/api/ventes', [
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [['variante_id' => $produit['variantes'][0]['id'], 'unite' => 'pagne', 'quantite' => 2]],
        ]);

        $vente(null)->assertStatus(422)->assertJsonPath('message', 'Stock insuffisant pour Wax Damier — Orange : 6 yard(s) disponible(s).');
        $vente('en')->assertStatus(422)->assertJsonPath('message', 'Not enough stock for Wax Damier — Orange: 6 yard(s) available.');
    }

    public function test_connexion_refusee_dans_la_langue_choisie(): void
    {
        $this->withHeaders(['X-Langue' => 'en'])->postJson('/api/login', ['identifiant' => 'inconnu', 'mot_de_passe' => 'x'])
            ->assertStatus(422)->assertJsonPath('errors.identifiant.0', 'Incorrect username or password.');
    }

    public function test_cloche_de_la_boutique_traduite_et_regroupee(): void
    {
        $this->postJson('/api/produits', [
            'nom' => 'Kente', 'type' => 'Kente', 'motif' => 'Rayures', 'yards_par_pagne' => 12, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 90000, 'prix_yard' => 0, 'prix_achat_pagne' => 60000,
            'variantes' => [
                ['coloris' => 'Or', 'c1' => '#E2A81B', 'c2' => '#7A2E12', 'seuil' => 24, 'stock' => 0],
                ['coloris' => 'Vert', 'c1' => '#1F8A5B', 'c2' => '#F2C230', 'seuil' => 24, 'stock' => 10],
                ['coloris' => 'Bleu', 'c1' => '#1E3FA0', 'c2' => '#F5E6B8', 'seuil' => 24, 'stock' => 200],
            ],
        ])->assertOk();

        // Licence à 3 jours de l'expiration (setUp), un coloris en rupture, un sous le seuil.
        $fr = $this->getJson('/api/notifications')->assertOk()->json();
        $this->assertSame(['Ruptures de stock', 'Licence bientôt expirée', 'Stock à réapprovisionner'], array_column($fr, 'titre'));
        $this->assertSame('1 coloris en rupture : plus rien à vendre.', $fr[0]['message']);

        $en = $this->withHeaders(['X-Langue' => 'en'])->getJson('/api/notifications')->assertOk()->json();
        $this->assertSame(['Out of stock', 'Licence expiring soon', 'Stock to reorder'], array_column($en, 'titre'));
        $this->assertStringContainsString('Company licence · expires on', $en[1]['message']);
    }

    public function test_un_vendeur_ne_voit_pas_l_alerte_de_licence(): void
    {
        $vendeur = User::create(['nom' => 'Vendeur', 'email' => 'v-'.uniqid(), 'password' => 'secret123', 'role' => 'vendeur', 'actif' => true,
            'tenant_id' => $this->tenant->id, 'boutique_id' => $this->boutique->id]);
        Sanctum::actingAs($vendeur);

        $this->assertSame([], array_column($this->getJson('/api/notifications')->assertOk()->json(), 'titre'));
    }
}
