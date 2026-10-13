<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::transaction(function (): void {
            $tables = ['users', 'produits', 'variantes', 'clients', 'ventes', 'lignes_vente', 'mouvements', 'parametres'];
            $hasLegacyRows = collect($tables)->contains(fn (string $name) => DB::table($name)->whereNull('tenant_id')->exists());

            if ($hasLegacyRows) {
                $shopName = DB::table('parametres')->whereNull('tenant_id')->orderBy('id')->value('boutique') ?: 'Boutique historique';
                $baseSlug = Str::limit(Str::slug($shopName), 100, '').'-historique';
                $slug = $baseSlug;
                $suffix = 1;
                while (DB::table('tenants')->where('slug', $slug)->exists()) {
                    $slug = $baseSlug.'-'.$suffix++;
                }

                $timestamp = now();
                $tenantId = DB::table('tenants')->insertGetId([
                    'nom' => $shopName,
                    'slug' => $slug,
                    'statut' => 'active',
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ]);
                $parametres = DB::table('parametres')->whereNull('tenant_id')->orderBy('id')->first();
                $boutiqueId = DB::table('boutiques')->insertGetId([
                    'tenant_id' => $tenantId,
                    'nom' => $shopName,
                    'adresse' => $parametres?->adresse,
                    'telephone' => $parametres?->telephone,
                    'devise' => 'XOF',
                    'timezone' => 'Africa/Lome',
                    'statut' => 'active',
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ]);

                foreach ($tables as $tableName) {
                    DB::table($tableName)->whereNull('tenant_id')->update([
                        'tenant_id' => $tenantId,
                        'boutique_id' => $boutiqueId,
                    ]);
                }

                $planId = DB::table('plans')->where('slug', 'legacy-transition')->value('id');
                if (! $planId) {
                    $planId = DB::table('plans')->insertGetId([
                        'nom' => 'Transition historique',
                        'slug' => 'legacy-transition',
                        'prix' => 0,
                        'intervalle' => 'month',
                        'max_boutiques' => 1,
                        'max_utilisateurs' => max(5, DB::table('users')->where('tenant_id', $tenantId)->count()),
                        'features' => json_encode(['stock', 'ventes', 'users']),
                        'actif' => true,
                        'created_at' => $timestamp,
                        'updated_at' => $timestamp,
                    ]);
                }

                $trialEndsAt = $timestamp->copy()->addDays(30);
                $subscriptionId = DB::table('subscriptions')->insertGetId([
                    'tenant_id' => $tenantId,
                    'plan_id' => $planId,
                    'status' => 'trial',
                    'starts_at' => $timestamp,
                    'ends_at' => $trialEndsAt,
                    'trial_ends_at' => $trialEndsAt,
                    'billing_provider' => 'manual',
                    'external_reference' => 'legacy-migration',
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ]);
                DB::table('licenses')->insert([
                    'tenant_id' => $tenantId,
                    'subscription_id' => $subscriptionId,
                    'status' => 'active',
                    'cle' => Str::upper(Str::random(16)),
                    'activated_at' => $timestamp,
                    'expires_at' => $trialEndsAt,
                    'quota_usage' => json_encode(['boutiques' => 1, 'utilisateurs' => 0]),
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ]);
            }
        });

        Schema::table('ventes', function (Blueprint $table): void {
            $table->dropUnique('ventes_numero_unique');
            $table->unique(['tenant_id', 'boutique_id', 'numero'], 'ventes_context_numero_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('ventes', function (Blueprint $table): void {
            $table->dropUnique('ventes_context_numero_unique');
            $table->unique('numero', 'ventes_numero_unique');
        });
    }
};
