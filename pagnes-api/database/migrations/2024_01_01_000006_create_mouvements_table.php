<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('mouvements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('variante_id')->constrained('variantes')->restrictOnDelete();
            $table->enum('type', ['entree', 'vente', 'annulation', 'ajustement']);
            // Signé : positif pour une entrée/annulation, négatif pour une vente.
            // Un ajustement peut être positif ou négatif selon l'écart constaté.
            $table->decimal('yards', 10, 2);
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('motif');
            $table->string('fournisseur')->nullable();
            $table->unsignedInteger('prix_achat_pagne')->nullable();
            $table->foreignId('vente_id')->nullable()->constrained('ventes')->nullOnDelete();
            $table->timestamps();

            $table->index(['variante_id', 'created_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('mouvements'); }
};
