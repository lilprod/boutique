<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Historique des prix d'un produit : une ligne par changement (vente au pagne, au yard, au mètre,
 * achat au pagne), valable à partir de `valable_du`. Sert à retrouver le prix exact d'une vente faite
 * hors ligne, et à l'administrateur pour suivre ses prix. Les produits existants reçoivent leurs prix
 * actuels, valables depuis leur création.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prix_produits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('boutique_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('produit_id')->constrained('produits')->cascadeOnDelete();
            $table->unsignedInteger('prix_pagne')->default(0);
            $table->unsignedInteger('prix_yard')->default(0);
            $table->unsignedInteger('prix_metre')->default(0);
            $table->unsignedInteger('prix_achat_pagne')->default(0);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('valable_du');
            $table->timestamps();
            $table->index(['produit_id', 'valable_du']);
        });

        foreach (DB::table('produits')->get() as $p) {
            DB::table('prix_produits')->insert([
                'tenant_id' => $p->tenant_id, 'boutique_id' => $p->boutique_id, 'produit_id' => $p->id,
                'prix_pagne' => $p->prix_pagne, 'prix_yard' => $p->prix_yard, 'prix_metre' => $p->prix_metre ?? 0,
                'prix_achat_pagne' => $p->prix_achat_pagne, 'valable_du' => $p->created_at ?? now(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('prix_produits');
    }
};
