<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Non-régression de l'audit : droits sur les comptes, espace entreprise, quotas et cycle d'abonnement. */
class DroitsEtAbonnementsTest extends TestCase
{
    use RefreshDatabase;

    /** Entreprise abonnée avec une boutique, son gérant, un admin de boutique et un vendeur. */
    private function entreprise(int $maxUtilisateurs = 10, string $intervalle = 'month'): array
    {
        $s = 'droits-'.Str::lower(Str::random(8));
        $plan = Plan::create([
            'nom' => $s, 'slug' => $s, 'prix' => 10000, 'intervalle' => $intervalle,
            'max_boutiques' => 1, 'max_utilisateurs' => $maxUtilisateurs, 'features' => [], 'actif' => true,
        ]);
        $tenant = Tenant::create(['nom' => $s, 'slug' => $s, 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create(['nom' => $s, 'statut' => 'active']);
        $sub = $tenant->subscriptions()->create([
            'plan_id' => $plan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'billing_provider' => 'cash',
        ]);
        $tenant->licenses()->create([
            'subscription_id' => $sub->id, 'status' => 'active', 'cle' => 'CLE-'.strtoupper($s),
            'activated_at' => now(), 'expires_at' => now()->addMonth(),
        ]);
        $compte = fn (string $role) => User::factory()->create([
            'nom' => $role, 'email' => $role.'-'.$s, 'role' => $role, 'actif' => true, 'is_super_admin' => false,
            'tenant_id' => $tenant->id, 'boutique_id' => $boutique->id,
        ]);

        return [
            'plan' => $plan, 'tenant' => $tenant, 'sub' => $sub, 's' => $s,
            'gerant' => $compte('tenant_admin'), 'badmin' => $compte('boutique_admin'), 'vendeur' => $compte('vendeur'),
        ];
    }

    private function superAdmin(): User
    {
        return User::factory()->create([
            'nom' => 'Plateforme', 'email' => 'sa-'.uniqid(), 'role' => 'super_admin', 'actif' => true, 'is_super_admin' => true,
        ]);
    }

    private function fiche(User $u, array $changes = []): array
    {
        return array_merge(['nom' => $u->nom, 'email' => $u->email, 'role' => $u->role, 'actif' => true], $changes);
    }

    // Point 1 — comptes

    public function test_un_admin_de_boutique_ne_peut_ni_voir_ni_modifier_le_gerant(): void
    {
        $c = $this->entreprise();
        Sanctum::actingAs($c['badmin']);

        $ids = collect($this->getJson('/api/users')->assertOk()->json())->pluck('id');
        $this->assertNotContains($c['gerant']->id, $ids);
        $this->assertContains($c['vendeur']->id, $ids);

        $this->putJson('/api/users/'.$c['gerant']->id, $this->fiche($c['gerant'], ['role' => 'vendeur', 'mot_de_passe' => 'pirate123']))
            ->assertNotFound();
        $c['gerant']->refresh();
        $this->assertSame('tenant_admin', $c['gerant']->role);
        $this->assertFalse(Hash::check('pirate123', $c['gerant']->password));
    }

    public function test_un_admin_de_boutique_ne_peut_pas_nommer_un_gerant(): void
    {
        $c = $this->entreprise();
        Sanctum::actingAs($c['badmin']);

        $this->postJson('/api/users', ['nom' => 'X', 'email' => 'x-'.$c['s'], 'mot_de_passe' => 'abcdef', 'role' => 'tenant_admin', 'actif' => true])
            ->assertForbidden();
        $this->putJson('/api/users/'.$c['vendeur']->id, $this->fiche($c['vendeur'], ['role' => 'tenant_admin']))->assertForbidden();
        $this->putJson('/api/users/'.$c['badmin']->id, $this->fiche($c['badmin'], ['role' => 'tenant_admin']))->assertForbidden();
    }

    public function test_le_gerant_garde_son_role_en_modifiant_sa_fiche(): void
    {
        $c = $this->entreprise();
        Sanctum::actingAs($c['gerant']);

        // « admin » est le libellé de l'interface : il ne rétrograde plus le gérant.
        $this->putJson('/api/users/'.$c['gerant']->id, $this->fiche($c['gerant'], ['role' => 'admin', 'nom' => 'Délali']))->assertOk();
        $this->assertSame('tenant_admin', $c['gerant']->fresh()->role);

        $this->putJson('/api/users/'.$c['vendeur']->id, $this->fiche($c['vendeur'], ['role' => 'tenant_admin']))->assertOk();
        $this->assertSame('tenant_admin', $c['vendeur']->fresh()->role);
    }

    public function test_le_gerant_compte_comme_dernier_administrateur_actif(): void
    {
        $c = $this->entreprise();
        $c['badmin']->update(['actif' => false]);
        Sanctum::actingAs($c['gerant']);

        $this->putJson('/api/users/'.$c['gerant']->id, $this->fiche($c['gerant'], ['actif' => false]))->assertStatus(422);
        $this->assertTrue($c['gerant']->fresh()->actif);
    }

    // Point 2 — espace entreprise

    public function test_l_espace_entreprise_est_reserve_au_gerant(): void
    {
        $c = $this->entreprise();

        foreach (['vendeur', 'badmin'] as $qui) {
            Sanctum::actingAs($c[$qui]);
            foreach (['dashboard', 'subscription', 'payments', 'boutiques', 'notifications', 'plans'] as $page) {
                $this->getJson('/api/tenant/'.$page)->assertForbidden();
            }
        }

        Sanctum::actingAs($c['gerant']);
        $this->getJson('/api/tenant/subscription')->assertOk()->assertJsonPath('license.cle', 'CLE-'.strtoupper($c['s']));
    }

    // Point 3 — quota d'utilisateurs

    public function test_le_nombre_de_comptes_actifs_est_limite_par_l_offre(): void
    {
        $c = $this->entreprise(3); // gérant, admin de boutique et vendeur : l'offre est pleine
        Sanctum::actingAs($c['gerant']);
        $nouveau = ['nom' => 'N', 'email' => 'n-'.$c['s'], 'mot_de_passe' => 'abcdef', 'role' => 'vendeur', 'actif' => true];

        $this->postJson('/api/users', $nouveau)->assertStatus(422);
        // Un compte créé désactivé n'occupe pas de place.
        $this->postJson('/api/users', array_merge($nouveau, ['actif' => false]))->assertCreated();
        $inactif = User::where('email', 'n-'.$c['s'])->firstOrFail();
        $this->putJson('/api/users/'.$inactif->id, $this->fiche($inactif, ['actif' => true]))->assertStatus(422);

        // Désactiver un compte libère une place.
        $this->putJson('/api/users/'.$c['vendeur']->id, $this->fiche($c['vendeur'], ['actif' => false]))->assertOk();
        $this->putJson('/api/users/'.$inactif->id, $this->fiche($inactif, ['actif' => true]))->assertOk();
    }

    // Point 4 — création d'entreprise

    public function test_creer_une_entreprise_cree_son_gerant_sans_toucher_au_super_admin(): void
    {
        $sa = $this->superAdmin();
        Sanctum::actingAs($sa);

        $this->postJson('/api/super-admin/tenants', [
            'nom' => 'Pagnes Kafui', 'slug' => 'pagnes-kafui-'.uniqid(),
            'boutique' => ['nom' => 'Kafui Bè'],
            'gerant' => ['nom' => 'Kafui', 'identifiant' => 'kafui-'.uniqid(), 'mot_de_passe' => 'motdepasse1'],
        ])->assertOk()->assertJsonPath('gerant.role', 'tenant_admin');

        $sa->refresh();
        $this->assertNull($sa->tenant_id);
        $this->assertNull($sa->boutique_id);

        $gerant = User::where('role', 'tenant_admin')->latest('id')->firstOrFail();
        $this->assertNotNull($gerant->boutique_id);
        $this->assertTrue(Hash::check('motdepasse1', $gerant->password));
    }

    public function test_un_gerant_sans_boutique_est_refuse(): void
    {
        Sanctum::actingAs($this->superAdmin());

        $this->postJson('/api/super-admin/tenants', [
            'nom' => 'Sans boutique', 'slug' => 'sans-boutique-'.uniqid(),
            'gerant' => ['nom' => 'G', 'identifiant' => 'g-'.uniqid(), 'mot_de_passe' => 'motdepasse1'],
        ])->assertStatus(422)->assertJsonValidationErrors('boutique.nom');
    }

    // Point 5 — abonnement manuel

    public function test_abonnement_annuel_donne_une_licence_d_un_an_et_prolonge_la_licence_existante(): void
    {
        $c = $this->entreprise(10, 'year');
        $licence = $c['tenant']->licenses()->firstOrFail();
        Sanctum::actingAs($this->superAdmin());

        $r = $this->postJson('/api/super-admin/tenants/'.$c['tenant']->id.'/subscribe', ['plan_id' => $c['plan']->id, 'status' => 'active'])->assertOk();

        $fin = Subscription::findOrFail($r->json('subscription.id'))->ends_at;
        $this->assertTrue($fin->between(now()->addYear()->subMinute(), now()->addYear()->addMinute()));
        $this->assertSame($licence->id, $r->json('license.id'));
        $this->assertTrue($licence->fresh()->expires_at->equalTo($fin));
        $this->assertNull($r->json('subscription.trial_ends_at'));
        $this->assertSame(1, $c['tenant']->licenses()->count());
    }

    public function test_un_essai_dure_quatorze_jours(): void
    {
        $tenant = Tenant::create(['nom' => 'Essai', 'slug' => 'essai-'.uniqid(), 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'E', 'slug' => 'e-'.uniqid(), 'prix' => 0, 'intervalle' => 'year', 'max_boutiques' => 1, 'max_utilisateurs' => 3, 'features' => [], 'actif' => true]);
        Sanctum::actingAs($this->superAdmin());

        $this->postJson('/api/super-admin/tenants/'.$tenant->id.'/subscribe', ['plan_id' => $plan->id, 'status' => 'trial'])->assertOk();

        $sub = $tenant->subscriptions()->firstOrFail();
        $this->assertTrue($sub->ends_at->between(now()->addDays(14)->subMinute(), now()->addDays(14)->addMinute()));
        $this->assertTrue($sub->trial_ends_at->equalTo($sub->ends_at));
        $this->assertTrue($tenant->licenses()->firstOrFail()->expires_at->equalTo($sub->ends_at));
    }

    // Point 6 — accès selon l'abonnement

    public function test_un_essai_termine_ou_sans_date_ne_donne_plus_acces(): void
    {
        $c = $this->entreprise();
        $sub = $c['sub'];

        $sub->update(['status' => 'trial', 'ends_at' => null, 'trial_ends_at' => null]);
        $this->assertFalse($c['tenant']->fresh()->isActive());

        $sub->update(['trial_ends_at' => now()->subDay()]);
        $this->assertFalse($c['tenant']->fresh()->isActive());

        $sub->update(['trial_ends_at' => now()->addDay()]);
        $this->assertTrue($c['tenant']->fresh()->isActive());
    }

    public function test_un_abonnement_annule_coupe_l_acces_meme_si_la_licence_court(): void
    {
        $c = $this->entreprise();
        $c['sub']->update(['status' => 'cancelled']); // la licence reste « active » jusqu'à son échéance

        $this->assertFalse($c['tenant']->fresh()->isActive());
        Sanctum::actingAs($c['vendeur']);
        $this->getJson('/api/produits')->assertForbidden();
    }

    public function test_une_licence_suspendue_coupe_l_acces(): void
    {
        $c = $this->entreprise();
        $c['tenant']->licenses()->update(['status' => 'suspended']);

        $this->assertFalse($c['tenant']->fresh()->isActive());
    }

    // Point 7 — saisie d'un paiement

    public function test_un_paiement_saisi_ne_reactive_pas_un_abonnement_expire(): void
    {
        $c = $this->entreprise();
        $c['sub']->update(['status' => 'expired', 'ends_at' => now()->subDay()]);
        Sanctum::actingAs($this->superAdmin());

        $this->postJson('/api/super-admin/tenants/'.$c['tenant']->id.'/payments', [
            'amount' => 10000, 'status' => 'paid', 'payment_method' => 'cash', 'payment_reference' => 'RECU-'.uniqid(),
        ])->assertOk();

        $sub = $c['sub']->fresh();
        $this->assertSame('expired', $sub->status);
        $this->assertTrue($sub->ends_at->isPast());
        $this->assertSame('cash', $sub->billing_provider);
        $this->assertFalse($c['tenant']->fresh()->isActive());
    }
}
