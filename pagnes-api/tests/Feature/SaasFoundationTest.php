<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SaasFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_create_tenant_and_boutique(): void
    {
        $superAdmin = User::factory()->create([
            'nom' => 'Super Admin',
            'email' => 'superadmin@example.com',
            'role' => 'super_admin',
            'actif' => true,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($superAdmin);

        $response = $this->postJson('/api/super-admin/tenants', [
            'nom' => 'Boutique Demo',
            'slug' => 'boutique-demo',
            'boutique' => [
                'nom' => 'Boutique 1',
                'adresse' => 'Lomé',
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('tenants', ['slug' => 'boutique-demo']);
        $this->assertDatabaseHas('boutiques', ['nom' => 'Boutique 1']);
    }

    public function test_non_super_admin_cannot_access_super_admin_routes(): void
    {
        $admin = User::factory()->create([
            'nom' => 'Admin',
            'email' => 'admin@example.com',
            'role' => 'admin',
            'actif' => true,
            'is_super_admin' => false,
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/super-admin/tenants')->assertForbidden();
    }
}
