<?php

use App\Actions\PruneExpiredAccessIdentities;
use App\Models\AccessIdentity;
use App\Models\Group;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('deletes expired identities and their complete owned graph while retaining active data', function () {
    $now = now();
    $expiredIdentityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    $activeIdentityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    $expiredGroupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    $activeGroupId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    $expiredParticipantId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    $expiredExpenseId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    AccessIdentity::query()->insert([
        [
            'id' => $expiredIdentityId,
            'credential_digest' => str_repeat('a', 64),
            'last_mutated_at' => $now->copy()->subDays(30),
            'created_at' => $now->copy()->subDays(31),
            'updated_at' => $now,
        ],
        [
            'id' => $activeIdentityId,
            'credential_digest' => str_repeat('b', 64),
            'last_mutated_at' => $now->copy()->subDays(29),
            'created_at' => $now->copy()->subDays(31),
            'updated_at' => $now,
        ],
    ]);

    Group::query()->insert([
        [
            'id' => $expiredGroupId,
            'owner_access_identity_id' => $expiredIdentityId,
            'name' => 'Expired',
            'currency' => 'EUR',
            'is_active' => true,
            'has_financial_history' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ],
        [
            'id' => $activeGroupId,
            'owner_access_identity_id' => $activeIdentityId,
            'name' => 'Active',
            'currency' => 'EUR',
            'is_active' => true,
            'has_financial_history' => false,
            'created_at' => $now,
            'updated_at' => $now,
        ],
    ]);

    DB::table('participants')->insert([
        'id' => $expiredParticipantId,
        'group_id' => $expiredGroupId,
        'name' => 'Expired participant',
        'is_active' => true,
        'position' => 0,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    DB::table('expenses')->insert([
        'id' => $expiredExpenseId,
        'group_id' => $expiredGroupId,
        'description' => 'Expired expense',
        'amount_minor' => 100,
        'incurred_on' => $now->toDateString(),
        'payer_participant_id' => $expiredParticipantId,
        'creator_access_identity_id' => $expiredIdentityId,
        'split_method' => 'equal',
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    DB::table('expense_shares')->insert([
        'expense_id' => $expiredExpenseId,
        'participant_id' => $expiredParticipantId,
        'amount_minor' => 100,
        'created_at' => $now,
        'updated_at' => $now,
    ]);

    $result = app(PruneExpiredAccessIdentities::class)->handle($now->copy()->subDays(30));

    expect($result)->toBe(['identities' => 1, 'groups' => 1]);
    $this->assertDatabaseMissing('access_identities', ['id' => $expiredIdentityId]);
    $this->assertDatabaseMissing('groups', ['id' => $expiredGroupId]);
    $this->assertDatabaseMissing('participants', ['id' => $expiredParticipantId]);
    $this->assertDatabaseMissing('expenses', ['id' => $expiredExpenseId]);
    $this->assertDatabaseMissing('expense_shares', ['expense_id' => $expiredExpenseId]);
    $this->assertDatabaseHas('access_identities', ['id' => $activeIdentityId]);
    $this->assertDatabaseHas('groups', ['id' => $activeGroupId]);
});

it('expires identities without accepted mutations from their creation time', function () {
    $now = now();
    $identityId = '11111111-1111-4111-8111-111111111111';

    DB::table('access_identities')->insert([
        'id' => $identityId,
        'credential_digest' => str_repeat('c', 64),
        'last_mutated_at' => null,
        'created_at' => $now->copy()->subDays(31),
        'updated_at' => $now,
    ]);

    $result = app(PruneExpiredAccessIdentities::class)->handle($now->copy()->subDays(30));

    expect($result)->toBe(['identities' => 1, 'groups' => 0]);
    $this->assertDatabaseMissing('access_identities', ['id' => $identityId]);
});
