<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('access_identities', function (Blueprint $table) {
            $table->timestamp('last_mutated_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('access_identities', function (Blueprint $table) {
            $table->dropColumn('last_mutated_at');
        });
    }
};
