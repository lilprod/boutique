<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /** La quantité d'un mouvement est exprimée dans l'unité de stock de la boutique (parametres.unite_stock). */
    public function up(): void
    {
        Schema::table('mouvements', function (Blueprint $table) {
            $table->renameColumn('yards', 'quantite');
        });
    }

    public function down(): void
    {
        Schema::table('mouvements', function (Blueprint $table) {
            $table->renameColumn('quantite', 'yards');
        });
    }
};
