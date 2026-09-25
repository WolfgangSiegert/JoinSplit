<?php

use App\Models\AccessIdentity;
use App\Models\Group;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS28_ACCESS = '61000000-0000-4000-8000-000000000001';
const JS28_CREDENTIAL = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const JS28_GROUP = '62000000-0000-4000-8000-000000000001';

function js28Headers(string $identityId = JS28_ACCESS, string $credential = JS28_CREDENTIAL): array
{
    return [
        'X-Access-Identity-ID' => $identityId,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ];
}

function js28GroupPayload(array $overrides = []): array
{
    return array_replace([
        'groupId' => JS28_GROUP,
        'name' => 'Demo',
        'currency' => 'EUR',
        'actorId' => JS28_ACCESS,
        'initialParticipant' => null,
    ], $overrides);
}

it('separates idempotent registration from authenticated mutations', function () {
    test()->withHeaders(js28Headers())->postJson('/api/groups', js28GroupPayload())
        ->assertGone()
        ->assertExactJson(['message' => 'Access identity is no longer available.']);

    test()->withHeaders(js28Headers())->postJson('/api/access-identities')
        ->assertCreated()
        ->assertExactJson(['data' => ['id' => JS28_ACCESS]]);
    $digest = AccessIdentity::findOrFail(JS28_ACCESS)->credential_digest;

    test()->withHeaders(js28Headers())->postJson('/api/access-identities')->assertOk();
    test()->withHeaders(js28Headers())->postJson('/api/groups', js28GroupPayload())->assertCreated();

    expect(AccessIdentity::count())->toBe(1)
        ->and(AccessIdentity::findOrFail(JS28_ACCESS)->credential_digest)->toBe($digest)
        ->and(Group::count())->toBe(1);
});

it('updates activity only in the transaction of an accepted mutation or idempotent retry', function () {
    registerAccessIdentityForTest(JS28_ACCESS, JS28_CREDENTIAL);
    $identity = AccessIdentity::findOrFail(JS28_ACCESS);
    expect($identity->last_mutated_at)->toBeNull();

    $this->travelTo(now()->addMinute());
    test()->withHeaders(js28Headers())->postJson('/api/groups', js28GroupPayload())->assertCreated();
    $acceptedAt = AccessIdentity::findOrFail(JS28_ACCESS)->last_mutated_at;
    expect($acceptedAt)->not->toBeNull();

    $this->travelTo(now()->addMinute());
    test()->withHeaders(js28Headers())->postJson('/api/groups', js28GroupPayload())->assertOk();
    $retryAt = AccessIdentity::findOrFail(JS28_ACCESS)->last_mutated_at;
    expect($retryAt->greaterThan($acceptedAt))->toBeTrue();

    $this->travelTo(now()->addMinute());
    test()->withHeaders(js28Headers())->postJson('/api/groups', js28GroupPayload(['name' => 'Conflict']))
        ->assertConflict();
    expect(AccessIdentity::findOrFail(JS28_ACCESS)->last_mutated_at->equalTo($retryAt))->toBeTrue();
});

it('allows only the configured same origin and returns no-store API responses', function () {
    config([
        'app.url' => 'https://joinsplit.tiny-bits.org',
        'cors.allowed_origins' => ['https://joinsplit.tiny-bits.org'],
    ]);

    test()->withHeaders(js28Headers() + ['Origin' => 'https://attacker.example'])
        ->postJson('/api/access-identities')
        ->assertForbidden()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertExactJson(['message' => 'Request origin is not allowed.']);

    test()->withHeaders(js28Headers() + ['Origin' => 'https://joinsplit.tiny-bits.org'])
        ->postJson('/api/access-identities')
        ->assertCreated()
        ->assertHeader('Access-Control-Allow-Origin', 'https://joinsplit.tiny-bits.org')
        ->assertHeader('Cache-Control', 'no-store, private');
});

it('rate limits public registration with a generic response', function () {
    for ($index = 1; $index <= 30; $index++) {
        $identity = sprintf('61000000-0000-4000-8000-%012d', $index);
        test()->withHeaders(js28Headers($identity))->postJson('/api/access-identities')->assertCreated();
    }

    test()->withHeaders(js28Headers('61000000-0000-4000-8000-000000000099'))
        ->postJson('/api/access-identities')
        ->assertTooManyRequests()
        ->assertExactJson(['message' => 'Too many requests.']);
});

it('rate limits Group creation independently from other authenticated mutations', function () {
    registerAccessIdentityForTest(JS28_ACCESS, JS28_CREDENTIAL);

    for ($index = 1; $index <= 10; $index++) {
        test()->withHeaders(js28Headers())->postJson('/api/groups', [])
            ->assertUnprocessable();
    }
    test()->withHeaders(js28Headers())->postJson('/api/groups', [])
        ->assertTooManyRequests()
        ->assertExactJson(['message' => 'Too many requests.']);

    for ($index = 1; $index <= 60; $index++) {
        $groupId = sprintf('62000000-0000-4000-8000-%012d', $index);
        test()->withHeaders(js28Headers())->patchJson('/api/groups/'.$groupId, ['status' => 'archived'])
            ->assertNotFound();
    }
    test()->withHeaders(js28Headers())->patchJson('/api/groups/62000000-0000-4000-8000-000000000099', ['status' => 'archived'])
        ->assertTooManyRequests()
        ->assertExactJson(['message' => 'Too many requests.']);
});
