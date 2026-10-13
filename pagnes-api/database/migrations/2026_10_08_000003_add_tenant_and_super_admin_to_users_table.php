<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('boutique_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_super_admin')->default(false)->after('actif');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('boutique_id');
            $table->dropConstrainedForeignId('tenant_id');
            $table->dropColumn('is_super_admin');
        });
    }
};
