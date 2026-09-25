<?php

use App\Models\AccessIdentity;
use App\Models\Group;
use App\Models\Participant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

const ACCESS_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCESS_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_GROUP_ID = '44444444-4444-4444-8444-444444444444';
const PARTICIPANT_ID = '55555555-5555-4555-8555-555555555555';
const CREDENTIAL = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const OTHER_CREDENTIAL = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function createGroupPayload(array $overrides = []): array
{
    return array_replace_recursive([
        'groupId' => GROUP_ID,
        'name' => 'Wochenendtrip',
        'currency' => 'EUR',
        'actorId' => ACCESS_ID,
        'initialParticipant' => [
            'participantId' => PARTICIPANT_ID,
            'name' => 'Wolfgang',
        ],
    ], $overrides);
}

function postCreateGroup(
    array $payload,
    string $identityId = ACCESS_ID,
    string $credential = CREDENTIAL,
    bool $register = true,
) {
    if ($register && ! AccessIdentity::query()->whereKey(strtolower($identityId))->exists()) {
        registerAccessIdentityForTest($identityId, $credential);
    }

    return test()->withHeaders([
        'X-Access-Identity-ID' => $identityId,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ])->postJson('/api/groups', $payload);
}

it('requires explicit registration and verifies an identical registration retry without rotating its digest', function () {
    postCreateGroup(createGroupPayload(), register: false)
        ->assertGone()
        ->assertExactJson(['message' => 'Access identity is no longer available.']);
    registerAccessIdentityForTest(ACCESS_ID, CREDENTIAL);

    $identity = AccessIdentity::findOrFail(ACCESS_ID);
    $originalDigest = $identity->credential_digest;

    expect($originalDigest)->toBe(hash('sha256', hex2bin(CREDENTIAL)))
        ->not->toBe(CREDENTIAL);

    registerAccessIdentityForTest(ACCESS_ID, CREDENTIAL);
    postCreateGroup(createGroupPayload())->assertCreated();

    expect($identity->fresh()->credential_digest)->toBe($originalDigest)
        ->and(AccessIdentity::count())->toBe(1);
});

it('rejects a different credential for a known identity without replacing the digest', function () {
    registerAccessIdentityForTest(ACCESS_ID, CREDENTIAL);
    $digest = AccessIdentity::findOrFail(ACCESS_ID)->credential_digest;

    test()->withHeaders([
        'X-Access-Identity-ID' => ACCESS_ID,
        'Authorization' => 'Bearer '.OTHER_CREDENTIAL,
        'Accept' => 'application/json',
    ])->postJson('/api/access-identities')->assertUnauthorized()
        ->assertExactJson(['message' => 'Access identity authentication failed.']);

    expect(AccessIdentity::findOrFail(ACCESS_ID)->credential_digest)->toBe($digest)
        ->and(Group::count())->toBe(0);
});

it('requires a valid version 4 identity and a 32-byte lowercase hexadecimal bearer credential', function () {
    postCreateGroup(createGroupPayload(), 'not-a-uuid', CREDENTIAL, false)->assertUnauthorized();
    postCreateGroup(createGroupPayload(), ACCESS_ID, strtoupper(CREDENTIAL), false)->assertUnauthorized();
    postCreateGroup(createGroupPayload(), ACCESS_ID, 'abcd', false)->assertUnauthorized();

    expect(AccessIdentity::count())->toBe(0);
});

it('creates a group and initial participant with normalized client identifiers and verified ownership', function () {
    $payload = createGroupPayload([
        'name' => "\u{FEFF}\u{00A0}  Reise \u{3000}",
        'initialParticipant' => [
            'participantId' => PARTICIPANT_ID,
            'name' => "\u{2003} Wölfchen 😀 \u{202F}",
        ],
    ]);

    postCreateGroup($payload)
        ->assertCreated()
        ->assertExactJson([
            'data' => [
                'group' => [
                    'id' => GROUP_ID,
                    'name' => 'Reise',
                    'currency' => 'EUR',
                    'status' => 'active',
                    'ownerAccessIdentityId' => ACCESS_ID,
                ],
                'initialParticipant' => [
                    'id' => PARTICIPANT_ID,
                    'groupId' => GROUP_ID,
                    'name' => 'Wölfchen 😀',
                    'status' => 'active',
                    'order' => 0,
                ],
            ],
        ]);

    $group = Group::with('participants')->findOrFail(GROUP_ID);
    $participant = $group->participants->sole();

    expect($group->id)->toBe(GROUP_ID)
        ->and($group->owner_access_identity_id)->toBe(ACCESS_ID)
        ->and($group->name)->toBe('Reise')
        ->and($group->currency)->toBe('EUR')
        ->and($group->is_active)->toBeTrue()
        ->and($participant->id)->toBe(PARTICIPANT_ID)
        ->and($participant->group_id)->toBe(GROUP_ID)
        ->and($participant->name)->toBe('Wölfchen 😀')
        ->and($participant->is_active)->toBeTrue()
        ->and($participant->position)->toBe(0);
});

it('creates no participant when the optional contract is null', function () {
    postCreateGroup(createGroupPayload(['initialParticipant' => null]))
        ->assertCreated()
        ->assertJsonPath('data.initialParticipant', null);

    expect(Group::count())->toBe(1)
        ->and(Participant::count())->toBe(0);
});

it('rejects request-controlled ownership and actor mismatch', function () {
    postCreateGroup(createGroupPayload(['owner_id' => OTHER_ACCESS_ID]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('owner_id');

    postCreateGroup(createGroupPayload(['actorId' => OTHER_ACCESS_ID]))
        ->assertConflict()
        ->assertExactJson(['message' => 'The create group request conflicts with existing data.']);

    expect(Group::count())->toBe(0);
});

it('treats differently cased actor UUIDs as the same verified identity', function () {
    $actorId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    $payload = createGroupPayload([
        'actorId' => $actorId,
        'initialParticipant' => null,
    ]);

    postCreateGroup($payload, strtoupper($actorId))
        ->assertCreated()
        ->assertJsonPath('data.group.ownerAccessIdentityId', $actorId);

    postCreateGroup($payload, $actorId)->assertOk();

    expect(AccessIdentity::count())->toBe(1)
        ->and(Group::count())->toBe(1)
        ->and(Group::findOrFail(GROUP_ID)->owner_access_identity_id)->toBe($actorId);
});

it('validates names after canonical trimming using Unicode code-point length', function () {
    postCreateGroup(createGroupPayload(['name' => "\u{00A0}\u{3000}"]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');

    postCreateGroup(createGroupPayload([
        'groupId' => OTHER_GROUP_ID,
        'name' => str_repeat('😀', 100),
        'initialParticipant' => null,
    ]))->assertCreated();

    postCreateGroup(createGroupPayload([
        'groupId' => '66666666-6666-4666-8666-666666666666',
        'name' => str_repeat('😀', 101),
    ]))->assertUnprocessable()->assertJsonValidationErrors('name');

    postCreateGroup(createGroupPayload([
        'groupId' => '77777777-7777-4777-8777-777777777777',
        'initialParticipant' => [
            'participantId' => '88888888-8888-4888-8888-888888888888',
            'name' => str_repeat('😀', 101),
        ],
    ]))->assertUnprocessable()->assertJsonValidationErrors('initialParticipant.name');
});

it('rejects invalid identifiers, identical group and participant IDs, and unsupported currency', function () {
    postCreateGroup(createGroupPayload(['groupId' => 'not-a-uuid']))
        ->assertUnprocessable()->assertJsonValidationErrors('groupId');

    postCreateGroup(createGroupPayload([
        'initialParticipant' => [
            'participantId' => GROUP_ID,
            'name' => 'Wolfgang',
        ],
    ]))->assertUnprocessable()->assertJsonValidationErrors('initialParticipant.participantId');

    postCreateGroup(createGroupPayload(['currency' => 'USD']))
        ->assertUnprocessable()->assertJsonValidationErrors('currency');

    expect(Group::count())->toBe(0)
        ->and(Participant::count())->toBe(0);
});

it('returns an identical normalized retry without duplicating or mutating data', function () {
    postCreateGroup(createGroupPayload([
        'name' => "\u{2002}Wochenendtrip\u{2002}",
        'initialParticipant' => [
            'participantId' => PARTICIPANT_ID,
            'name' => "\tWolfgang\n",
        ],
    ]))->assertCreated();

    $createdAt = Group::findOrFail(GROUP_ID)->created_at;

    postCreateGroup(createGroupPayload())->assertOk()
        ->assertJsonPath('data.group.id', GROUP_ID)
        ->assertJsonPath('data.initialParticipant.id', PARTICIPANT_ID);

    expect(Group::count())->toBe(1)
        ->and(Participant::count())->toBe(1)
        ->and(Group::findOrFail(GROUP_ID)->created_at->equalTo($createdAt))->toBeTrue();
});

it('rejects conflicting retries for group or participant creation data', function () {
    postCreateGroup(createGroupPayload())->assertCreated();

    postCreateGroup(createGroupPayload(['name' => 'Andere Reise']))
        ->assertConflict();
    postCreateGroup(createGroupPayload(['initialParticipant' => null]))
        ->assertConflict();
    postCreateGroup(createGroupPayload([
        'initialParticipant' => [
            'participantId' => '99999999-9999-4999-8999-999999999999',
            'name' => 'Wolfgang',
        ],
    ]))->assertConflict();
    postCreateGroup(createGroupPayload([
        'initialParticipant' => [
            'participantId' => PARTICIPANT_ID,
            'name' => 'Andere Person',
        ],
    ]))->assertConflict();

    expect(Group::count())->toBe(1)
        ->and(Participant::count())->toBe(1)
        ->and(Group::findOrFail(GROUP_ID)->name)->toBe('Wochenendtrip')
        ->and(Participant::findOrFail(PARTICIPANT_ID)->name)->toBe('Wolfgang');
});

it('rejects a group identifier owned by another identity without exposing its data', function () {
    postCreateGroup(createGroupPayload())->assertCreated();

    $response = postCreateGroup(
        createGroupPayload(['actorId' => OTHER_ACCESS_ID, 'name' => 'Angreifer']),
        OTHER_ACCESS_ID,
        OTHER_CREDENTIAL,
    )->assertConflict()
        ->assertExactJson(['message' => 'The create group request conflicts with existing data.']);

    expect($response->getContent())->not->toContain('Wochenendtrip')
        ->and(Group::count())->toBe(1)
        ->and(AccessIdentity::count())->toBe(2);
});

it('rolls back the group when the requested participant identifier conflicts', function () {
    postCreateGroup(createGroupPayload())->assertCreated();

    postCreateGroup(
        createGroupPayload([
            'groupId' => OTHER_GROUP_ID,
            'actorId' => OTHER_ACCESS_ID,
            'initialParticipant' => [
                'participantId' => PARTICIPANT_ID,
                'name' => 'Kollision',
            ],
        ]),
        OTHER_ACCESS_ID,
        OTHER_CREDENTIAL,
    )->assertConflict();

    expect(Group::whereKey(OTHER_GROUP_ID)->exists())->toBeFalse()
        ->and(Group::count())->toBe(1)
        ->and(Participant::count())->toBe(1)
        ->and(AccessIdentity::whereKey(OTHER_ACCESS_ID)->exists())->toBeTrue();
});

it('does not leave domain data after failed group creation', function () {
    postCreateGroup(createGroupPayload(['currency' => 'USD']))->assertUnprocessable();

    expect(Group::count())->toBe(0)
        ->and(Participant::count())->toBe(0)
        ->and(AccessIdentity::count())->toBe(1);
});

it('never serializes the credential or its digest', function () {
    $response = postCreateGroup(createGroupPayload())->assertCreated();
    $content = $response->getContent();

    expect($content)->not->toContain(CREDENTIAL)
        ->not->toContain(hash('sha256', hex2bin(CREDENTIAL)));
});

it('enforces the persistence constraint for currency', function () {
    postCreateGroup(createGroupPayload())->assertCreated();

    expect(fn () => DB::table('groups')->where('id', GROUP_ID)->update(['currency' => 'USD']))
        ->toThrow(QueryException::class);
});

it('enforces the persistence constraint for participant order', function () {
    postCreateGroup(createGroupPayload())->assertCreated();

    expect(fn () => DB::table('participants')->where('id', PARTICIPANT_ID)->update(['position' => -1]))
        ->toThrow(QueryException::class);
});
