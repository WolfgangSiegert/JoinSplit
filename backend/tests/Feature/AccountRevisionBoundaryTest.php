<?php

use App\Models\AccessIdentity;
use App\Models\Account;
use App\Models\Group;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS41_ACCOUNT_IDENTITY = '41000000-0000-4000-8000-000000000001';
const JS41_GROUP = '41000000-0000-4000-8000-000000000002';
const JS41_PARTICIPANT = '41000000-0000-4000-8000-000000000003';
const JS41_CREATE_MUTATION = '41000000-0000-4000-8000-000000000004';
const JS41_ADD_MUTATION = '41000000-0000-4000-8000-000000000005';

function js41Account(): Account
{
    $account = Account::query()->create(['email' => 'revision@example.test', 'password' => 'correct horse battery staple']);
    AccessIdentity::query()->create([
        'id' => JS41_ACCOUNT_IDENTITY, 'credential_digest' => null,
        'account_id' => $account->id, 'linked_at' => now(),
    ]);

    return $account;
}

function js41Headers(string $mutationId, int $revision): array
{
    return [
        'X-Access-Identity-ID' => JS41_ACCOUNT_IDENTITY,
        'X-Mutation-ID' => $mutationId,
        'X-Group-Revision' => (string) $revision,
    ];
}

it('advances a Group revision once and replays the stored mutation response', function () {
    $this->actingAs(js41Account(), 'web');
    $payload = [
        'groupId' => JS41_GROUP, 'name' => 'Revision group', 'currency' => 'EUR',
        'actorId' => JS41_ACCOUNT_IDENTITY,
        'initialParticipant' => null,
    ];

    $first = $this->withHeaders(js41Headers(JS41_CREATE_MUTATION, 0))
        ->postJson('/api/account/workspace/groups', $payload)
        ->assertCreated()->assertHeader('X-Group-Revision', '1');
    $replay = $this->withHeaders(js41Headers(JS41_CREATE_MUTATION, 0))
        ->postJson('/api/account/workspace/groups', $payload)
        ->assertCreated()->assertHeader('X-Group-Revision', '1');

    expect($replay->json())->toEqual($first->json())
        ->and(Group::findOrFail(JS41_GROUP)->revision)->toBe(1);
    $this->assertDatabaseCount('groups', 1)->assertDatabaseCount('account_mutations', 1);
});

it('rejects a stale device revision without applying or leaking domain data', function () {
    $this->actingAs(js41Account(), 'web');
    AccessIdentity::findOrFail(JS41_ACCOUNT_IDENTITY)->groups()->create([
        'id' => JS41_GROUP, 'name' => 'Revision group', 'currency' => 'EUR',
        'is_active' => true, 'revision' => 3,
    ]);

    $this->withHeaders(js41Headers(JS41_ADD_MUTATION, 2))
        ->postJson('/api/account/workspace/groups/'.JS41_GROUP.'/participants', [
            'participantId' => JS41_PARTICIPANT, 'name' => 'Ava', 'order' => 0,
        ])->assertConflict()->assertExactJson([
            'message' => 'Group revision conflict.', 'serverRevision' => 3,
        ]);

    $this->assertDatabaseMissing('participants', ['id' => JS41_PARTICIPANT])
        ->assertDatabaseCount('account_mutations', 0);
});

it('authorizes mutations through Account ownership across linked identities', function () {
    $account = js41Account();
    $owner = AccessIdentity::query()->create([
        'id' => '41000000-0000-4000-8000-000000000099', 'credential_digest' => null,
        'account_id' => $account->id, 'linked_at' => now(),
    ]);
    $owner->groups()->create([
        'id' => JS41_GROUP, 'name' => 'Other device group', 'currency' => 'EUR',
        'is_active' => true, 'revision' => 0,
    ]);
    $this->actingAs($account, 'web');

    $this->withHeaders(js41Headers(JS41_ADD_MUTATION, 0))
        ->postJson('/api/account/workspace/groups/'.JS41_GROUP.'/participants', [
            'participantId' => JS41_PARTICIPANT, 'name' => 'Ava', 'order' => 0,
        ])->assertCreated()->assertHeader('X-Group-Revision', '1');

    $this->assertDatabaseHas('participants', ['id' => JS41_PARTICIPANT, 'group_id' => JS41_GROUP]);
});

it('requires authenticated revision and idempotency headers', function () {
    $this->actingAs(js41Account(), 'web');
    $this->postJson('/api/account/workspace/groups', [])->assertUnprocessable();
    $this->withHeaders(js41Headers(JS41_CREATE_MUTATION, 1))
        ->postJson('/api/account/workspace/groups', [])->assertConflict();

    auth('web')->logout();
    $this->withHeaders(js41Headers(JS41_CREATE_MUTATION, 0))
        ->postJson('/api/account/workspace/groups', [])->assertUnauthorized();
});
