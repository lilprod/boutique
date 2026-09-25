<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ventes', function (Blueprint $table) {
            $table->id();
            // Numéro séquentiel affiché (V-00001), distinct de l'id technique.
            $table->unsignedInteger('numero')->unique();
            $table->foreignId('vendeur_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();

            $table->unsignedInteger('sous_total'); // somme des lignes après remise de ligne
            $table->enum('remise_type', ['pct', 'fcfa'])->default('pct');
            $table->decimal('remise_valeur', 8, 2)->default(0);
            $table->unsignedInteger('remise_montant')->default(0);
            $table->unsignedInteger('total');
            $table->integer('marge'); // total - coût ; peut être négatif si vendu à perte

            $table->enum('paiement_mode', ['especes', 'flooz', 'tmoney', 'carte']);
            $table->string('paiement_reference')->nullable(); // obligatoire si flooz/tmoney (validé en app)
            $table->unsignedInteger('paiement_recu')->nullable(); // espèces uniquement

            $table->enum('statut', ['validee', 'annulee'])->default('validee');
            $table->timestamp('annulation_date')->nullable();
            $table->foreignId('annulation_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('annulation_motif')->nullable();

            $table->timestamps(); // created_at = date de la vente (immuable)

            $table->index(['statut', 'created_at']);
            $table->index('vendeur_id');
        });
    }

    public function down(): void { Schema::dropIfExists('ventes'); }
};
