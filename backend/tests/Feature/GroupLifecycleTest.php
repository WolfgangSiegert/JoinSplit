<?php

use App\Models\Group;
use App\Models\Participant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS25_ACCESS = '51000000-0000-4000-8000-000000000001';
const JS25_OTHER_ACCESS = '51000000-0000-4000-8000-000000000002';
const JS25_GROUP = '52000000-0000-4000-8000-000000000001';
const JS25_PARTICIPANT_A = '53000000-0000-4000-8000-000000000001';
const JS25_PARTICIPANT_B = '53000000-0000-4000-8000-000000000002';
const JS25_EXPENSE = '54000000-0000-4000-8000-000000000001';
const JS25_CREDENTIAL = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const JS25_OTHER_CREDENTIAL = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function js25Headers(
    string $identityId = JS25_ACCESS,
    string $credential = JS25_CREDENTIAL,
): array {
    return [
        'X-Access-Identity-ID' => $identityId,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ];
}

function js25CreateGroup(): void
{
    registerAccessIdentityForTest(JS25_ACCESS, JS25_CREDENTIAL);
    registerAccessIdentityForTest(JS25_OTHER_ACCESS, JS25_OTHER_CREDENTIAL);
    test()->withHeaders(js25Headers())->postJson('/api/groups', [
        'groupId' => JS25_GROUP,
        'name' => 'Reise',
        'currency' => 'EUR',
        'actorId' => JS25_ACCESS,
        'initialParticipant' => [
            'participantId' => JS25_PARTICIPANT_A,
            'name' => 'Alice',
        ],
    ])->assertCreated();
}

function js25AddSecondParticipant(): void
{
    test()->withHeaders(js25Headers())->postJson('/api/groups/'.JS25_GROUP.'/participants', [
        'participantId' => JS25_PARTICIPANT_B,
        'name' => 'Bob',
        'order' => 1,
    ])->assertCreated();
}

function js25CreateExpense(): void
{
    test()->withHeaders(js25Headers())->postJson('/api/groups/'.JS25_GROUP.'/expenses', [
        'expenseId' => JS25_EXPENSE,
        'description' => 'Dinner',
        'amountMinor' => 1000,
        'incurredOn' => '2026-09-24',
        'payerParticipantId' => JS25_PARTICIPANT_A,
        'participantIds' => [JS25_PARTICIPANT_A, JS25_PARTICIPANT_B],
    ])->assertCreated();
}

it('archives and reactivates an owned group idempotently with canonical lifecycle data', function () {
    js25CreateGroup();
    $url = '/api/groups/'.JS25_GROUP;

    foreach (['archived', 'archived', 'active', 'active'] as $status) {
        test()->withHeaders(js25Headers())->patchJson($url, ['status' => $status])
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => JS25_GROUP,
                'status' => $status,
                'hasFinancialHistory' => false,
            ]]);
    }

    expect(Group::findOrFail(JS25_GROUP)->is_active)->toBeTrue();
});

it('hard deletes only an active group without financial history and cascades participants', function () {
    js25CreateGroup();
    js25AddSecondParticipant();

    test()->withHeaders(js25Headers())->deleteJson('/api/groups/'.JS25_GROUP)->assertNoContent();

    expect(Group::whereKey(JS25_GROUP)->exists())->toBeFalse()
        ->and(Participant::where('group_id', JS25_GROUP)->exists())->toBeFalse();

    test()->withHeaders(js25Headers())->deleteJson('/api/groups/'.JS25_GROUP)->assertNotFound();
});

it('preserves irreversible financial history and rejects hard deletion after an expense was removed', function () {
    js25CreateGroup();
    js25AddSecondParticipant();
    js25CreateExpense();

    test()->withHeaders(js25Headers())->deleteJson('/api/groups/'.JS25_GROUP.'/expenses/'.JS25_EXPENSE)
        ->assertNoContent();
    expect(Group::findOrFail(JS25_GROUP)->has_financial_history)->toBeTrue();

    test()->withHeaders(js25Headers())->deleteJson('/api/groups/'.JS25_GROUP)->assertConflict();
    expect(Group::whereKey(JS25_GROUP)->exists())->toBeTrue();
});

it('allows archiving with an open balance and keeps the archived group read-only until reactivated', function () {
    js25CreateGroup();
    js25AddSecondParticipant();
    js25CreateExpense();
    $groupUrl = '/api/groups/'.JS25_GROUP;

    test()->withHeaders(js25Headers())->patchJson($groupUrl, ['status' => 'archived'])
        ->assertOk()
        ->assertJsonPath('data.hasFinancialHistory', true);
    test()->withHeaders(js25Headers())->deleteJson($groupUrl)->assertConflict();
    test()->withHeaders(js25Headers())->postJson($groupUrl.'/participants', [
        'participantId' => '53000000-0000-4000-8000-000000000003',
        'name' => 'Charlie',
        'order' => 2,
    ])->assertConflict();
    test()->withHeaders(js25Headers())->deleteJson($groupUrl.'/expenses/'.JS25_EXPENSE)
        ->assertConflict();

    test()->withHeaders(js25Headers())->patchJson($groupUrl, ['status' => 'active'])->assertOk();
    test()->withHeaders(js25Headers())->deleteJson($groupUrl.'/expenses/'.JS25_EXPENSE)
        ->assertNoContent();
});

it('validates exact lifecycle input and protects credentials and ownership', function () {
    js25CreateGroup();
    $url = '/api/groups/'.JS25_GROUP;

    test()->withHeaders(js25Headers())->patchJson($url, [])->assertUnprocessable()
        ->assertJsonValidationErrors('status');
    test()->withHeaders(js25Headers())->patchJson($url, ['status' => 'inactive'])
        ->assertUnprocessable()->assertJsonValidationErrors('status');
    test()->withHeaders(js25Headers())->patchJson($url, ['status' => 'archived', 'ownerId' => JS25_OTHER_ACCESS])
        ->assertUnprocessable()->assertJsonValidationErrors('ownerId');

    test()->flushHeaders();
    test()->patchJson($url, ['status' => 'archived'])->assertUnauthorized();
    test()->flushHeaders();
    test()->withHeaders(js25Headers(JS25_OTHER_ACCESS, JS25_OTHER_CREDENTIAL))
        ->patchJson($url, ['status' => 'archived'])->assertNotFound();
    test()->withHeaders(js25Headers(JS25_OTHER_ACCESS, JS25_OTHER_CREDENTIAL))
        ->deleteJson($url)->assertNotFound();

    expect(Group::findOrFail(JS25_GROUP)->is_active)->toBeTrue();
});
