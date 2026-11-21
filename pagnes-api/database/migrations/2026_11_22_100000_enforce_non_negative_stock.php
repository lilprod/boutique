<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Le stock n'est jamais négatif : sinon les inventaires sont faux.
 *
 * - `lignes_vente.manque_stock` : quantité vendue (hors ligne) qui n'était plus en stock à la réception.
 *   Elle n'est pas sortie du stock, et une annulation ne la remet pas.
 * - Un stock négatif existant (caisse hors ligne de la version précédente) est ramené à 0, avec un
 *   mouvement d'ajustement au nom d'un administrateur de la boutique, pour que l'historique reste juste.
 * - Contrainte en base `stock >= 0` et `seuil >= 0` (MySQL 8.0.16+, MariaDB 10.2+).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->decimal('manque_stock', 10, 2)->default(0)->after('quantite_stock');
        });

        foreach (DB::table('variantes')->where('stock', '<', 0)->get(['id', 'tenant_id', 'boutique_id', 'stock']) as $v) {
            $auteur = DB::table('users')->where('tenant_id', $v->tenant_id)->where('boutique_id', $v->boutique_id)
                ->orderByRaw("CASE WHEN role IN ('admin', 'tenant_admin', 'boutique_admin') THEN 0 ELSE 1 END")->orderBy('id')->value('id');
            DB::table('variantes')->where('id', $v->id)->update(['stock' => 0]);
            if ($auteur) {
                DB::table('mouvements')->insert([
                    'tenant_id' => $v->tenant_id, 'boutique_id' => $v->boutique_id, 'variante_id' => $v->id,
                    'type' => 'ajustement', 'quantite' => -$v->stock, 'user_id' => $auteur,
                    'motif' => 'Stock négatif ramené à 0 (à vérifier à l’inventaire)', 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        DB::table('variantes')->where('seuil', '<', 0)->update(['seuil' => 0]);

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE variantes ADD CONSTRAINT variantes_stock_positif CHECK (stock >= 0)');
            DB::statement('ALTER TABLE variantes ADD CONSTRAINT variantes_seuil_positif CHECK (seuil >= 0)');
        }
    }

    public function down(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE variantes DROP CONSTRAINT variantes_stock_positif');
            DB::statement('ALTER TABLE variantes DROP CONSTRAINT variantes_seuil_positif');
        }
        Schema::table('lignes_vente', function (Blueprint $table) {
            $table->dropColumn('manque_stock');
        });
    }
};
