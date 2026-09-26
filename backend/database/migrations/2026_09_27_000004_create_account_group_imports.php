<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            $table->unsignedBigInteger('revision')->default(0);
        });

        Schema::create('account_group_imports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('adoption_id');
            $table->foreignUuid('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->foreignUuid('group_id')->constrained('groups')->cascadeOnDelete();
            $table->char('snapshot_digest', 64);
            $table->timestamps();

            $table->unique(['account_id', 'group_id']);
            $table->unique(['account_id', 'adoption_id', 'id']);
        });

        DB::statement('alter table groups add constraint groups_revision_check check (revision >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('account_group_imports');
        DB::statement('alter table groups drop constraint if exists groups_revision_check');
        Schema::table('groups', fn (Blueprint $table) => $table->dropColumn('revision'));
    }
};
