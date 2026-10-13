<?php

namespace Tests\Feature;

use App\Models\Boutique;
use App\Models\Client;
use App\Models\LigneVente;
use App\Models\MouvementPoints;
use App\Models\Parametre;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Fidélité : 1 point par tranche de 1 000 FCFA payés, 1 point = 10 FCFA, 100 points minimum, solde perdu après 12 mois sans achat. */
class FideliteTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Boutique $boutique;

    private User $admin;

    private User $vendeur;

    private Client $client;

    private int $orange;

    private int $vert;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['nom' => 'Fidélité', 'slug' => 'fid-'.uniqid(), 'statut' => 'active']);
        $this->boutique = $this->tenant->boutiques()->create(['nom' => 'Grand Marché', 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'P', 'slug' => 'p-'.uniqid(), 'prix' => 0, 'intervalle' => 'month', 'max_boutiques' => 2, 'max_utilisateurs' => 10, 'features' => [], 'actif' => true]);
        $sub = $this->tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth()]);
        $this->tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => 'active', 'cle' => 'FID-'.uniqid(), 'activated_at' => now(), 'expires_at' => now()->addMonth(), 'quota_usage' => []]);
        $this->admin = $this->compte('admin', 'admin');
        $this->vendeur = $this->compte('vendeur', 'vendeur');
        Parametre::actuel($this->admin)->update([
            'remise_max_vendeur' => 15, 'fidelite_active' => true, 'fidelite_tranche' => 1000,
            'fidelite_valeur_point' => 10, 'fidelite_seuil' => 100, 'fidelite_expiration_mois' => 12,
        ]);
        $this->client = Client::create(['tenant_id' => $this->tenant->id, 'boutique_id' => $this->boutique->id, 'nom' => 'Akossiwa Mensah']);

        Sanctum::actingAs($this->admin);
        $p = $this->postJson('/api/produits', [
            'nom' => 'Wax Damier', 'type' => 'Wax', 'motif' => 'Damier', 'yards_par_pagne' => 6, 'vend_pagne' => true, 'vend_yard' => false,
            'prix_pagne' => 30000, 'prix_yard' => 0, 'prix_achat_pagne' => 20000,
            'variantes' => [
                ['coloris' => 'Orange', 'c1' => '#E07A1F', 'c2' => '#23306B', 'seuil' => 6, 'stock' => 300],
                ['coloris' => 'Vert', 'c1' => '#1F8A5B', 'c2' => '#F2C230', 'seuil' => 6, 'stock' => 300],
            ],
        ])->assertOk()->json();
        [$this->orange, $this->vert] = array_column($p['variantes'], 'id');
    }

    private function compte(string $id, string $role): User
    {
        return User::create([
            'nom' => ucfirst($id), 'email' => $id.'-'.uniqid(), 'password' => 'secret123', 'role' => $role, 'actif' => true,
            'tenant_id' => $this->tenant->id, 'boutique_id' => $this->boutique->id,
        ]);
    }

    private function vente(array $extra = [], array $lignes = [['quantite' => 1]], ?User $par = null)
    {
        Sanctum::actingAs($par ?? $this->vendeur);

        return $this->postJson('/api/ventes', $extra + [
            'client_id' => $this->client->id, 'remise_type' => 'pct', 'remise_valeur' => 0, 'paiement' => ['mode' => 'especes'],
            'lignes' => array_map(fn ($l) => $l + ['variante_id' => $this->orange, 'unite' => 'pagne', 'quantite' => 1], $lignes),
        ]);
    }

    private function crediter(int $points): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/clients/{$this->client->id}/points", ['points' => $points, 'motif' => 'Geste commercial'])->assertOk();
    }

    private function solde(): int
    {
        return $this->client->fresh()->points;
    }

    public function test_un_achat_rapporte_des_points_par_tranche_complete(): void
    {
        $v = $this->vente([], [['quantite' => 2]])->assertCreated()->json();
        $this->assertSame(60, $v['points_gagnes']);
        $this->assertSame(60, $this->solde());

        $this->vente(['client_id' => null])->assertCreated()->assertJsonPath('points_gagnes', 0); // client de passage
        $this->assertSame(['gain'], MouvementPoints::pluck('type')->all());
    }

    public function test_utiliser_des_points_comme_remise(): void
    {
        $this->crediter(500);
        $v = $this->vente(['points_utilises' => 200])->assertCreated()->json();

        $this->assertSame(2000, $v['remise_points']);
        $this->assertSame(28000, $v['total']);
        $this->assertSame(28, $v['points_gagnes']); // gagnés sur ce qui a été payé
        $this->assertSame(500 - 200 + 28, $this->solde());
        $this->assertSame(['ajustement', 'utilisation', 'gain'], MouvementPoints::orderBy('id')->pluck('type')->all());
    }

    public function test_utilisation_refusee_hors_des_regles(): void
    {
        $this->crediter(5000);
        $this->vente(['points_utilises' => 50])->assertStatus(422)->assertJsonPath('message', 'Il faut utiliser au moins 100 points.');
        $this->vente(['points_utilises' => 6000])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Solde insuffisant'));
        $this->vente(['points_utilises' => 4000])->assertStatus(422)->assertJsonPath('message', 'Trop de points pour ce ticket : au plus 3000 points.');
        $this->vente(['client_id' => null, 'points_utilises' => 200])->assertStatus(422);

        Parametre::actuel($this->admin)->update(['fidelite_active' => false]);
        $this->vente(['points_utilises' => 200])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'pas activé'));
        $this->assertSame(5000, $this->solde());
    }

    /** Les points sont un droit du client : ils ne consomment pas le plafond de remise du vendeur. */
    public function test_les_points_ne_comptent_pas_dans_le_plafond_vendeur(): void
    {
        $this->crediter(1500);
        $this->vente(['points_utilises' => 1500])->assertCreated()->assertJsonPath('total', 15000); // −50 %
    }

    public function test_remise_en_points_repartie_sur_les_lignes(): void
    {
        $this->crediter(1000);
        $v = $this->vente(['points_utilises' => 1000], [['quantite' => 2], ['variante_id' => $this->vert]])->assertCreated()->json();
        $this->assertSame(80000, $v['total']);
        $this->assertSame(80000, (int) LigneVente::where('vente_id', $v['id'])->sum('net'));
    }

    public function test_annulation_rend_les_points_utilises_et_retire_les_points_gagnes(): void
    {
        $this->crediter(500);
        $v = $this->vente(['points_utilises' => 200])->assertCreated()->json();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$v['id']}/annuler", ['motif' => 'Erreur'])->assertOk();

        $this->assertSame(500, $this->solde());
        $this->assertSame(2, MouvementPoints::where('type', 'annulation')->count());
    }

    /** Points déjà dépensés puis vente d'origine annulée : le solde devient négatif, les prochains achats le comblent. */
    public function test_annulation_apres_depense_des_points_rend_le_solde_negatif(): void
    {
        Parametre::actuel($this->admin)->update(['fidelite_seuil' => 0]);
        $a = $this->vente([], [['quantite' => 2]])->assertCreated()->json(); // +60
        $this->vente(['points_utilises' => 60])->assertCreated();            // −60, +29
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/ventes/{$a['id']}/annuler", ['motif' => 'Retour'])->assertOk();

        $this->assertSame(29 - 60, $this->solde());
    }

    public function test_solde_perdu_apres_douze_mois_sans_achat(): void
    {
        $this->crediter(500);
        MouvementPoints::query()->update(['created_at' => now()->subMonths(13)]);
        $actif = Client::create(['tenant_id' => $this->tenant->id, 'boutique_id' => $this->boutique->id, 'nom' => 'Cliente active']);
        $this->vente(['client_id' => $actif->id], [['quantite' => 4]])->assertCreated(); // achat récent : 120 points gardés

        $this->artisan('fidelite:expirer')->assertSuccessful();

        $this->assertSame(0, $this->solde());
        $this->assertSame(120, $actif->fresh()->points);
        $this->assertSame(-500, MouvementPoints::where('type', 'expiration')->value('points'));
    }

    /** Sans attendre la tâche de nuit : un solde périmé ne peut pas être utilisé à la caisse. */
    public function test_solde_perime_expire_au_moment_de_la_vente(): void
    {
        $this->crediter(500);
        MouvementPoints::query()->update(['created_at' => now()->subMonths(13)]);

        $this->vente(['points_utilises' => 200])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Solde insuffisant'));
        $this->assertSame(0, $this->solde());

        Parametre::actuel($this->admin)->update(['fidelite_expiration_mois' => 0]); // jamais
        $this->crediter(500);
        MouvementPoints::query()->update(['created_at' => now()->subYears(5)]);
        $this->vente(['points_utilises' => 200])->assertCreated();
    }

    public function test_ajustement_reserve_a_l_admin_avec_motif_et_historique(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/clients/{$this->client->id}/points", ['points' => 100])->assertStatus(422);
        $this->postJson("/api/clients/{$this->client->id}/points", ['points' => 0, 'motif' => 'x'])->assertStatus(422);
        $this->crediter(300);

        Sanctum::actingAs($this->vendeur);
        $this->postJson("/api/clients/{$this->client->id}/points", ['points' => 1000, 'motif' => 'Moi'])->assertForbidden();
        $h = $this->getJson("/api/clients/{$this->client->id}/points")->assertOk()->json();
        $this->assertSame(300, $h['solde']);
        $this->assertSame('Geste commercial', $h['mouvements'][0]['motif']);
        $this->assertSame(300, $this->getJson('/api/clients')->json('0.points'));
    }
}
