<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('produits', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->string('type');
            $table->string('motif')->nullable();
            $table->string('origine')->nullable();
            // Le frontend envoie la photo (réduite à 360 px) sous forme de data URL : ~30-100 Ko de texte.
            // À remplacer par un chemin de fichier (Storage) si le catalogue grossit.
            $table->mediumText('image')->nullable();
            $table->decimal('yards_par_pagne', 6, 2);
            $table->boolean('vend_pagne')->default(true);
            $table->boolean('vend_yard')->default(true);
            $table->unsignedInteger('prix_pagne')->default(0); // FCFA, sans décimales
            $table->unsignedInteger('prix_yard')->default(0);
            $table->unsignedInteger('prix_achat_pagne')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('produits'); }
};
