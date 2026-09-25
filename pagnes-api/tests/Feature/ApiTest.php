<?php

namespace Tests\Feature;

use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Règles métier et droits d'accès de l'API. Chaque test correspond à un défaut réel
 * trouvé à la relecture ou à l'exécution : voir le commentaire au-dessus du test.
 */
class ApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $vendeur;
    private User $autreVendeur;

    protected function setUp(): void
    {
        parent::setUp();
        Parametre::actuel()->update(['remise_max_vendeur' => 15]);
        $this->admin = $this->compte('admin', 'admin');
        $this->vendeur = $this->compte('yawovi', 'vendeur');
        $this->autreVendeur = $this->compte('essenam', 'vendeur');
    }

    private function compte(string $id, string $role, bool $actif = true): User
    {
        return User::create(['nom' => ucfirst($id), 'email' => $id, 'password' => 'secret123', 'role' => $role, 'actif' => $actif]);
    }

    /** Crée un produit (2 coloris de 100 yards, pagne = 6 yards) et renvoie ses variantes. */
    private function produit(array $override = []): array
    {
        Sanctum::actingAs($this->admin);
        $r = $this->postJson('/api/produits', $override + [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 38000, 'prix_yard' => 7000, 'prix_achat_pagne' => 27000,
            'variantes' => [
                ['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 10, 'stock' => 100],
                ['coloris' => 'Vert', 'c1' => '#1F8A5B', 'c2' => '#F2C230', 'seuil' => 10, 'stock' => 100],
            ],
        ]);
        $r->assertOk();
        return $r->json();
    }

    private function vente(User $par, int $varianteId, array $ligne = [], array $extra = [])
    {
        Sanctum::actingAs($par);
        return $this->postJson('/api/ventes', $extra + [
            'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => [$ligne + ['variante_id' => $varianteId, 'unite' => 'pagne', 'quantite' => 1]],
        ]);
    }

    /** Sans en-tête Accept: application/json, un invité déclenchait une redirection vers une route inexistante (500). */
    public function test_invite_recoit_401_meme_sans_accept_json(): void
    {
        $this->get('/api/produits')->assertStatus(401);
        $this->get('/api/ventes', ['Accept' => 'text/html'])->assertStatus(401);
    }

    public function test_login_et_limitation_des_tentatives(): void
    {
        $this->postJson('/api/login', ['identifiant' => 'yawovi', 'mot_de_passe' => 'secret123'])
            ->assertOk()->assertJsonStructure(['user' => ['id', 'nom', 'role'], 'token']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['identifiant' => 'admin', 'mot_de_passe' => 'faux'])->assertStatus(422);
        }
        $this->postJson('/api/login', ['identifiant' => 'admin', 'mot_de_passe' => 'secret123'])->assertStatus(429);
    }

    /** Un compte désactivé ne se connecte plus, et ses jetons déjà émis cessent de marcher. */
    public function test_compte_desactive_perd_ses_jetons(): void
    {
        $token = $this->postJson('/api/login', ['identifiant' => 'yawovi', 'mot_de_passe' => 'secret123'])->json('token');
        $this->withToken($token)->getJson('/api/produits')->assertOk();

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/users/{$this->vendeur->id}", [
            'nom' => 'Yawovi', 'email' => 'yawovi', 'role' => 'vendeur', 'actif' => false,
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/produits')->assertStatus(401);
        $this->postJson('/api/login', ['identifiant' => 'yawovi', 'mot_de_passe' => 'secret123'])->assertStatus(422);
    }

    /** DELETE produits/{id} était déclarée deux fois : la version sans middleware admin gagnait. */
    public function test_un_vendeur_ne_peut_pas_gerer_produits_stock_annulations_ni_parametres(): void
    {
        $p = $this->produit();
        $vid = $p['variantes'][0]['id'];
        $vente = $this->vente($this->vendeur, $vid)->assertCreated()->json();

        Sanctum::actingAs($this->vendeur);
        $this->deleteJson("/api/produits/{$p['id']}")->assertForbidden();
        $this->postJson('/api/produits', [])->assertForbidden();
        $this->putJson("/api/produits/{$p['id']}", [])->assertForbidden();
        $this->postJson("/api/variantes/{$vid}/entree", ['unite' => 'yard', 'quantite' => 5])->assertForbidden();
        $this->postJson("/api/variantes/{$vid}/ajuster", ['nouveau_stock' => 1, 'motif' => 'x'])->assertForbidden();
        $this->postJson("/api/ventes/{$vente['id']}/annuler", ['motif' => 'x'])->assertForbidden();
        $this->putJson('/api/parametres', [])->assertForbidden();
        $this->getJson('/api/users')->assertForbidden();
        $client = \App\Models\Client::create(['nom' => 'Akossiwa']);
        $this->deleteJson("/api/clients/{$client->id}")->assertForbidden();

        $this->assertDatabaseHas('produits', ['id' => $p['id']]);
    }

    public function test_un_vendeur_ne_voit_ni_les_couts_ni_les_ventes_des_autres(): void
    {
        $p = $this->produit();
        $vid = $p['variantes'][0]['id'];
        $vente = $this->vente($this->autreVendeur, $vid)->assertCreated()->json();
        $this->assertArrayNotHasKey('marge', $vente);
        $this->assertArrayNotHasKey('cout', $vente['lignes'][0]);

        Sanctum::actingAs($this->vendeur);
        $this->getJson("/api/ventes/{$vente['id']}")->assertForbidden();
        $this->assertCount(0, $this->getJson('/api/ventes')->assertOk()->json('data'));
        $this->assertArrayNotHasKey('prix_achat_pagne', $this->getJson('/api/produits')->json(0));

        Sanctum::actingAs($this->admin);
        $this->assertArrayHasKey('prix_achat_pagne', $this->getJson('/api/produits')->json(0));
        $this->getJson("/api/ventes/{$vente['id']}")->assertOk()->assertJsonStructure(['marge']);
    }

    public function test_vente_decremente_le_stock_et_numerote_sans_trou(): void
    {
        $p = $this->produit();
        $vid = $p['variantes'][0]['id'];

        $a = $this->vente($this->vendeur, $vid, ['quantite' => 2])->assertCreated()->json();
        $b = $this->vente($this->vendeur, $vid, ['unite' => 'yard', 'quantite' => 3])->assertCreated()->json();

        $this->assertSame([1, 2], [$a['numero'], $b['numero']]);
        $this->assertSame(76000, $a['total']); // 2 pagnes × 38 000
        $this->assertSame(21000, $b['total']); // 3 yards × 7 000
        $this->assertEquals(100 - 12 - 3, Variante::find($vid)->stock);
        $this->assertSame(2, Mouvement::where('type', 'vente')->count());
    }

    public function test_stock_insuffisant_et_unite_non_vendable_sont_refuses(): void
    {
        $p = $this->produit();
        $vid = $p['variantes'][0]['id'];

        $this->vente($this->vendeur, $vid, ['quantite' => 20])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Stock insuffisant'));
        $this->assertEquals(100, Variante::find($vid)->stock);

        // Produit vendu au pagne seulement : le yard (prix 0) ne doit jamais sortir gratuitement.
        $seul = $this->produit(['nom' => 'Kente', 'vend_yard' => false, 'prix_yard' => 0]);
        $this->vente($this->vendeur, $seul['variantes'][0]['id'], ['unite' => 'yard', 'quantite' => 5])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'ne se vend pas'));
    }

    /** Le plafond vendeur ne comptait que la remise globale : une remise de ligne de 100 % passait. */
    public function test_remise_de_ligne_comptee_dans_le_plafond_vendeur(): void
    {
        $p = $this->produit();
        $vid = $p['variantes'][0]['id'];

        $this->vente($this->vendeur, $vid, ['remise_type' => 'pct', 'remise_valeur' => 100])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Remise trop élevée'));
        $this->vente($this->vendeur, $vid, ['remise_type' => 'pct', 'remise_valeur' => 10])->assertCreated();
        $this->vente($this->admin, $vid, ['remise_type' => 'pct', 'remise_valeur' => 50])->assertCreated();
    }

    public function test_mobile_money_exige_une_reference(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $this->vente($this->vendeur, $vid, [], ['paiement' => ['mode' => 'flooz']])->assertStatus(422);
        $this->vente($this->vendeur, $vid, [], ['paiement' => ['mode' => 'flooz', 'reference' => 'FZ123']])->assertCreated();
    }

    /** L'annulation relit la vente sous verrou : la seconde tentative ne restaure rien. */
    public function test_annulation_restaure_le_stock_une_seule_fois(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $vente = $this->vente($this->vendeur, $vid, ['quantite' => 2])->assertCreated()->json();
        $this->assertEquals(88, Variante::find($vid)->stock);

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$vente['id']}/annuler", ['motif' => 'Erreur'])->assertOk()->assertJsonPath('statut', 'annulee');
        $this->postJson("/api/ventes/{$vente['id']}/annuler", ['motif' => 'Encore'])->assertStatus(422);

        $this->assertEquals(100, Variante::find($vid)->stock);
        $this->assertSame(1, Mouvement::where('type', 'annulation')->count());
    }

    /** Un id de coloris étranger au produit permettait de modifier la variante d'un autre produit. */
    public function test_coloris_d_un_autre_produit_refuse(): void
    {
        $a = $this->produit();
        $b = $this->produit(['nom' => 'Bazin']);
        $etranger = $b['variantes'][0]['id'];

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/produits/{$a['id']}", [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 38000, 'prix_yard' => 7000, 'prix_achat_pagne' => 27000,
            'variantes' => [['id' => $etranger, 'coloris' => 'Piraté', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1]],
        ])->assertStatus(422);

        $this->assertNotSame('Piraté', Variante::find($etranger)->coloris);
    }

    /** Un coloris jamais vendu a pourtant un mouvement « stock initial » : sa suppression faisait un 500 (FK). */
    public function test_sku_genere_lisible_et_unique(): void
    {
        $p = $this->produit(['variantes' => [
            ['coloris' => 'A', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1],
            ['coloris' => 'B', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1],
        ]]);
        $skus = array_column($p['variantes'], 'sku');
        foreach ($skus as $sku) {
            $this->assertMatchesRegularExpression('/^WAX-\d{2}-\d{2}$/', $sku);
        }
        $this->assertCount(2, array_unique($skus));
    }

    public function test_supprimer_un_coloris_jamais_vendu_fonctionne(): void
    {
        $p = $this->produit();
        [$garde, $retire] = $p['variantes'];

        Sanctum::actingAs($this->admin);
        $this->putJson("/api/produits/{$p['id']}", [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 38000, 'prix_yard' => 7000, 'prix_achat_pagne' => 27000,
            'variantes' => [['id' => $garde['id'], 'coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 10]],
        ])->assertOk();

        $this->assertDatabaseMissing('variantes', ['id' => $retire['id']]);
        $this->assertDatabaseMissing('mouvements', ['variante_id' => $retire['id']]);
    }

    public function test_produit_deja_vendu_ne_se_supprime_pas(): void
    {
        $p = $this->produit();
        $this->vente($this->vendeur, $p['variantes'][0]['id'])->assertCreated();

        Sanctum::actingAs($this->admin);
        $this->deleteJson("/api/produits/{$p['id']}")->assertStatus(422);
        $this->assertDatabaseHas('produits', ['id' => $p['id']]);

        $vierge = $this->produit(['nom' => 'Ankara']);
        $this->deleteJson("/api/produits/{$vierge['id']}")->assertNoContent();
    }

    public function test_sku_en_doublon_renvoie_422_pas_500(): void
    {
        $this->produit(['variantes' => [['coloris' => 'A', 'sku' => 'DUP-1', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1]]]);
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/produits', [
            'nom' => 'Autre', 'type' => 'Wax', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => true,
            'prix_pagne' => 1000, 'prix_yard' => 200, 'prix_achat_pagne' => 500,
            'variantes' => [['coloris' => 'B', 'sku' => 'DUP-1', 'c1' => '#000000', 'c2' => '#FFFFFF', 'seuil' => 1]],
        ])->assertStatus(422);
    }

    public function test_les_quantites_sont_des_nombres_dans_le_json(): void
    {
        $this->produit();
        Sanctum::actingAs($this->vendeur);
        $v = $this->getJson('/api/produits')->json('0.variantes.0');
        $this->assertIsFloat($v['stock'] + 0.0);
        $this->assertTrue(is_int($v['stock']) || is_float($v['stock']), 'stock doit être numérique, pas une chaîne');
        $this->assertTrue(is_int($v['seuil']) || is_float($v['seuil']));
    }

    public function test_entree_et_ajustement_de_stock(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        Sanctum::actingAs($this->admin);

        $this->postJson("/api/variantes/{$vid}/entree", ['unite' => 'pagne', 'quantite' => 2])->assertOk();
        $this->assertEquals(112, Variante::find($vid)->stock);

        $this->postJson("/api/variantes/{$vid}/ajuster", ['nouveau_stock' => 112, 'motif' => 'RAS'])->assertStatus(422);
        $this->postJson("/api/variantes/{$vid}/ajuster", ['nouveau_stock' => 100, 'motif' => 'Coupes abîmées'])->assertOk();
        $this->assertEquals(100, Variante::find($vid)->stock);
        $this->assertEquals(-12, Mouvement::where('type', 'ajustement')->value('yards'));
    }

    /** Le frontend envoie la photo en data URL (bien plus de 255 caractères). */
    public function test_photo_produit_en_data_url_acceptee(): void
    {
        $image = 'data:image/jpeg;base64,' . str_repeat('A', 120000);
        $p = $this->produit(['image' => $image]);
        $this->assertSame(strlen($image), strlen($p['image']));
    }

    /** Un vendeur ne doit voir ni l'identifiant de connexion ni le rôle des collègues dans les ventes. */
    public function test_ventes_n_exposent_que_id_et_nom_du_vendeur(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $cree = $this->vente($this->vendeur, $vid)->assertCreated()->json();
        $this->assertSame(['id', 'nom'], array_keys($cree['vendeur']));

        Sanctum::actingAs($this->admin);
        $liste = $this->getJson('/api/ventes')->assertOk()->json('data.0');
        $this->assertSame(['id', 'nom'], array_keys($liste['vendeur']));
    }

    public function test_pagination_par_per_page_et_mouvements_allegés(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        foreach ([1, 2, 3] as $i) {
            $this->vente($this->admin, $vid)->assertCreated();
        }
        Sanctum::actingAs($this->admin);
        $r = $this->getJson('/api/ventes?per_page=2')->assertOk();
        $this->assertCount(2, $r->json('data'));
        $this->assertSame(2, $r->json('last_page'));
        $this->assertCount(3, $this->getJson('/api/ventes?per_page=9999')->json('data')); // plafonné à 200, ici 3 ventes

        $m = $this->getJson('/api/mouvements')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('variante', $m);
        $this->assertSame(['id', 'nom'], array_keys($m['utilisateur']));
    }

    public function test_cors_autorise_le_frontend_et_refuse_les_autres_origines(): void
    {
        $prevol = fn (string $origine) => $this->call('OPTIONS', '/api/produits', [], [], [], [
            'HTTP_ORIGIN' => $origine, 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET', 'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization',
        ]);

        $this->assertSame('http://localhost:5173', $prevol('http://localhost:5173')->headers->get('Access-Control-Allow-Origin'));
        $this->assertNull($prevol('https://site-malveillant.example')->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_identifiant_en_doublon_refuse_en_francais(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/users', ['nom' => 'Autre', 'email' => 'yawovi', 'mot_de_passe' => 'secret123', 'role' => 'vendeur', 'actif' => true])
            ->assertStatus(422)->assertJsonPath('errors.email.0', 'Cet identifiant est déjà utilisé.');
    }

    public function test_dernier_administrateur_actif_est_protege(): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson("/api/users/{$this->admin->id}", ['nom' => 'Admin', 'email' => 'admin', 'role' => 'vendeur', 'actif' => true])
            ->assertStatus(422);
    }
}
