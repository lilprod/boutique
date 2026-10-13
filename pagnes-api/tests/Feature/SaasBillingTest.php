<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Produit;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SaasBillingTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_payment_method_and_reference_are_saved_with_subscription(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Payment Admin',
            'email' => 'payment-admin@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $this->postJson('/api/super-admin/plans', [
            'nom' => 'Starter',
            'slug' => 'starter-manual',
            'prix' => 15000,
            'intervalle' => 'month',
            'max_boutiques' => 3,
            'max_utilisateurs' => 10,
            'features' => ['stock', 'ventes'],
        ])->assertCreated();

        $tenant = Tenant::create(['nom' => 'Payment Tenant', 'slug' => 'payment-tenant', 'statut' => 'active']);

        $response = $this->postJson('/api/super-admin/tenants/'.$tenant->id.'/subscribe', [
            'plan_id' => Plan::first()->id,
            'status' => 'active',
            'payment_method' => 'flooz',
            'payment_reference' => 'FLOOZ-892341',
        ]);

        $response->assertOk();
        $response->assertJsonPath('subscription.billing_provider', 'flooz');
        $response->assertJsonPath('subscription.external_reference', 'FLOOZ-892341');
        $this->assertDatabaseHas('subscriptions', ['tenant_id' => $tenant->id, 'billing_provider' => 'flooz', 'external_reference' => 'FLOOZ-892341']);
    }

    public function test_manual_payment_history_and_admin_reporting_are_available(): void
    {
        Storage::fake('local');

        $superAdmin = User::factory()->create([
            'nom' => 'Reports Admin',
            'email' => 'reports-admin@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $tenantA = Tenant::create(['nom' => 'Tenant Payments A', 'slug' => 'tenant-payments-a', 'statut' => 'active']);
        $tenantB = Tenant::create(['nom' => 'Tenant Payments B', 'slug' => 'tenant-payments-b', 'statut' => 'active']);

        $plan = Plan::create([
            'nom' => 'Pro',
            'slug' => 'pro-reports',
            'prix' => 25000,
            'intervalle' => 'month',
            'max_boutiques' => 3,
            'max_utilisateurs' => 8,
            'features' => ['stock', 'ventes', 'users'],
            'actif' => true,
        ]);

        $subscriptionA = $tenantA->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(7),
            'billing_provider' => 'flooz',
            'external_reference' => 'FLOOZ-A-001',
        ]);

        $tenantA->licenses()->create([
            'subscription_id' => $subscriptionA->id,
            'status' => 'active',
            'cle' => 'PAYMENT-REPORT-A',
            'activated_at' => now(),
            'expires_at' => now()->addMonth(),
            'quota_usage' => ['boutiques' => 1, 'utilisateurs' => 1],
        ]);

        $paymentResponse = $this->post('/api/super-admin/tenants/'.$tenantA->id.'/payments', [
            'amount' => 25000,
            'payment_method' => 'flooz',
            'payment_reference' => 'FLOOZ-A-001',
            'status' => 'paid',
            'notes' => 'Paiement reçu',
            'attachment' => UploadedFile::fake()->create('recu.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();
        $paymentId = $paymentResponse->json('payment.id');
        $invoiceNumber = $paymentResponse->json('payment.invoice_number');
        $this->assertNotEmpty($invoiceNumber);
        $this->assertDatabaseHas('payments', ['id' => $paymentId, 'invoice_number' => $invoiceNumber]);

        $otherPaymentResponse = $this->post('/api/super-admin/tenants/'.$tenantB->id.'/payments', [
            'amount' => 25000,
            'payment_method' => 'tmoney',
            'payment_reference' => 'TMONEY-B-001',
            'status' => 'rejected',
            'notes' => 'Transaction refusée',
            'attachment' => UploadedFile::fake()->create('autre-recu.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk();

        $reportResponse = $this->getJson('/api/super-admin/payments');
        $reportResponse->assertOk();
        $reportResponse->assertJsonPath('totals.paid', 1);
        $reportResponse->assertJsonPath('totals.rejected', 1);
        $reportResponse->assertJsonCount(2, 'transactions');

        $this->get('/api/super-admin/payments/'.$paymentId.'/invoice')
            ->assertOk()
            ->assertHeader('content-type', 'text/html; charset=UTF-8')
            ->assertSee($invoiceNumber)
            ->assertSee('25 000');
        $this->get('/api/super-admin/payments/'.$paymentId.'/attachment')->assertOk();
        $csvResponse = $this->get('/api/super-admin/payments/export.csv?status=paid');
        $csvResponse->assertOk();
        $csv = $csvResponse->streamedContent();
        $this->assertStringContainsString('FLOOZ-A-001', $csv);
        $this->assertStringNotContainsString('TMONEY-B-001', $csv);

        $tenantUser = User::factory()->create([
            'nom' => 'Tenant Payment User',
            'email' => 'tenant-payment-user@example.com',
            'role' => 'tenant_admin',
            'actif' => true,
            'tenant_id' => $tenantA->id,
        ]);

        Sanctum::actingAs($tenantUser);
        $tenantResponse = $this->getJson('/api/tenant/payments');
        $tenantResponse->assertOk();
        $tenantResponse->assertJsonCount(1, 'transactions');
        $this->get('/api/tenant/payments/'.$paymentId.'/invoice')->assertOk()->assertSee($invoiceNumber);
        $this->get('/api/tenant/payments/'.$paymentId.'/attachment')->assertOk();
        $otherPaymentId = $otherPaymentResponse->json('payment.id');
        $this->get('/api/tenant/payments/'.$otherPaymentId.'/invoice')->assertNotFound();
        $this->get('/api/tenant/payments/'.$otherPaymentId.'/attachment')->assertNotFound();
    }

    public function test_super_admin_can_create_plan_and_subscribe_tenant(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Super Admin',
            'email' => 'superadmin-billing@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $planResponse = $this->postJson('/api/super-admin/plans', [
            'nom' => 'Starter',
            'slug' => 'starter',
            'prix' => 15000,
            'intervalle' => 'month',
            'max_boutiques' => 3,
            'max_utilisateurs' => 10,
            'features' => ['stock', 'ventes'],
        ]);

        $planResponse->assertCreated();
        $this->assertDatabaseHas('plans', ['slug' => 'starter']);

        $tenant = Tenant::create(['nom' => 'Tenant A', 'slug' => 'tenant-a', 'statut' => 'active']);

        $subscribeResponse = $this->postJson('/api/super-admin/tenants/'.$tenant->id.'/subscribe', [
            'plan_id' => Plan::first()->id,
            'status' => 'active',
            'billing_provider' => 'manual',
        ]);

        $subscribeResponse->assertOk();
        $this->assertDatabaseHas('subscriptions', ['tenant_id' => $tenant->id]);
        $this->assertDatabaseHas('licenses', ['tenant_id' => $tenant->id]);
    }

    public function test_non_super_admin_cannot_access_billing_routes(): void
    {
        $admin = User::factory()->create([
            'nom' => 'Admin',
            'email' => 'admin-billing@example.com',
            'role' => 'admin',
            'actif' => true,
            'is_super_admin' => false,
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/super-admin/plans')->assertForbidden();
    }

    public function test_tenant_plan_limits_are_enforced_by_active_subscription(): void
    {
        $tenant = Tenant::create(['nom' => 'Plan Tenant', 'slug' => 'plan-tenant', 'statut' => 'active']);

        $this->assertFalse($tenant->canAddBoutique());
        $this->assertFalse($tenant->canAddUser());

        $plan = Plan::create([
            'nom' => 'Business',
            'slug' => 'business',
            'prix' => 25000,
            'intervalle' => 'month',
            'max_boutiques' => 2,
            'max_utilisateurs' => 3,
            'features' => ['stock', 'ventes', 'users'],
            'actif' => true,
        ]);

        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(14),
            'billing_provider' => 'manual',
        ]);

        $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => 'PLAN-TEST-123',
            'activated_at' => now(),
            'expires_at' => now()->addMonth(),
            'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
        ]);

        $this->assertTrue($tenant->canAddBoutique());
        $this->assertTrue($tenant->canAddUser());
    }

    public function test_trial_subscription_keeps_tenant_active_and_expired_license_does_not(): void
    {
        $tenant = Tenant::create(['nom' => 'Billing Lifecycle', 'slug' => 'billing-lifecycle', 'statut' => 'active']);

        $plan = Plan::create([
            'nom' => 'Trial Pro',
            'slug' => 'trial-pro',
            'prix' => 18000,
            'intervalle' => 'month',
            'max_boutiques' => 2,
            'max_utilisateurs' => 5,
            'features' => ['stock', 'ventes'],
            'actif' => true,
        ]);

        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'trial',
            'starts_at' => now()->subDays(5),
            'ends_at' => now()->addDays(12),
            'trial_ends_at' => now()->addDays(7),
            'billing_provider' => 'manual',
        ]);

        $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => 'TRIAL-LICENSE-1',
            'activated_at' => now()->subDays(5),
            'expires_at' => now()->addDays(12),
            'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
        ]);

        $this->assertTrue($tenant->isActive());
        $this->assertTrue($tenant->hasFeature('stock'));
        $this->assertNotNull($tenant->activeSubscription());
        $this->assertSame('trial', $tenant->activeSubscription()->status);

        $expiredLicense = $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'expired',
            'cle' => 'TRIAL-LICENSE-EXPIRED',
            'activated_at' => now()->subDays(20),
            'expires_at' => now()->subDays(1),
            'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
        ]);

        $this->assertNotSame($expiredLicense->id, $tenant->activeLicense()->id);
    }

    public function test_tenant_and_boutique_roles_are_recognized(): void
    {
        $tenantAdmin = new User(['role' => 'tenant_admin']);
        $boutiqueAdmin = new User(['role' => 'boutique_admin']);
        $vendeur = new User(['role' => 'vendeur']);

        $this->assertTrue($tenantAdmin->isTenantAdmin());
        $this->assertTrue($boutiqueAdmin->isBoutiqueAdmin());
        $this->assertTrue($vendeur->isVendeur());
        $this->assertTrue($tenantAdmin->estAdmin());
        $this->assertTrue($boutiqueAdmin->estAdmin());
        $this->assertFalse($vendeur->estAdmin());
    }

    public function test_products_are_filtered_by_tenant_context(): void
    {
        $tenantA = Tenant::create(['nom' => 'Tenant A', 'slug' => 'tenant-a', 'statut' => 'active']);
        $tenantB = Tenant::create(['nom' => 'Tenant B', 'slug' => 'tenant-b', 'statut' => 'active']);

        $boutiqueA = $tenantA->boutiques()->create([
            'nom' => 'Boutique A',
            'adresse' => 'Adresse A',
            'telephone' => '123',
            'devise' => 'XOF',
            'timezone' => 'Africa/Lome',
            'statut' => 'active',
        ]);

        $activePlan = Plan::create([
            'nom' => 'Boutique access', 'slug' => 'boutique-access', 'prix' => 0, 'intervalle' => 'month',
            'max_boutiques' => 1, 'max_utilisateurs' => 5, 'features' => ['stock'], 'actif' => true,
        ]);
        $subscription = $tenantA->subscriptions()->create([
            'plan_id' => $activePlan->id, 'status' => 'active', 'starts_at' => now(), 'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(14), 'billing_provider' => 'manual',
        ]);
        $tenantA->licenses()->create([
            'subscription_id' => $subscription->id, 'status' => 'active', 'cle' => 'ISOLATION-TEST',
            'activated_at' => now(), 'expires_at' => now()->addMonth(), 'quota_usage' => [],
        ]);

        $tenantAdmin = User::factory()->create([
            'nom' => 'Tenant admin',
            'email' => 'tenant-admin-context@example.com',
            'role' => 'boutique_admin',
            'tenant_id' => $tenantA->id,
            'boutique_id' => $boutiqueA->id,
            'actif' => true,
            'is_super_admin' => false,
        ]);

        $ownProduct = Produit::create([
            'nom' => 'Produit A',
            'type' => 'Pagne',
            'motif' => 'Test',
            'origine' => 'Local',
            'yards_par_pagne' => 12.5,
            'vend_pagne' => true,
            'vend_yard' => true,
            'prix_pagne' => 15000,
            'prix_yard' => 1200,
            'prix_achat_pagne' => 9000,
            'tenant_id' => $tenantA->id,
            'boutique_id' => $boutiqueA->id,
        ]);

        Produit::create([
            'nom' => 'Produit B',
            'type' => 'Pagne',
            'motif' => 'Autre',
            'origine' => 'Local',
            'yards_par_pagne' => 12.5,
            'vend_pagne' => true,
            'vend_yard' => true,
            'prix_pagne' => 20000,
            'prix_yard' => 1500,
            'prix_achat_pagne' => 12000,
            'tenant_id' => $tenantB->id,
            'boutique_id' => $boutiqueA->id,
        ]);

        Sanctum::actingAs($tenantAdmin);

        $response = $this->getJson('/api/produits');

        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertSame($ownProduct->id, $response->json()[0]['id']);
    }

    public function test_super_admin_dashboard_returns_global_metrics(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Super Admin',
            'email' => 'super-admin-dashboard@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $tenantA = Tenant::create(['nom' => 'Tenant A', 'slug' => 'tenant-a', 'statut' => 'active']);
        $tenantB = Tenant::create(['nom' => 'Tenant B', 'slug' => 'tenant-b', 'statut' => 'inactive']);

        $tenantA->boutiques()->create([
            'nom' => 'Boutique A',
            'adresse' => 'Adr A',
            'telephone' => '123',
            'devise' => 'XOF',
            'timezone' => 'Africa/Lome',
            'statut' => 'active',
        ]);

        $plan = Plan::create([
            'nom' => 'Premium',
            'slug' => 'premium',
            'prix' => 30000,
            'intervalle' => 'month',
            'max_boutiques' => 5,
            'max_utilisateurs' => 10,
            'features' => ['stock', 'ventes', 'users'],
            'actif' => true,
        ]);

        $subscription = $tenantA->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(10),
            'billing_provider' => 'manual',
        ]);

        $tenantA->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => 'DASHBOARD-LICENSE-1',
            'activated_at' => now(),
            'expires_at' => now()->addDays(6),
            'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
        ]);

        $response = $this->getJson('/api/super-admin/dashboard');

        $response->assertOk();
        $response->assertJsonPath('totals.total_tenants', 2);
        $response->assertJsonPath('totals.active_tenants', 1);
        $response->assertJsonPath('totals.active_subscriptions', 1);
        $response->assertJsonPath('totals.total_boutiques', 1);
        $response->assertJsonPath('totals.mrr', 30000);
    }

    public function test_super_admin_can_update_subscription_and_license_status(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Billing Admin',
            'email' => 'billing-admin@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $tenant = Tenant::create(['nom' => 'Lifecycle Tenant', 'slug' => 'lifecycle-tenant', 'statut' => 'active']);
        $plan = Plan::create([
            'nom' => 'Scale',
            'slug' => 'scale',
            'prix' => 32000,
            'intervalle' => 'month',
            'max_boutiques' => 5,
            'max_utilisateurs' => 12,
            'features' => ['stock', 'ventes', 'users'],
            'actif' => true,
        ]);

        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(7),
            'billing_provider' => 'manual',
        ]);

        $license = $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => 'LIFECYCLE-LICENSE-1',
            'activated_at' => now(),
            'expires_at' => now()->addMonth(),
            'quota_usage' => ['boutiques' => 0, 'utilisateurs' => 0],
        ]);

        $response = $this->putJson('/api/super-admin/tenants/'.$tenant->id.'/subscription-status', [
            'status' => 'cancelled',
            'license_status' => 'suspended',
        ]);

        $response->assertOk();
        $response->assertJsonPath('subscription.status', 'cancelled');
        $response->assertJsonPath('license.status', 'suspended');
        $this->assertDatabaseHas('subscriptions', ['id' => $subscription->id, 'status' => 'cancelled']);
        $this->assertDatabaseHas('licenses', ['id' => $license->id, 'status' => 'suspended']);
    }

    /** Contexte de renouvellement : un tenant abonné, sa licence, un super admin connecté. */
    private function contexteRenouvellement(string $intervalle = 'month', ?\DateTimeInterface $fin = null, string $statut = 'active'): array
    {
        $fin ??= now()->addDays(10);
        $tenant = Tenant::create(['nom' => 'Pagnes Akossiwa', 'slug' => 'pagnes-akossiwa-'.uniqid(), 'statut' => 'active']);
        $plan = Plan::create([
            'nom' => 'Pro', 'slug' => 'pro-'.uniqid(), 'prix' => 25000, 'intervalle' => $intervalle,
            'max_boutiques' => 3, 'max_utilisateurs' => 8, 'features' => [], 'actif' => true,
        ]);
        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id, 'status' => $statut, 'starts_at' => now()->subMonth(), 'ends_at' => $fin, 'billing_provider' => 'cash',
        ]);
        $license = $tenant->licenses()->create([
            'subscription_id' => $subscription->id, 'status' => $statut === 'active' ? 'active' : 'expired',
            'cle' => 'RENOUV-'.uniqid(), 'activated_at' => now()->subMonth(), 'expires_at' => $fin, 'quota_usage' => [],
        ]);
        $superAdmin = User::factory()->create([
            'nom' => 'Plateforme', 'email' => 'plateforme-'.uniqid().'@example.com', 'role' => 'super_admin', 'actif' => true, 'is_super_admin' => true,
        ]);
        Sanctum::actingAs($superAdmin);

        return compact('tenant', 'plan', 'subscription', 'license', 'superAdmin');
    }

    private function renouveler(Tenant $tenant, array $champs)
    {
        return $this->postJson('/api/super-admin/tenants/'.$tenant->id.'/renouvellements', $champs + [
            'periodes' => 1, 'amount' => 25000, 'payment_method' => 'tmoney', 'payment_reference' => 'TM-'.uniqid(),
        ]);
    }

    /** Le tenant pouvait se renouveler lui-même, gratuitement, depuis son portail. */
    public function test_le_tenant_ne_peut_plus_se_renouveler_lui_meme(): void
    {
        ['tenant' => $tenant, 'license' => $license] = $this->contexteRenouvellement();
        $admin = User::factory()->create([
            'nom' => 'Admin tenant', 'email' => 'admin-tenant@example.com', 'role' => 'tenant_admin', 'actif' => true, 'tenant_id' => $tenant->id,
        ]);
        Sanctum::actingAs($admin);

        $this->putJson('/api/tenant/subscription/license', ['action' => 'renew'])->assertNotFound();
        $this->putJson('/api/tenant/subscription/plan', ['plan_id' => Plan::first()->id])->assertNotFound();
        $this->postJson('/api/super-admin/tenants/'.$tenant->id.'/renouvellements', [])->assertForbidden();
        $this->assertEquals($license->expires_at, $license->fresh()->expires_at);
        $this->getJson('/api/tenant/subscription')->assertOk(); // la consultation reste possible
    }

    public function test_renouvellement_anticipe_prolonge_depuis_la_fin_en_cours(): void
    {
        ['tenant' => $tenant, 'plan' => $plan, 'superAdmin' => $sa] = $this->contexteRenouvellement(fin: now()->addDays(10)->startOfSecond());
        $finActuelle = now()->addDays(10)->startOfSecond();

        $r = $this->renouveler($tenant, ['plan_id' => $plan->id, 'periodes' => 3, 'amount' => 75000, 'payment_reference' => 'TM-889900', 'notes' => 'Reçu au bureau'])
            ->assertCreated();

        $attendu = $finActuelle->copy()->addMonthsNoOverflow(3);
        $this->assertTrue($attendu->equalTo($tenant->subscriptions()->latest('id')->first()->ends_at));
        $this->assertTrue($attendu->equalTo($tenant->licenses()->latest('id')->first()->expires_at));
        $r->assertJsonPath('license.status', 'active');
        $r->assertJsonPath('payment.status', 'paid');
        $r->assertJsonPath('payment.amount', 75000);
        $r->assertJsonPath('payment.payment_method', 'tmoney');
        $r->assertJsonPath('payment.payment_reference', 'TM-889900');
        $r->assertJsonPath('payment.created_by.id', $sa->id); // qui a encaissé, pour contrôle
        $this->assertMatchesRegularExpression('/^FAC-\d{4}-\d{8}$/', $r->json('payment.invoice_number'));
    }

    public function test_renouvellement_d_une_licence_expiree_repart_d_aujourd_hui_et_reactive_le_tenant(): void
    {
        ['tenant' => $tenant, 'plan' => $plan] = $this->contexteRenouvellement(fin: now()->subDays(5), statut: 'expired');
        $this->assertFalse($tenant->fresh()->isActive());

        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_method' => 'cash', 'payment_reference' => 'RECU-0042'])->assertCreated();

        $fin = $tenant->licenses()->latest('id')->first()->expires_at;
        $this->assertTrue($fin->between(now()->addMonth()->subMinute(), now()->addMonth()->addMinute()));
        $this->assertSame('active', $tenant->subscriptions()->latest('id')->first()->status);
        $this->assertTrue($tenant->fresh()->isActive());
    }

    public function test_renouvellement_d_un_plan_annuel_ajoute_des_annees(): void
    {
        ['tenant' => $tenant, 'plan' => $plan] = $this->contexteRenouvellement('year', now()->subDay(), 'expired');

        $this->renouveler($tenant, ['plan_id' => $plan->id, 'periodes' => 2, 'payment_method' => 'card', 'payment_reference' => 'CB-123456'])->assertCreated();

        $fin = $tenant->licenses()->latest('id')->first()->expires_at;
        $this->assertTrue($fin->between(now()->addYears(2)->subMinute(), now()->addYears(2)->addMinute()));
    }

    /** La référence sert au contrôle : une même référence ne peut pas être encaissée deux fois pour un même mode. */
    public function test_reference_en_double_et_mode_invalide_refuses(): void
    {
        ['tenant' => $tenant, 'plan' => $plan, 'license' => $license] = $this->contexteRenouvellement();

        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_method' => 'flooz', 'payment_reference' => 'FZ-777'])->assertCreated();
        $finApresPremier = $license->fresh()->expires_at;

        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_method' => 'flooz', 'payment_reference' => 'FZ-777'])
            ->assertStatus(422)->assertJsonPath('errors.payment_reference.0', 'Cette référence a déjà été enregistrée pour ce mode de paiement.');
        $this->assertEquals($finApresPremier, $license->fresh()->expires_at); // rien n'a été prolongé

        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_method' => 'manual'])->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_reference' => ''])->assertStatus(422)->assertJsonValidationErrors('payment_reference');
        $this->renouveler($tenant, ['plan_id' => $plan->id, 'periodes' => 0])->assertStatus(422)->assertJsonValidationErrors('periodes');

        // Même référence, autre mode : c'est une autre transaction.
        $this->renouveler($tenant, ['plan_id' => $plan->id, 'payment_method' => 'tmoney', 'payment_reference' => 'FZ-777'])->assertCreated();
        $this->assertSame(2, \App\Models\Payment::where('tenant_id', $tenant->id)->count());
    }

    public function test_tenant_portal_returns_account_context_and_subscription(): void
    {
        $tenant = Tenant::create(['nom' => 'Portal Tenant', 'slug' => 'portal-tenant', 'statut' => 'active']);
        $boutique = $tenant->boutiques()->create([
            'nom' => 'Boutique Portal',
            'adresse' => 'Adresse Portal',
            'telephone' => '123456',
            'devise' => 'XOF',
            'timezone' => 'Africa/Lome',
            'statut' => 'active',
        ]);

        $plan = Plan::create([
            'nom' => 'Business',
            'slug' => 'business',
            'prix' => 25000,
            'intervalle' => 'month',
            'max_boutiques' => 3,
            'max_utilisateurs' => 8,
            'features' => ['stock', 'ventes', 'users'],
            'actif' => true,
        ]);

        $subscription = $tenant->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'trial_ends_at' => now()->addDays(7),
            'billing_provider' => 'manual',
        ]);

        $license = $tenant->licenses()->create([
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'cle' => 'PORTAL-LICENSE-1',
            'activated_at' => now(),
            'expires_at' => now()->addMonth(),
            'quota_usage' => ['boutiques' => 1, 'utilisateurs' => 1],
        ]);

        $user = User::factory()->create([
            'nom' => 'Tenant Admin',
            'email' => 'tenant-admin-portal@example.com',
            'role' => 'tenant_admin',
            'tenant_id' => $tenant->id,
            'boutique_id' => $boutique->id,
            'actif' => true,
            'is_super_admin' => false,
        ]);

        Sanctum::actingAs($user);

        $plansResponse = $this->getJson('/api/tenant/plans');
        $plansResponse->assertOk()->assertJsonCount(1);
        $this->getJson('/api/super-admin/plans')->assertForbidden();

        $response = $this->getJson('/api/tenant/dashboard');

        $response->assertOk();
        $response->assertJsonPath('tenant.id', $tenant->id);
        $response->assertJsonPath('subscription.id', $subscription->id);
        $response->assertJsonPath('license.id', $license->id);
        $response->assertJsonPath('boutiques.0.id', $boutique->id);
        $response->assertJsonPath('boutique_access', true);
    }
}
