<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email', 254)->unique();
            $table->string('password');
            $table->timestamps();
        });

        DB::statement('alter table accounts add constraint accounts_email_normalized_check check (email = lower(email) and email = btrim(email))');
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
