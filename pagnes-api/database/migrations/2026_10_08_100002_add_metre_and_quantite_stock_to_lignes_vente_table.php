<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->enum('unite', ['pagne', 'yard', 'metre'])->change();
            // Quantité réellement décrémentée du stock pour cette ligne, dans l'unité de
            // stock de la boutique au moment de la vente (gelée, comme `cout`/`prix_unitaire`).
            // Distincte de `yards`, qui reste un pivot de coût toujours exprimé en yards.
            $table->decimal('quantite_stock', 10, 2)->after('yards')->default(0);
        });

        // Avant cette migration le stock était toujours en yards : les ventes déjà
        // enregistrées ont donc décrémenté exactement `yards`.
        DB::table('lignes_vente')->update(['quantite_stock' => DB::raw('yards')]);
    }

    public function down(): void
    {
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->dropColumn('quantite_stock');
            $table->enum('unite', ['pagne', 'yard'])->change();
        });
    }
};
