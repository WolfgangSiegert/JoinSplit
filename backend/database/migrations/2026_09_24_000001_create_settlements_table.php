<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('participants', function (Blueprint $table) {
            $table->unique(['id', 'group_id'], 'participants_id_group_unique');
        });

        Schema::create('settlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('group_id')->constrained('groups')->cascadeOnDelete();
            $table->uuid('sender_participant_id');
            $table->uuid('receiver_participant_id');
            $table->bigInteger('amount_minor');
            $table->date('occurred_on');
            $table->foreignUuid('creator_access_identity_id')->constrained('access_identities')->restrictOnDelete();
            $table->timestamps();

            $table->foreign(['sender_participant_id', 'group_id'], 'settlements_sender_group_foreign')
                ->references(['id', 'group_id'])
                ->on('participants')
                ->restrictOnDelete();
            $table->foreign(['receiver_participant_id', 'group_id'], 'settlements_receiver_group_foreign')
                ->references(['id', 'group_id'])
                ->on('participants')
                ->restrictOnDelete();
        });

        DB::statement('alter table settlements add constraint settlements_amount_minor_check check (amount_minor > 0)');
        DB::statement('alter table settlements add constraint settlements_distinct_participants_check check (sender_participant_id <> receiver_participant_id)');
    }

    public function down(): void
    {
        Schema::dropIfExists('settlements');

        Schema::table('participants', function (Blueprint $table) {
            $table->dropUnique('participants_id_group_unique');
        });
    }
};
