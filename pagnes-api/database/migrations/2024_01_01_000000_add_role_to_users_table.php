<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adapte la table `users` de Laravel aux champs de la Phase 1 (voir src/types.ts::User) :
 * `name` devient `nom`, et on ajoute le rôle et l'état actif/désactivé.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->renameColumn('name', 'nom');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['admin', 'vendeur'])->default('vendeur')->after('email');
            $table->boolean('actif')->default(true)->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'actif']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->renameColumn('nom', 'name');
        });
    }
};
