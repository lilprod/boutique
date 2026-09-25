<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Table à une seule ligne (id = 1), lue/écrite par ParametreController.
 * Équivalent de `DB.parametres` dans src/types.ts côté frontend.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('parametres', function (Blueprint $table) {
            $table->id();
            $table->string('boutique');
            $table->string('adresse')->nullable();
            $table->string('telephone')->nullable();
            $table->enum('ticket_format', ['80mm', 'A4'])->default('80mm');
            $table->unsignedTinyInteger('remise_max_vendeur')->default(15);
            $table->text('message_ticket')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('parametres'); }
};
