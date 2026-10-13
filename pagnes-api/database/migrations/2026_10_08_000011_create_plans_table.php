<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->string('slug')->unique();
            $table->unsignedInteger('prix')->default(0);
            $table->enum('intervalle', ['month', 'year'])->default('month');
            $table->unsignedInteger('max_boutiques')->default(1);
            $table->unsignedInteger('max_utilisateurs')->default(5);
            $table->json('features')->nullable();
            $table->boolean('actif')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
