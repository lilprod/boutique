<?php

namespace Tests\Feature;

use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Produit;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_photo_produit_envoyee_comme_fichier_et_exposee_par_url(): void
    {
        Storage::fake('photos');
        $p = $this->produit();
        $this->assertNull($p['image_url']);
        $this->assertArrayNotHasKey('image', $p); // le chemin de stockage n'est jamais exposé

        Sanctum::actingAs($this->admin);
        $r = $this->post("/api/produits/{$p['id']}/image", ['image' => UploadedFile::fake()->image('photo.jpg', 400, 300)], ['Accept' => 'application/json'])->assertOk()->json();

        $chemin = Produit::find($p['id'])->image;
        $this->assertMatchesRegularExpression('#^produits/[0-9a-f-]{36}\.jpg$#', $chemin);
        Storage::disk('photos')->assertExists($chemin);
        $this->assertSame(url('photos/' . $chemin), $r['image_url']);
        $this->assertSame($r['image_url'], $this->getJson('/api/produits')->json('0.image_url')); // la liste porte l'URL, pas le fichier
    }

    public function test_remplacer_ou_retirer_la_photo_supprime_l_ancien_fichier(): void
    {
        Storage::fake('photos');
        $p = $this->produit();
        $envoi = fn () => $this->post("/api/produits/{$p['id']}/image", ['image' => UploadedFile::fake()->image('p.png', 200, 200)], ['Accept' => 'application/json'])->assertOk();

        $envoi();
        $premier = Produit::find($p['id'])->image;
        $envoi();
        $second = Produit::find($p['id'])->image;
        $this->assertNotSame($premier, $second);
        Storage::disk('photos')->assertMissing($premier);
        Storage::disk('photos')->assertExists($second);

        $this->deleteJson("/api/produits/{$p['id']}/image")->assertOk()->assertJsonPath('image_url', null);
        Storage::disk('photos')->assertMissing($second);
        $this->assertNull(Produit::find($p['id'])->image);
    }

    public function test_supprimer_un_produit_supprime_sa_photo(): void
    {
        Storage::fake('photos');
        $p = $this->produit();
        $this->post("/api/produits/{$p['id']}/image", ['image' => UploadedFile::fake()->image('p.jpg')], ['Accept' => 'application/json'])->assertOk();
        $chemin = Produit::find($p['id'])->image;

        $this->deleteJson("/api/produits/{$p['id']}")->assertNoContent();
        Storage::disk('photos')->assertMissing($chemin);
    }

    /** Un SVG (script possible), un faux fichier renommé, un fichier trop lourd ou trop grand sont refusés ; rien n'est écrit. */
    public function test_photo_invalide_refusee(): void
    {
        Storage::fake('photos');
        $p = $this->produit();
        $tenter = fn ($fichier) => $this->post("/api/produits/{$p['id']}/image", ['image' => $fichier], ['Accept' => 'application/json']);

        $tenter(UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
            ->assertStatus(422)->assertJsonPath('errors.image.0', 'La photo doit être au format JPEG, PNG ou WebP.');
        $tenter(UploadedFile::fake()->createWithContent('photo.jpg', '<?php echo "pas une image"; ?>'))->assertStatus(422); // extension trompeuse
        $tenter(UploadedFile::fake()->image('lourde.jpg', 100, 100)->size(3000)) // vraie image, 3 Mo annoncés
            ->assertStatus(422)->assertJsonPath('errors.image.0', 'La photo ne doit pas dépasser 2 Mo.');
        $tenter(UploadedFile::fake()->image('immense.jpg', 5000, 100))
            ->assertStatus(422)->assertJsonPath('errors.image.0', 'La photo est trop grande (4 000 px au plus de chaque côté).');
        $this->post("/api/produits/{$p['id']}/image", [], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertNull(Produit::find($p['id'])->image);
        $this->assertSame([], Storage::disk('photos')->allFiles());
    }

    public function test_un_vendeur_ne_peut_pas_gerer_les_photos(): void
    {
        Storage::fake('photos');
        $p = $this->produit();
        Sanctum::actingAs($this->vendeur);
        $this->post("/api/produits/{$p['id']}/image", ['image' => UploadedFile::fake()->image('p.jpg')], ['Accept' => 'application/json'])->assertForbidden();
        $this->deleteJson("/api/produits/{$p['id']}/image")->assertForbidden();
    }

    /** Le chemin de stockage ne peut pas être imposé par la sauvegarde du produit. */
    public function test_le_chemin_de_l_image_n_est_pas_modifiable_par_le_produit(): void
    {
        $p = $this->produit(['image' => '../../.env']);
        $this->assertNull(Produit::find($p['id'])->image);
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

    /** Trois ventes de 38 000 / 76 000 (annulée) / 38 000 FCFA, coût d'achat 27 000 le pagne. */
    private function jeuDeVentes(): int
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $this->vente($this->vendeur, $vid)->assertCreated();
        $annulee = $this->vente($this->autreVendeur, $vid, ['quantite' => 2])->assertCreated()->json();
        $this->vente($this->autreVendeur, $vid)->assertCreated();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$annulee['id']}/annuler", ['motif' => 'Erreur'])->assertOk();
        return $vid;
    }

    public function test_tableau_de_bord_admin_exclut_les_ventes_annulees(): void
    {
        $this->jeuDeVentes();
        Sanctum::actingAs($this->admin);
        $r = $this->getJson('/api/tableau-de-bord')->assertOk()->json();

        $this->assertSame(now()->toDateString(), $r['aujourd_hui']);
        $this->assertSame(['ventes' => 2, 'ca' => 76000, 'marge' => 22000], $r['jour']);
        $this->assertCount(30, $r['serie']);
        $this->assertSame($r['aujourd_hui'], $r['serie'][29]['date']);
        $this->assertSame(0, $r['serie'][0]['ca']); // les jours sans vente sont présents, à zéro
        $this->assertSame(76000, $r['ca_periode']);

        $this->assertCount(1, $r['top_produits']);
        $this->assertSame(['libelle' => 'Wax Damier', 'total' => 76000, 'yards' => 12], [
            'libelle' => $r['top_produits'][0]['libelle'], 'total' => $r['top_produits'][0]['total'], 'yards' => (int) $r['top_produits'][0]['yards'],
        ]);
        $this->assertEqualsCanonicalizing([38000, 38000], array_column($r['par_vendeur'], 'total'));

        $this->assertCount(3, $r['dernieres']); // annulée comprise
        $this->assertContains('annulee', array_column($r['dernieres'], 'statut'));
        $this->assertSame(['id', 'nom'], array_keys($r['dernieres'][0]['vendeur']));
    }

    public function test_tableau_de_bord_vendeur_ne_voit_que_ses_ventes_et_pas_la_marge(): void
    {
        $this->jeuDeVentes();
        Sanctum::actingAs($this->vendeur);
        $r = $this->getJson('/api/tableau-de-bord')->assertOk()->json();

        $this->assertSame(['ventes' => 1, 'ca' => 38000], $r['jour']);
        $this->assertArrayNotHasKey('marge', $r['serie'][29]);
        $this->assertArrayNotHasKey('par_vendeur', $r);
        $this->assertCount(1, $r['dernieres']);
        $this->assertSame(38000, $r['top_produits'][0]['total']);
    }

    public function test_tableau_de_bord_sans_vente_renvoie_des_zeros(): void
    {
        Sanctum::actingAs($this->admin);
        $r = $this->getJson('/api/tableau-de-bord')->assertOk()->json();
        $this->assertSame(['ventes' => 0, 'ca' => 0, 'marge' => 0], $r['jour']);
        $this->assertSame([], $r['top_produits']);
        $this->assertSame([], $r['dernieres']);
    }

    public function test_recherche_et_filtres_des_ventes(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $client = \App\Models\Client::create(['nom' => 'Akossiwa Mensah']);
        $this->vente($this->vendeur, $vid, [], ['client_id' => $client->id])->assertCreated();                                   // V-00001
        $this->vente($this->vendeur, $vid, [], ['paiement' => ['mode' => 'flooz', 'reference' => 'FZ777']])->assertCreated();   // V-00002
        $this->vente($this->autreVendeur, $vid)->assertCreated();                                                                // V-00003

        Sanctum::actingAs($this->admin);
        $numeros = fn (string $qs) => array_column($this->getJson("/api/ventes?$qs")->assertOk()->json('data'), 'numero');

        $this->assertSame([1], $numeros('q=akossiwa'));      // client, sans tenir compte de la casse
        $this->assertSame([2], $numeros('q=FZ777'));         // référence de paiement
        $this->assertSame([3], $numeros('q=V-00003'));       // numéro affiché
        $this->assertSame([3], $numeros('q=3'));             // numéro brut
        $this->assertSame([3], $numeros('q=essenam'));       // vendeur
        $this->assertCount(3, $numeros('q=damier'));         // article
        $this->assertSame([], $numeros('q=introuvable'));
        $this->assertSame([], $numeros('du=' . now()->addDay()->toDateString()));
        $this->assertCount(3, $numeros('du=' . now()->toDateString() . '&au=' . now()->toDateString()));

        $this->getJson('/api/ventes?statut=nimporte')->assertStatus(422);

        // Le filtre ne contourne pas la portée : un vendeur ne trouve pas les ventes des autres.
        Sanctum::actingAs($this->vendeur);
        $this->assertSame([], array_column($this->getJson('/api/ventes?q=essenam')->json('data'), 'numero'));
    }

    public function test_clients_exposent_achats_depense_et_derniere_vente(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        $avec = \App\Models\Client::create(['nom' => 'Avec achats']);
        \App\Models\Client::create(['nom' => 'Sans achat']);
        $this->vente($this->vendeur, $vid, [], ['client_id' => $avec->id])->assertCreated();
        $annulee = $this->vente($this->vendeur, $vid, [], ['client_id' => $avec->id])->assertCreated()->json();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$annulee['id']}/annuler", ['motif' => 'x'])->assertOk();

        $clients = collect($this->getJson('/api/clients')->assertOk()->json())->keyBy('nom');
        $this->assertSame(1, $clients['Avec achats']['achats']);
        $this->assertSame(38000, $clients['Avec achats']['depense']);
        $this->assertNotNull($clients['Avec achats']['derniere_vente']);
        $this->assertSame(0, $clients['Sans achat']['achats']);
        $this->assertNull($clients['Sans achat']['derniere_vente']);
    }

    public function test_fournisseurs_reserves_a_l_admin_et_filtre_des_mouvements(): void
    {
        $vid = $this->produit()['variantes'][0]['id'];
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/variantes/{$vid}/entree", ['unite' => 'yard', 'quantite' => 5, 'fournisseur' => 'Kponton'])->assertOk();
        $this->assertSame(['Kponton'], $this->getJson('/api/fournisseurs')->assertOk()->json());

        $this->assertCount(1, $this->getJson("/api/mouvements?type=entree&variante_id={$vid}&per_page=1")->assertOk()->json('data'));
        $this->getJson('/api/mouvements?type=inconnu')->assertStatus(422);

        Sanctum::actingAs($this->vendeur);
        $this->getJson('/api/fournisseurs')->assertForbidden();
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
