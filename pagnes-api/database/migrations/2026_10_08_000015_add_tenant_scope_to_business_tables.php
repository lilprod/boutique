<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $tables = ['produits', 'variantes', 'clients', 'ventes', 'lignes_vente', 'mouvements', 'parametres'];

        foreach ($tables as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->nullOnDelete();
                $table->foreignId('boutique_id')->nullable()->after('tenant_id')->constrained()->nullOnDelete();
                $table->index(['tenant_id', 'boutique_id']);
            });
        }
    }

    public function down(): void
    {
        $tables = ['produits', 'variantes', 'clients', 'ventes', 'lignes_vente', 'mouvements', 'parametres'];

        foreach ($tables as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('boutique_id');
                $table->dropConstrainedForeignId('tenant_id');
            });
        }
    }
};
