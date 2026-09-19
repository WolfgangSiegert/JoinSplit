<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('owner_access_identity_id')
                ->constrained('access_identities')
                ->restrictOnDelete();
            $table->string('name', 100);
            $table->char('currency', 3);
            $table->boolean('is_active');
            $table->timestamps();
        });

        DB::statement("alter table groups add constraint groups_currency_check check (currency = 'EUR')");
    }

    public function down(): void
    {
        Schema::dropIfExists('groups');
    }
};
