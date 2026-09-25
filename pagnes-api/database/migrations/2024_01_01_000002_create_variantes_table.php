<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('variantes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('produit_id')->constrained('produits')->cascadeOnDelete();
            $table->string('coloris');
            $table->string('sku')->unique();
            $table->string('c1', 7); // couleur principale, hex
            $table->string('c2', 7); // couleur d'accent, hex
            // Le stock est TOUJOURS en yards (unité de base), jamais en pagnes.
            $table->decimal('stock', 10, 2)->default(0);
            $table->decimal('seuil', 10, 2)->default(0);
            $table->timestamps();

            $table->index(['produit_id', 'coloris']);
        });
    }

    public function down(): void { Schema::dropIfExists('variantes'); }
};
