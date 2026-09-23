<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('group_id')->constrained('groups')->cascadeOnDelete();
            $table->string('description', 200);
            $table->bigInteger('amount_minor');
            $table->date('incurred_on');
            $table->foreignUuid('payer_participant_id')->constrained('participants')->restrictOnDelete();
            $table->foreignUuid('creator_access_identity_id')->constrained('access_identities')->restrictOnDelete();
            $table->string('split_method', 16);
            $table->timestamps();
        });

        DB::statement('alter table expenses add constraint expenses_amount_minor_check check (amount_minor > 0 and amount_minor <= 9007199254740991)');
        DB::statement("alter table expenses add constraint expenses_split_method_check check (split_method = 'equal')");
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
