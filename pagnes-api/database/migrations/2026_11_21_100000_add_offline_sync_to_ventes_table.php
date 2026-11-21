<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Caisse hors ligne : une vente faite sans réseau est envoyée plus tard par la tablette.
 * - `uuid` : identifiant choisi par la tablette, rend l'envoi rejouable sans doublon ;
 * - `hors_ligne`, `total_encaisse` : la vente a été encaissée sans le serveur, pour ce montant ;
 * - `anomalies` : ce que le serveur a constaté à la réception (stock manquant, écart de montant…) ;
 * - `synchronisee_le` : date de réception ; `created_at` garde l'heure réelle de la vente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ventes', function (Blueprint $table) {
            $table->uuid('uuid')->nullable()->unique()->after('numero');
            $table->boolean('hors_ligne')->default(false)->after('statut');
            $table->unsignedInteger('total_encaisse')->nullable()->after('hors_ligne');
            $table->json('anomalies')->nullable()->after('total_encaisse');
            $table->timestamp('synchronisee_le')->nullable()->after('anomalies');
        });
    }

    public function down(): void
    {
        Schema::table('ventes', function (Blueprint $table) {
            $table->dropUnique(['uuid']);
            $table->dropColumn(['uuid', 'hors_ligne', 'total_encaisse', 'anomalies', 'synchronisee_le']);
        });
    }
};
