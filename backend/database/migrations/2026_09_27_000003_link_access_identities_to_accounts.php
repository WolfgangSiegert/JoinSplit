<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('alter table access_identities alter column credential_digest drop not null');

        Schema::table('access_identities', function (Blueprint $table) {
            $table->foreignUuid('account_id')
                ->nullable()
                ->after('credential_digest')
                ->constrained('accounts')
                ->restrictOnDelete();
            $table->timestamp('linked_at')->nullable()->after('account_id');
        });

        DB::statement(<<<'SQL'
            alter table access_identities
            add constraint access_identities_authorization_mode_check check (
                (account_id is null and credential_digest is not null and linked_at is null)
                or
                (account_id is not null and credential_digest is null and linked_at is not null)
            )
            SQL);
    }

    public function down(): void
    {
        DB::statement('alter table access_identities drop constraint if exists access_identities_authorization_mode_check');

        Schema::table('access_identities', function (Blueprint $table) {
            $table->dropConstrainedForeignId('account_id');
            $table->dropColumn('linked_at');
        });

        DB::statement('alter table access_identities alter column credential_digest set not null');
    }
};
