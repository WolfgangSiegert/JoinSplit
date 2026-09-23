<?php

use App\Models\Group;
use App\Models\Participant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS16_ACCESS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JS16_OTHER_ACCESS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JS16_GROUP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const JS16_PARTICIPANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const JS16_NEW_PARTICIPANT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const JS16_CREDENTIAL = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const JS16_OTHER_CREDENTIAL = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function js16Headers(string $id = JS16_ACCESS, string $credential = JS16_CREDENTIAL): array
{
    return ['X-Access-Identity-ID' => $id, 'Authorization' => "Bearer {$credential}", 'Accept' => 'application/json'];
}

function js16CreateGroup(): void
{
    test()->withHeaders(js16Headers())->postJson('/api/groups', [
        'groupId' => JS16_GROUP, 'name' => 'Reise', 'currency' => 'EUR', 'actorId' => JS16_ACCESS,
        'initialParticipant' => ['participantId' => JS16_PARTICIPANT, 'name' => 'Alice'],
    ])->assertCreated();
}

it('adds a normalized Participant with stable client identity and supports identical retry', function () {
    js16CreateGroup();
    $payload = ['participantId' => JS16_NEW_PARTICIPANT, 'name' => "\u{2003} Bob \u{3000}", 'order' => 1];
    $response = test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', $payload)
        ->assertCreated()->assertJsonPath('data.id', JS16_NEW_PARTICIPANT)->assertJsonPath('data.name', 'Bob')
        ->assertJsonPath('data.active', true)->assertJsonPath('data.order', 1);
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', $payload)->assertOk();
    expect(Participant::whereKey(JS16_NEW_PARTICIPANT)->count())->toBe(1)
        ->and($response->getContent())->not->toContain(JS16_CREDENTIAL);
});

it('rejects conflicting add data, skipped stable order, and foreign ownership', function () {
    js16CreateGroup();
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => JS16_NEW_PARTICIPANT, 'name' => 'Bob', 'order' => 2,
    ])->assertConflict();
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => JS16_NEW_PARTICIPANT, 'name' => 'Bob', 'order' => 1,
    ])->assertCreated();
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => JS16_NEW_PARTICIPANT, 'name' => 'Robert', 'order' => 1,
    ])->assertConflict();
    test()->withHeaders(js16Headers(JS16_OTHER_ACCESS, JS16_OTHER_CREDENTIAL))->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'name' => 'Eve', 'order' => 2,
    ])->assertNotFound();
});

it('renames without changing identity, group, order or active state and permits identical retry', function () {
    js16CreateGroup();
    $url = '/api/groups/'.JS16_GROUP.'/participants/'.JS16_PARTICIPANT;
    test()->withHeaders(js16Headers())->patchJson($url, ['name' => "\t Alicia \n"])->assertOk()->assertJsonPath('data.name', 'Alicia');
    test()->withHeaders(js16Headers())->patchJson($url, ['name' => 'Alicia'])->assertOk();
    $participant = Participant::findOrFail(JS16_PARTICIPANT);
    expect($participant->group_id)->toBe(JS16_GROUP)->and($participant->position)->toBe(0)->and($participant->is_active)->toBeTrue();
});

it('deactivates idempotently, rejects reactivation, and protects foreign owners', function () {
    js16CreateGroup();
    $url = '/api/groups/'.JS16_GROUP.'/participants/'.JS16_PARTICIPANT;
    test()->withHeaders(js16Headers())->patchJson($url, ['active' => false])->assertOk()->assertJsonPath('data.active', false);
    test()->withHeaders(js16Headers())->patchJson($url, ['active' => false])->assertOk();
    test()->withHeaders(js16Headers())->patchJson($url, ['active' => true])->assertUnprocessable();
    test()->withHeaders(js16Headers(JS16_OTHER_ACCESS, JS16_OTHER_CREDENTIAL))->patchJson($url, ['name' => 'Eve'])->assertNotFound();
});

it('deletes only the selected Participant and returns 204 for an absent retry', function () {
    js16CreateGroup();
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => JS16_NEW_PARTICIPANT, 'name' => 'Bob', 'order' => 1,
    ])->assertCreated();
    $url = '/api/groups/'.JS16_GROUP.'/participants/'.JS16_PARTICIPANT;
    test()->withHeaders(js16Headers(JS16_OTHER_ACCESS, JS16_OTHER_CREDENTIAL))->deleteJson($url)->assertNotFound();
    test()->withHeaders(js16Headers())->deleteJson($url)->assertNoContent();
    test()->withHeaders(js16Headers())->deleteJson($url)->assertNoContent();
    expect(Participant::whereKey(JS16_PARTICIPANT)->exists())->toBeFalse()
        ->and(Participant::whereKey(JS16_NEW_PARTICIPANT)->exists())->toBeTrue();
});

it('keeps archived groups read-only and prohibits ownership fields', function () {
    js16CreateGroup();
    Group::whereKey(JS16_GROUP)->update(['is_active' => false]);
    test()->withHeaders(js16Headers())->postJson('/api/groups/'.JS16_GROUP.'/participants', [
        'participantId' => JS16_NEW_PARTICIPANT, 'name' => 'Bob', 'order' => 1, 'ownerId' => JS16_OTHER_ACCESS,
    ])->assertUnprocessable();
    test()->withHeaders(js16Headers())->patchJson('/api/groups/'.JS16_GROUP.'/participants/'.JS16_PARTICIPANT, ['name' => 'Alicia'])->assertNotFound();
});
