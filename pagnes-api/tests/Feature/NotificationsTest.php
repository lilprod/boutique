<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Cloche de l'entête et menu profil des espaces plateforme et entreprise. */
class NotificationsTest extends TestCase
{
    use RefreshDatabase;

    private function entreprise(string $nom, \DateTimeInterface $fin, string $statut = 'active'): Tenant
    {
        $tenant = Tenant::create(['nom' => $nom, 'slug' => 'n-'.uniqid(), 'statut' => 'active']);
        $tenant->boutiques()->create(['nom' => "Boutique {$nom}", 'statut' => 'active']);
        $plan = Plan::create(['nom' => 'P', 'slug' => 'p-'.uniqid(), 'prix' => 15000, 'intervalle' => 'month', 'max_boutiques' => 1, 'max_utilisateurs' => 3, 'features' => [], 'actif' => true]);
        $sub = $tenant->subscriptions()->create(['plan_id' => $plan->id, 'status' => $statut, 'starts_at' => now()->subMonth(), 'ends_at' => $fin]);
        $tenant->licenses()->create(['subscription_id' => $sub->id, 'status' => $statut === 'active' ? 'active' : 'expired', 'cle' => 'N-'.uniqid(), 'activated_at' => now()->subMonth(), 'expires_at' => $fin, 'quota_usage' => []]);

        return $tenant;
    }

    private function superAdmin(): User
    {
        return User::factory()->create(['nom' => 'Plateforme', 'email' => 'sa-'.uniqid(), 'role' => 'super_admin', 'is_super_admin' => true, 'actif' => true]);
    }

    public function test_cloche_du_super_admin_problemes_d_abord(): void
    {
        $this->entreprise('Wax Akofa', now()->addDays(3));
        $expiree = $this->entreprise('Kente Royal', now()->subDays(2), 'expired');
        $this->entreprise('Tranquille', now()->addMonths(6));
        $expiree->payments()->create(['amount' => 15000, 'status' => 'pending', 'payment_method' => 'flooz', 'payment_reference' => 'FZ-1']);

        Sanctum::actingAs($this->superAdmin());
        $n = $this->getJson('/api/super-admin/notifications')->assertOk()->json();

        $this->assertSame(['Licence expirée', 'Licence bientôt expirée', 'Paiement à vérifier'], array_column($n, 'titre'));
        $this->assertSame(['bad', 'warn', 'warn'], array_column($n, 'niveau'));
        $this->assertStringContainsString('Kente Royal', $n[0]['message']);
        $this->assertStringContainsString('Wax Akofa', $n[1]['message']);
        $this->assertSame('/paiements', $n[2]['lien']);
        $this->assertCount(3, array_unique(array_column($n, 'id')));
        $this->assertNotContains('Tranquille', array_map(fn ($x) => explode(' · ', $x['message'])[0], $n));
    }

    /** L'identifiant change avec la situation : une licence renouvelée redevient une nouvelle notification. */
    public function test_identifiant_change_quand_la_licence_change(): void
    {
        $tenant = $this->entreprise('Wax Akofa', now()->addDays(3));
        Sanctum::actingAs($this->superAdmin());
        $avant = $this->getJson('/api/super-admin/notifications')->json('0.id');

        $tenant->licenses()->first()->update(['expires_at' => now()->addDays(5)]);
        $this->assertNotSame($avant, $this->getJson('/api/super-admin/notifications')->json('0.id'));
    }

    public function test_cloche_de_l_entreprise_limitee_a_ses_donnees(): void
    {
        $moi = $this->entreprise('Wax Akofa', now()->addDays(2));
        $autre = $this->entreprise('Kente Royal', now()->subDay(), 'expired');
        $moi->payments()->create(['amount' => 35000, 'status' => 'paid', 'payment_method' => 'tmoney', 'payment_reference' => 'TM-1', 'invoice_number' => 'FAC-2026-00000001']);
        $autre->payments()->create(['amount' => 15000, 'status' => 'pending', 'payment_method' => 'cash', 'payment_reference' => 'R-1']);
        $admin = User::factory()->create(['nom' => 'Akofa', 'email' => 'akofa-'.uniqid(), 'role' => 'tenant_admin', 'actif' => true,
            'tenant_id' => $moi->id, 'boutique_id' => $moi->boutiques()->value('id')]);

        Sanctum::actingAs($admin);
        $n = $this->getJson('/api/tenant/notifications')->assertOk()->json();

        $this->assertSame(['Licence bientôt expirée', 'Paiement reçu'], array_column($n, 'titre'));
        $this->assertStringContainsString('FAC-2026-00000001', $n[1]['message']);
        $this->getJson('/api/super-admin/notifications')->assertForbidden();
    }

    public function test_profil_avec_identifiant_entreprise_et_boutique(): void
    {
        $tenant = $this->entreprise('Wax Akofa', now()->addMonth());
        $admin = User::factory()->create(['nom' => 'Akofa', 'email' => 'akofa', 'role' => 'tenant_admin', 'actif' => true,
            'tenant_id' => $tenant->id, 'boutique_id' => $tenant->boutiques()->value('id')]);
        Sanctum::actingAs($admin);

        $this->getJson('/api/me')->assertOk()->assertJson([
            'nom' => 'Akofa', 'role' => 'tenant_admin', 'identifiant' => 'akofa', 'entreprise' => 'Wax Akofa', 'boutique' => 'Boutique Wax Akofa',
        ]);

        Sanctum::actingAs($this->superAdmin());
        $this->getJson('/api/me')->assertOk()->assertJsonPath('entreprise', null);
    }
}
