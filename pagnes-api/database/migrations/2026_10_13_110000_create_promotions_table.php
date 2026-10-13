<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promotions d'une boutique, appliquées automatiquement à la caisse par le serveur.
 * Une seule promotion par ligne (la plus avantageuse), figée sur la ligne de vente.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('boutique_id')->constrained()->cascadeOnDelete();
            $table->string('nom', 120);
            $table->enum('type_remise', ['pct', 'fcfa']); // fcfa : montant retiré par unité vendue
            $table->decimal('valeur', 10, 2);
            $table->enum('cible', ['tout', 'type', 'motif', 'produit', 'variante'])->default('tout');
            $table->string('cible_texte', 100)->nullable(); // type ou motif visé
            $table->foreignId('produit_id')->nullable()->constrained('produits')->cascadeOnDelete();
            $table->foreignId('variante_id')->nullable()->constrained('variantes')->cascadeOnDelete();
            $table->enum('unite', ['pagne', 'yard', 'metre'])->nullable(); // null : toutes les unités
            $table->decimal('quantite_min', 8, 2)->default(0); // sur le panier entier, lignes ciblées de cette unité
            $table->date('debut')->nullable();
            $table->date('fin')->nullable();
            $table->boolean('actif')->default(true);
            $table->timestamps();
            $table->index(['tenant_id', 'boutique_id', 'actif']);
        });

        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->foreignId('promotion_id')->nullable()->after('remise_valeur')->constrained('promotions')->nullOnDelete();
            $table->string('promotion_libelle', 120)->nullable()->after('promotion_id'); // gelé : le ticket ne change pas si la promo est modifiée
            $table->unsignedInteger('remise_promo')->default(0)->after('promotion_libelle');
        });
    }

    public function down(): void
    {
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->dropConstrainedForeignId('promotion_id');
            $table->dropColumn(['promotion_libelle', 'remise_promo']);
        });
        Schema::dropIfExists('promotions');
    }
};
