<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('lignes_vente', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vente_id')->constrained('ventes')->cascadeOnDelete();
            // Restrict : on ne supprime jamais une variante déjà vendue (voir VarianteController).
            $table->foreignId('variante_id')->constrained('variantes')->restrictOnDelete();
            $table->foreignId('produit_id')->constrained('produits')->restrictOnDelete();

            // Copie du libellé et du coloris au moment de la vente : le ticket ne doit
            // jamais changer si le produit est renommé plus tard.
            $table->string('libelle');
            $table->string('coloris');

            $table->enum('unite', ['pagne', 'yard']);
            $table->decimal('quantite', 8, 2);
            $table->decimal('yards', 10, 2); // quantité convertie en yards (unité de stock)
            $table->unsignedInteger('prix_unitaire');
            $table->unsignedInteger('brut'); // quantite * prix_unitaire, avant remise de ligne
            $table->enum('remise_type', ['pct', 'fcfa'])->default('pct');
            $table->decimal('remise_valeur', 8, 2)->default(0);
            $table->unsignedInteger('total'); // brut - remise de ligne
            $table->unsignedInteger('cout'); // yards * prix_achat_pagne / yards_par_pagne, figé à la vente

            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('lignes_vente'); }
};
