<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('participants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('group_id')->constrained('groups')->cascadeOnDelete();
            $table->string('name', 100);
            $table->boolean('is_active');
            $table->unsignedInteger('position');
            $table->timestamps();

            $table->unique(['group_id', 'position']);
        });

        DB::statement('alter table participants add constraint participants_position_check check (position >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('participants');
    }
};
