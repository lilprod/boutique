<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Programme de fidélité, propre à chaque boutique (désactivé par défaut) : le client gagne des
 * points sur ce qu'il paie et les échange contre une remise. Le solde est tenu sur le client,
 * chaque variation est tracée dans mouvements_points (comme le stock dans mouvements).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('parametres', function (Blueprint $table) {
            $table->boolean('fidelite_active')->default(false);
            $table->unsignedInteger('fidelite_tranche')->default(1000);   // FCFA payés pour gagner 1 point
            $table->unsignedInteger('fidelite_valeur_point')->default(10); // FCFA de remise par point utilisé
            $table->unsignedInteger('fidelite_seuil')->default(100);       // points minimum pour en utiliser
            $table->unsignedSmallInteger('fidelite_expiration_mois')->default(12); // solde perdu après N mois sans achat ; 0 = jamais
        });

        Schema::table('clients', function (Blueprint $table) {
            // Peut devenir négatif si une vente annulée avait rapporté des points déjà dépensés.
            $table->integer('points')->default(0);
        });

        Schema::table('ventes', function (Blueprint $table) {
            $table->unsignedInteger('points_utilises')->default(0)->after('remise_montant');
            $table->unsignedInteger('remise_points')->default(0)->after('points_utilises'); // FCFA retirés grâce aux points
            $table->unsignedInteger('points_gagnes')->default(0)->after('remise_points');
        });

        Schema::create('mouvements_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('boutique_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vente_id')->nullable()->constrained('ventes')->nullOnDelete();
            $table->enum('type', ['gain', 'utilisation', 'annulation', 'ajustement', 'expiration']);
            $table->integer('points'); // signé : + gain, − utilisation
            $table->string('motif', 190)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['client_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mouvements_points');
        Schema::table('ventes', function (Blueprint $table) {
            $table->dropColumn(['points_utilises', 'remise_points', 'points_gagnes']);
        });
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('points');
        });
        Schema::table('parametres', function (Blueprint $table) {
            $table->dropColumn(['fidelite_active', 'fidelite_tranche', 'fidelite_valeur_point', 'fidelite_seuil', 'fidelite_expiration_mois']);
        });
    }
};
