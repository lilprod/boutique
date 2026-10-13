<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Politique de vente par boutique (pas par tenant : deux boutiques d'un même
     * tenant peuvent avoir des réglages différents). Les valeurs par défaut des
     * colonnes préservent le comportement actuel des boutiques déjà existantes
     * (pagne + yard autorisés, stock en yards, aucun minimum) ; une boutique
     * neuve reçoit des valeurs différentes via Parametre::actuel() (pagne seul).
     */
    public function up(): void
    {
        Schema::table('parametres', function (Blueprint $table) {
            $table->boolean('autorise_pagne')->default(true);
            $table->boolean('autorise_yard')->default(true);
            $table->boolean('autorise_metre')->default(false);
            $table->decimal('quantite_min_panier', 8, 2)->default(1);
            $table->enum('unite_stock', ['yard', 'pagne', 'metre'])->default('yard');
        });
    }

    public function down(): void
    {
        Schema::table('parametres', function (Blueprint $table) {
            $table->dropColumn(['autorise_pagne', 'autorise_yard', 'autorise_metre', 'quantite_min_panier', 'unite_stock']);
        });
    }
};
