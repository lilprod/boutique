<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Rapport des ventes d'une période et exports CSV (administrateur, boutique courante seulement). */
class RapportsTest extends TestCase
{
    use RefreshDatabase;

    /** Boutique avec un produit (10 000 le pagne, achat 6 000), un admin et un vendeur. */
    private function boutique(): array
    {
        $s = 'rp-'.Str::lower(Str::random(8));
        $plan = Plan::create(['nom' => $s, 'slug' => $s, 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 1, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $tenant = Tenant::create(['nom' => $s, 'slug' => $s, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $s, 'statut' => 'active']);
        $sub = $tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'billing_provider' => 'cash']);
        $tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => strtoupper($s), 'activated_at' => now(), 'expires_at' => now()->addMonth()]);
        $compte = fn (string $role, string $nom) => User::factory()->create(['nom' => $nom, 'email' => $role.'-'.$s, 'role' => $role, 'actif' => true, 'is_super_admin' => false, 'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id]);
        $admin = $compte('boutique_admin', 'Kafui');
        $vendeur = $compte('vendeur', 'Yawovi');

        Sanctum::actingAs($admin);
        $produit = $this->postJson('/api/produits', [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 10000, 'prix_yard' => 0, 'prix_achat_pagne' => 6000,
            'variantes' => [['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 3, 'stock' => 60]],
        ])->assertOk()->json();

        return ['admin' => $admin, 'vendeur' => $vendeur, 'variante' => Variante::findOrFail($produit['variantes'][0]['id']), 'tenant' => $tenant, 'boutique' => $boutique];
    }

    private function vendre(User $par, Variante $v, int $quantite, string $mode = 'especes', array $extra = []): array
    {
        Sanctum::actingAs($par);

        return $this->postJson('/api/ventes', $extra + [
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => $mode, 'reference' => $mode === 'flooz' ? 'FZ-1' : null],
            'lignes' => [['variante_id' => $v->id, 'unite' => 'pagne', 'quantite' => $quantite]],
        ])->assertCreated()->json();
    }

    /** Lignes d'un CSV téléchargé (BOM retiré, séparateur « ; »). */
    private function csv($reponse): array
    {
        $texte = $reponse->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $texte);

        return array_map(fn ($l) => str_getcsv($l, ';', '"', '\\'), array_values(array_filter(explode("\n", substr($texte, 3)))));
    }

    public function test_rapport_des_ventes_de_la_periode(): void
    {
        $b = $this->boutique();
        $this->vendre($b['vendeur'], $b['variante'], 2);                       // 20 000, marge 8 000
        $this->vendre($b['admin'], $b['variante'], 1, 'flooz', ['remise_type' => 'fcfa', 'remise_valeur' => 1000]); // 9 000, marge 3 000
        $annulee = $this->vendre($b['vendeur'], $b['variante'], 1);
        Sanctum::actingAs($b['admin']);
        $this->postJson('/api/ventes/'.$annulee['id'].'/annuler', ['motif' => 'Erreur'])->assertOk();

        // Une autre boutique ne compte jamais.
        $autre = $this->boutique();
        $this->vendre($autre['vendeur'], $autre['variante'], 5);

        Sanctum::actingAs($b['admin']);
        $r = $this->getJson('/api/rapports/ventes?du='.now()->toDateString().'&au='.now()->toDateString())->assertOk();
        $r->assertJsonPath('totaux.ventes', 2)->assertJsonPath('totaux.ca', 29000)->assertJsonPath('totaux.marge', 11000)
            ->assertJsonPath('totaux.panier_moyen', 14500)->assertJsonPath('totaux.remises', 1000)->assertJsonPath('totaux.annulees', 1);
        $this->assertSame([['date' => now()->toDateString(), 'ventes' => 2, 'ca' => 29000, 'marge' => 11000]], $r->json('par_jour'));
        $this->assertEqualsCanonicalizing(['especes' => 20000, 'flooz' => 9000], collect($r->json('par_paiement'))->pluck('ca', 'mode')->all());
        $this->assertSame(['Yawovi' => 20000, 'Kafui' => 9000], collect($r->json('par_vendeur'))->pluck('ca', 'nom')->all());
        // Quantité dans l'unité de stock de la boutique (yard) : 3 pagnes de 6 yards.
        $this->assertSame('yard', $r->json('unite_stock'));
        $this->assertSame([['produit_id' => $b['variante']->produit_id, 'libelle' => 'Wax Damier', 'ventes' => 2, 'quantite' => 18, 'ca' => 29000, 'marge' => 11000]], $r->json('par_produit'));

        // Période sans vente.
        $this->getJson('/api/rapports/ventes?du=2020-01-01&au=2020-01-31')->assertOk()->assertJsonPath('totaux.ventes', 0)->assertJsonPath('totaux.panier_moyen', 0);
        $this->getJson('/api/rapports/ventes?du=2026-02-01&au=2026-01-01')->assertStatus(422);
    }

    public function test_les_rapports_et_exports_sont_reserves_a_l_administrateur(): void
    {
        $b = $this->boutique();
        Sanctum::actingAs($b['vendeur']);
        foreach (['rapports/ventes', 'exports/ventes.csv', 'exports/lignes.csv', 'exports/mouvements.csv', 'exports/stock.csv', 'exports/proprietaires.csv'] as $route) {
            $this->getJson('/api/'.$route)->assertForbidden();
        }
    }

    public function test_export_des_ventes_en_csv_pour_excel(): void
    {
        $b = $this->boutique();
        $client = Client::create(['tenant_id' => $b['tenant']->id, 'boutique_id' => $b['boutique']->id, 'nom' => '=HYPERLINK("http://x")']);
        $this->vendre($b['vendeur'], $b['variante'], 2, 'especes', ['client_id' => $client->id]);
        $this->vendre($b['vendeur'], $b['variante'], 1, 'flooz');

        Sanctum::actingAs($b['admin']);
        $reponse = $this->get('/api/exports/ventes.csv')->assertOk();
        $this->assertStringContainsString('text/csv', $reponse->headers->get('Content-Type'));
        $this->assertStringContainsString('ventes-'.now()->startOfMonth()->toDateString(), $reponse->headers->get('Content-Disposition'));
        $lignes = $this->csv($reponse);

        $this->assertSame(['Numéro', 'Date', 'Vendeur', 'Client', 'Statut'], array_slice($lignes[0], 0, 5));
        $this->assertCount(3, $lignes);
        // « Articles » : lignes du ticket ; un nom de client qui ressemble à une formule est neutralisé.
        $this->assertSame(['V-00001', 'Yawovi', "'=HYPERLINK(\"http://x\")", 'Validée', '1', '20000'], [$lignes[1][0], $lignes[1][2], $lignes[1][3], $lignes[1][4], $lignes[1][5], $lignes[1][9]]);
        $this->assertSame('Flooz', $lignes[2][11]);

        // En anglais, les en-têtes suivent la langue de l'application.
        $en = $this->csv($this->get('/api/exports/ventes.csv', ['X-Langue' => 'en'])->assertOk());
        $this->assertSame(['Number', 'Date', 'Sales assistant', 'Customer', 'Status'], array_slice($en[0], 0, 5));
    }

    public function test_exports_lignes_mouvements_stock_et_proprietaires(): void
    {
        $b = $this->boutique();
        $this->vendre($b['vendeur'], $b['variante'], 2);
        Sanctum::actingAs($b['admin']);

        $lignes = $this->csv($this->get('/api/exports/lignes.csv')->assertOk());
        $this->assertSame(['Wax Damier', 'Orange', 'pagne', '2', '10000', '20000'], [$lignes[1][3], $lignes[1][4], $lignes[1][6], $lignes[1][7], $lignes[1][8], $lignes[1][9]]);
        $this->assertSame(['20000', '12000', '8000'], array_slice($lignes[1], 13, 3));

        $mouvements = $this->csv($this->get('/api/exports/mouvements.csv')->assertOk());
        $this->assertSame(['Entrée', 'Vente'], array_column(array_slice($mouvements, 1), 1));
        $this->assertSame('-12', $mouvements[2][4]); // 2 pagnes = 12 yards sortis

        // Stock : 60 − 12 = 48 yards, valeur d'achat 48 / 6 × 6 000 ; décimales avec virgule (seuil 3 → « 3 »).
        $stock = $this->csv($this->get('/api/exports/stock.csv')->assertOk());
        $this->assertSame(['Wax Damier', 'Orange', '48', 'yard', '3', 'En stock', '10000', '6000', '48000'], [$stock[1][0], $stock[1][3], $stock[1][6], $stock[1][7], $stock[1][8], $stock[1][9], $stock[1][10], $stock[1][11], $stock[1][12]]);

        $proprietaires = $this->csv($this->get('/api/exports/proprietaires.csv')->assertOk());
        $this->assertSame(['Non attribué', '1', '20000'], array_slice($proprietaires[1], 0, 3));
    }

    public function test_les_decimales_sont_ecrites_avec_une_virgule(): void
    {
        $this->assertSame('1,5', \App\Support\Csv::valeur(1.5));
        $this->assertSame('48', \App\Support\Csv::valeur(48.0));
        $this->assertSame("'-3", \App\Support\Csv::valeur('-3'));
        $this->assertSame(-3, \App\Support\Csv::valeur(-3));
    }
}
