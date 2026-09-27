<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('people', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->string('name', 100);
            $table->boolean('is_active');
            $table->unsignedBigInteger('revision')->default(1);
            $table->timestamps();
        });

        Schema::table('participants', function (Blueprint $table) {
            $table->foreignUuid('person_id')->nullable()->constrained('people')->nullOnDelete();
            $table->unique(['group_id', 'person_id']);
        });

        Schema::create('account_people_imports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('adoption_id');
            $table->foreignUuid('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->char('snapshot_digest', 64);
            $table->timestamps();

            $table->unique(['account_id', 'adoption_id']);
        });

        Schema::create('account_person_mutations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->uuid('person_id');
            $table->unsignedBigInteger('base_revision');
            $table->unsignedBigInteger('resulting_revision');
            $table->char('request_digest', 64);
            $table->unsignedSmallInteger('response_status');
            $table->jsonb('response_body')->nullable();
            $table->timestamps();
        });

        DB::statement('alter table people add constraint people_revision_check check (revision >= 1)');
    }

    public function down(): void
    {
        Schema::dropIfExists('account_person_mutations');
        Schema::dropIfExists('account_people_imports');
        Schema::table('participants', function (Blueprint $table) {
            $table->dropUnique(['group_id', 'person_id']);
            $table->dropConstrainedForeignId('person_id');
        });
        Schema::dropIfExists('people');
    }
};
