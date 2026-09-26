<?php

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS38_ADOPTION = '38000000-0000-4000-8000-000000000001';
const JS38_IMPORT = '38000000-0000-4000-8000-000000000002';
const JS38_GROUP = '38000000-0000-4000-8000-000000000003';
const JS38_IDENTITY = '38000000-0000-4000-8000-000000000004';
const JS38_PAYER = '38000000-0000-4000-8000-000000000005';
const JS38_MEMBER = '38000000-0000-4000-8000-000000000006';
const JS38_EXPENSE = '38000000-0000-4000-8000-000000000007';
const JS38_SETTLEMENT = '38000000-0000-4000-8000-000000000008';

function js38Account(): Account
{
    return Account::query()->create(['email' => 'import@example.test', 'password' => 'correct horse battery staple']);
}

function js38Payload(array $groupOverrides = []): array
{
    return [
        'importId' => JS38_IMPORT,
        'snapshot' => [
            'group' => array_replace([
                'id' => JS38_GROUP, 'name' => 'Hüttentour', 'currency' => 'EUR',
                'ownerAccessIdentityId' => JS38_IDENTITY, 'status' => 'active', 'hasFinancialHistory' => true,
            ], $groupOverrides),
            'participants' => [
                ['id' => JS38_PAYER, 'groupId' => JS38_GROUP, 'name' => 'Ava', 'status' => 'active', 'order' => 0],
                ['id' => JS38_MEMBER, 'groupId' => JS38_GROUP, 'name' => 'Ben', 'status' => 'inactive', 'order' => 1],
            ],
            'expenses' => [[
                'id' => JS38_EXPENSE, 'groupId' => JS38_GROUP, 'description' => 'Unterkunft',
                'amountMinor' => 1201, 'incurredOn' => '2026-09-20', 'payerParticipantId' => JS38_PAYER,
                'creatorAccessIdentityId' => JS38_IDENTITY, 'splitMethod' => 'equal',
                'shares' => [
                    ['participantId' => JS38_PAYER, 'amountMinor' => 601],
                    ['participantId' => JS38_MEMBER, 'amountMinor' => 600],
                ],
            ]],
            'settlements' => [[
                'id' => JS38_SETTLEMENT, 'groupId' => JS38_GROUP,
                'senderParticipantId' => JS38_MEMBER, 'receiverParticipantId' => JS38_PAYER,
                'amountMinor' => '100', 'occurredOn' => '2026-09-21',
                'creatorAccessIdentityId' => JS38_IDENTITY,
            ]],
        ],
    ];
}

function js38ImportUrl(): string
{
    return '/api/account/adoptions/'.JS38_ADOPTION.'/groups/'.JS38_GROUP.'/import';
}

it('imports one complete local Group atomically and returns the initial revision', function () {
    $this->actingAs(js38Account(), 'web');

    $this->postJson(js38ImportUrl(), js38Payload())
        ->assertCreated()
        ->assertExactJson(['data' => ['groupId' => JS38_GROUP, 'revision' => 1]]);

    $this->assertDatabaseHas('access_identities', [
        'id' => JS38_IDENTITY, 'account_id' => auth('web')->id(), 'credential_digest' => null,
    ])->assertDatabaseHas('groups', ['id' => JS38_GROUP, 'revision' => 1])
        ->assertDatabaseHas('participants', ['id' => JS38_MEMBER, 'is_active' => false])
        ->assertDatabaseHas('expenses', ['id' => JS38_EXPENSE, 'amount_minor' => 1201])
        ->assertDatabaseHas('expense_shares', ['expense_id' => JS38_EXPENSE, 'participant_id' => JS38_MEMBER, 'amount_minor' => 600])
        ->assertDatabaseHas('settlements', ['id' => JS38_SETTLEMENT, 'amount_minor' => 100]);
});

it('replays an identical import without duplication and rejects changed reuse', function () {
    $this->actingAs(js38Account(), 'web');
    $this->postJson(js38ImportUrl(), js38Payload())->assertCreated();
    $this->postJson(js38ImportUrl(), js38Payload())->assertCreated();

    $this->assertDatabaseCount('groups', 1)->assertDatabaseCount('account_group_imports', 1);

    $this->postJson(js38ImportUrl(), js38Payload(['name' => 'Changed']))
        ->assertConflict()
        ->assertExactJson(['message' => 'Group adoption failed.']);
    $this->assertDatabaseHas('groups', ['id' => JS38_GROUP, 'name' => 'Hüttentour']);
});

it('returns a consistent authorized workspace snapshot for device hydration', function () {
    $account = js38Account();
    $this->actingAs($account, 'web');
    $this->postJson(js38ImportUrl(), js38Payload())->assertCreated();

    $this->getJson('/api/account/workspace')->assertOk()
        ->assertJsonPath('data.account.id', $account->id)
        ->assertJsonPath('data.groups.0.revision', 1)
        ->assertJsonPath('data.groups.0.group.id', JS38_GROUP)
        ->assertJsonPath('data.groups.0.participants.1.id', JS38_MEMBER)
        ->assertJsonPath('data.groups.0.expenses.0.shares.1.amountMinor', 600)
        ->assertJsonPath('data.groups.0.settlements.0.amountMinor', '100');
});

it('rejects inconsistent aggregate relationships without partial writes', function () {
    $this->actingAs(js38Account(), 'web');
    $payload = js38Payload();
    $payload['snapshot']['expenses'][0]['shares'][1]['participantId'] = '38000000-0000-4000-8000-000000000099';

    $this->postJson(js38ImportUrl(), $payload)->assertUnprocessable();
    $this->assertDatabaseCount('groups', 0)
        ->assertDatabaseCount('access_identities', 0)
        ->assertDatabaseCount('account_group_imports', 0);
});

it('requires an authenticated session for import and workspace reads', function () {
    $this->postJson(js38ImportUrl(), js38Payload())->assertUnauthorized();
    $this->getJson('/api/account/workspace')->assertUnauthorized();
});

it('deletes an adopted Account graph without affecting another Account', function () {
    $account = js38Account();
    $other = Account::query()->create(['email' => 'other@example.test', 'password' => 'correct horse battery staple']);
    $this->actingAs($account, 'web');
    $this->postJson(js38ImportUrl(), js38Payload())->assertCreated();
    $this->withHeaders([
        'X-Access-Identity-ID' => JS38_IDENTITY,
        'X-Mutation-ID' => '38000000-0000-4000-8000-000000000099',
        'X-Group-Revision' => '1',
    ])->postJson('/api/account/workspace/groups/'.JS38_GROUP.'/participants', [
        'participantId' => '38000000-0000-4000-8000-000000000098',
        'name' => 'Cara',
        'order' => 2,
    ])->assertCreated();

    $this->deleteJson('/api/account', ['password' => 'correct horse battery staple'])->assertNoContent();

    expect(Account::find($account->id))->toBeNull()
        ->and(Account::find($other->id))->not->toBeNull();
    $this->assertDatabaseCount('access_identities', 0)
        ->assertDatabaseCount('groups', 0)
        ->assertDatabaseCount('participants', 0)
        ->assertDatabaseCount('expenses', 0)
        ->assertDatabaseCount('expense_shares', 0)
        ->assertDatabaseCount('settlements', 0)
        ->assertDatabaseCount('account_group_imports', 0)
        ->assertDatabaseCount('account_mutations', 0);
});
