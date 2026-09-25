<?php

use App\Models\Group;
use App\Models\Participant;
use App\Models\Settlement;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

const JS21_ACCESS = '51000000-0000-4000-8000-000000000001';
const JS21_OTHER_ACCESS = '51000000-0000-4000-8000-000000000002';
const JS21_GROUP = '52000000-0000-4000-8000-000000000001';
const JS21_OTHER_GROUP = '52000000-0000-4000-8000-000000000002';
const JS21_A = '53000000-0000-4000-8000-000000000001';
const JS21_B = '53000000-0000-4000-8000-000000000002';
const JS21_OTHER_PARTICIPANT = '53000000-0000-4000-8000-000000000003';
const JS21_EXPENSE = '54000000-0000-4000-8000-000000000001';
const JS21_SETTLEMENT = '55000000-0000-4000-8000-000000000001';
const JS21_OTHER_SETTLEMENT = '55000000-0000-4000-8000-000000000002';
const JS21_CREDENTIAL = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const JS21_OTHER_CREDENTIAL = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function js21Headers(string $id = JS21_ACCESS, string $credential = JS21_CREDENTIAL): array
{
    return [
        'X-Access-Identity-ID' => $id,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ];
}

function js21CreateGroup(bool $withExpense = true): void
{
    registerAccessIdentityForTest(JS21_ACCESS, JS21_CREDENTIAL);
    registerAccessIdentityForTest(JS21_OTHER_ACCESS, JS21_OTHER_CREDENTIAL);
    test()->withHeaders(js21Headers())->postJson('/api/groups', [
        'groupId' => JS21_GROUP,
        'name' => 'Reise',
        'currency' => 'EUR',
        'actorId' => JS21_ACCESS,
        'initialParticipant' => ['participantId' => JS21_A, 'name' => 'Alice'],
    ])->assertCreated();
    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/participants', [
        'participantId' => JS21_B,
        'name' => 'Bob',
        'order' => 1,
    ])->assertCreated();

    if ($withExpense) {
        test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/expenses', [
            'expenseId' => JS21_EXPENSE,
            'description' => 'Dinner',
            'amountMinor' => 1000,
            'incurredOn' => '2026-09-24',
            'payerParticipantId' => JS21_A,
            'participantIds' => [JS21_A, JS21_B],
        ])->assertCreated();
    }
}

function js21Payload(array $overrides = []): array
{
    return array_replace([
        'settlementId' => JS21_SETTLEMENT,
        'senderParticipantId' => JS21_B,
        'receiverParticipantId' => JS21_A,
        'amountMinor' => '400',
        'occurredOn' => '2026-09-24',
    ], $overrides);
}

function js21UpdatePayload(array $overrides = []): array
{
    $payload = js21Payload($overrides);
    unset($payload['settlementId']);

    return $payload;
}

it('creates a Settlement with server-owned fields, decimal-string money, and irreversible history', function () {
    js21CreateGroup();

    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/settlements', js21Payload())
        ->assertCreated()
        ->assertExactJson(['data' => [
            'id' => JS21_SETTLEMENT,
            'groupId' => JS21_GROUP,
            'senderParticipantId' => JS21_B,
            'receiverParticipantId' => JS21_A,
            'amountMinor' => '400',
            'occurredOn' => '2026-09-24',
            'creatorAccessIdentityId' => JS21_ACCESS,
        ]]);

    expect(Group::findOrFail(JS21_GROUP)->has_financial_history)->toBeTrue();
    test()->withHeaders(js21Headers())->deleteJson('/api/groups/'.JS21_GROUP.'/settlements/'.JS21_SETTLEMENT)
        ->assertNoContent();
    expect(Group::findOrFail(JS21_GROUP)->has_financial_history)->toBeTrue();
});

it('returns 200 for an identical create retry and 409 for incompatible UUID reuse', function () {
    js21CreateGroup();
    $url = '/api/groups/'.JS21_GROUP.'/settlements';

    test()->withHeaders(js21Headers())->postJson($url, js21Payload())->assertCreated();
    Participant::whereKey(JS21_B)->update(['is_active' => false]);
    test()->withHeaders(js21Headers())->postJson($url, js21Payload())->assertOk();
    test()->withHeaders(js21Headers())->postJson($url, js21Payload(['amountMinor' => '401']))->assertConflict();

    expect(Settlement::count())->toBe(1);
});

it('allows active wrong-direction payments and overpayments while enforcing inactive reduction rules', function () {
    js21CreateGroup();
    $url = '/api/groups/'.JS21_GROUP.'/settlements';

    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'settlementId' => JS21_OTHER_SETTLEMENT,
        'senderParticipantId' => JS21_A,
        'receiverParticipantId' => JS21_B,
        'amountMinor' => '600',
    ]))->assertCreated();

    Participant::whereKey(JS21_B)->update(['is_active' => false]);
    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'senderParticipantId' => JS21_A,
        'receiverParticipantId' => JS21_B,
        'amountMinor' => '100',
    ]))->assertConflict();
});

it('accepts a reducing inactive payment and excludes the stored Settlement when updating', function () {
    js21CreateGroup();
    Participant::whereKey(JS21_B)->update(['is_active' => false]);
    $url = '/api/groups/'.JS21_GROUP.'/settlements/'.JS21_SETTLEMENT;

    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/settlements', js21Payload())
        ->assertCreated();
    test()->withHeaders(js21Headers())->putJson($url, js21UpdatePayload(['amountMinor' => '500']))
        ->assertOk()->assertJsonPath('data.amountMinor', '500');
    test()->withHeaders(js21Headers())->putJson($url, js21UpdatePayload(['amountMinor' => '501']))
        ->assertConflict();
});

it('deletes idempotently despite inactive participants and blocks later hard deletion while referenced', function () {
    js21CreateGroup();
    $settlementUrl = '/api/groups/'.JS21_GROUP.'/settlements/'.JS21_SETTLEMENT;
    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/settlements', js21Payload())
        ->assertCreated();

    test()->withHeaders(js21Headers())->deleteJson('/api/groups/'.JS21_GROUP.'/participants/'.JS21_B)
        ->assertConflict();
    Participant::whereKey(JS21_B)->update(['is_active' => false]);
    test()->withHeaders(js21Headers())->deleteJson($settlementUrl)->assertNoContent();
    test()->withHeaders(js21Headers())->deleteJson($settlementUrl)->assertNoContent();
});

it('requires exact fields and a canonical positive signed-64 decimal string', function (array $overrides, string $field) {
    js21CreateGroup(false);

    test()->withHeaders(js21Headers())->postJson(
        '/api/groups/'.JS21_GROUP.'/settlements',
        js21Payload($overrides),
    )->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'JSON number' => [['amountMinor' => 1], 'amountMinor'],
    'zero' => [['amountMinor' => '0'], 'amountMinor'],
    'leading zero' => [['amountMinor' => '01'], 'amountMinor'],
    'positive sign' => [['amountMinor' => '+1'], 'amountMinor'],
    'above int64' => [['amountMinor' => '9223372036854775808'], 'amountMinor'],
    'same participant' => [['senderParticipantId' => JS21_A, 'receiverParticipantId' => JS21_A], 'receiverParticipantId'],
    'same participant with mixed UUID case' => [[
        'senderParticipantId' => '53000000-0000-4000-8000-00000000000A',
        'receiverParticipantId' => '53000000-0000-4000-8000-00000000000a',
    ], 'receiverParticipantId'],
    'unexpected field' => [['note' => 'No notes in JS-021'], 'note'],
]);

it('accepts INT64_MAX exactly and rejects a valid amount whose resulting Balance would overflow', function () {
    js21CreateGroup(false);
    $url = '/api/groups/'.JS21_GROUP.'/settlements';

    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'amountMinor' => '9223372036854775807',
    ]))->assertCreated();
    test()->withHeaders(js21Headers())->deleteJson($url.'/'.JS21_SETTLEMENT)->assertNoContent();

    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/expenses', [
        'expenseId' => JS21_EXPENSE,
        'description' => 'One cent',
        'amountMinor' => 1,
        'incurredOn' => '2026-09-24',
        'payerParticipantId' => JS21_A,
        'participantIds' => [JS21_B],
    ])->assertCreated();
    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'senderParticipantId' => JS21_A,
        'receiverParticipantId' => JS21_B,
        'amountMinor' => '9223372036854775807',
    ]))->assertConflict();
});

it('rejects a Settlement that would overflow a sent or received category despite a safe net Balance', function () {
    js21CreateGroup(false);
    $url = '/api/groups/'.JS21_GROUP.'/settlements';

    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'settlementId' => JS21_SETTLEMENT,
        'senderParticipantId' => JS21_B,
        'receiverParticipantId' => JS21_A,
        'amountMinor' => '9223372036854775807',
    ]))->assertCreated();
    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'settlementId' => JS21_OTHER_SETTLEMENT,
        'senderParticipantId' => JS21_A,
        'receiverParticipantId' => JS21_B,
        'amountMinor' => '9223372036854775807',
    ]))->assertCreated();
    test()->withHeaders(js21Headers())->postJson($url, js21Payload([
        'settlementId' => '55000000-0000-4000-8000-000000000003',
        'senderParticipantId' => JS21_A,
        'receiverParticipantId' => JS21_B,
        'amountMinor' => '1',
    ]))->assertConflict();
});

it('returns lifecycle conflicts for archived groups and hides non-owned resources', function () {
    js21CreateGroup();
    $collectionUrl = '/api/groups/'.JS21_GROUP.'/settlements';
    $itemUrl = $collectionUrl.'/'.JS21_SETTLEMENT;
    test()->withHeaders(js21Headers())->postJson($collectionUrl, js21Payload())->assertCreated();

    test()->withHeaders(js21Headers(JS21_OTHER_ACCESS, JS21_OTHER_CREDENTIAL))
        ->putJson($itemUrl, js21UpdatePayload())->assertNotFound();
    Group::whereKey(JS21_GROUP)->update(['is_active' => false]);
    test()->withHeaders(js21Headers())->postJson($collectionUrl, js21Payload([
        'settlementId' => JS21_OTHER_SETTLEMENT,
    ]))->assertConflict();
    test()->withHeaders(js21Headers())->putJson($itemUrl, js21UpdatePayload())->assertConflict();
    test()->withHeaders(js21Headers())->deleteJson($itemUrl)->assertConflict();
});

it('requires credentials and exposes no Settlement GET route', function () {
    js21CreateGroup();
    $url = '/api/groups/'.JS21_GROUP.'/settlements';

    test()->flushHeaders();
    test()->postJson($url, js21Payload())->assertUnauthorized();
    test()->withHeaders(js21Headers())->getJson($url.'/'.JS21_SETTLEMENT)->assertMethodNotAllowed();
});

it('enforces persisted Settlement amount and distinct-participant constraints', function () {
    js21CreateGroup();
    test()->withHeaders(js21Headers())->postJson('/api/groups/'.JS21_GROUP.'/settlements', js21Payload())
        ->assertCreated();

    expect(fn () => Settlement::whereKey(JS21_SETTLEMENT)->update(['amount_minor' => 0]))
        ->toThrow(QueryException::class);
    expect(fn () => Settlement::whereKey(JS21_SETTLEMENT)->update([
        'receiver_participant_id' => JS21_B,
    ]))->toThrow(QueryException::class);
});

it('enforces same-Group sender and receiver references at the database boundary', function () {
    js21CreateGroup(false);
    test()->withHeaders(js21Headers(JS21_OTHER_ACCESS, JS21_OTHER_CREDENTIAL))->postJson('/api/groups', [
        'groupId' => JS21_OTHER_GROUP,
        'name' => 'Other',
        'currency' => 'EUR',
        'actorId' => JS21_OTHER_ACCESS,
        'initialParticipant' => [
            'participantId' => JS21_OTHER_PARTICIPANT,
            'name' => 'Foreign',
        ],
    ])->assertCreated();

    try {
        DB::table('settlements')->insert([
            'id' => JS21_SETTLEMENT,
            'group_id' => JS21_GROUP,
            'sender_participant_id' => JS21_A,
            'receiver_participant_id' => JS21_OTHER_PARTICIPANT,
            'amount_minor' => 1,
            'occurred_on' => '2026-09-24',
            'creator_access_identity_id' => JS21_ACCESS,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->fail('Expected the cross-Group receiver reference to violate its composite foreign key.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('23503')
            ->and($exception->getMessage())->toContain('settlements_receiver_group_foreign');
    }
});
