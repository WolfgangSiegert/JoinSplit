<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_shares', function (Blueprint $table) {
            $table->foreignUuid('expense_id')->constrained('expenses')->cascadeOnDelete();
            $table->foreignUuid('participant_id')->constrained('participants')->restrictOnDelete();
            $table->bigInteger('amount_minor');
            $table->timestamps();

            $table->primary(['expense_id', 'participant_id']);
        });

        DB::statement('alter table expense_shares add constraint expense_shares_amount_minor_check check (amount_minor >= 0 and amount_minor <= 9007199254740991)');
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_shares');
    }
};
