<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('produits', function (Blueprint $table) {
            $table->boolean('vend_metre')->default(false)->after('vend_yard');
            $table->unsignedInteger('prix_metre')->default(0)->after('prix_yard');
        });
    }

    public function down(): void
    {
        Schema::table('produits', function (Blueprint $table) {
            $table->dropColumn(['vend_metre', 'prix_metre']);
        });
    }
};
