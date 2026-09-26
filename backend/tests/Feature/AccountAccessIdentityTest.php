<?php

use App\Actions\PruneExpiredAccessIdentities;
use App\Models\AccessIdentity;
use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(RefreshDatabase::class);

const JS37_IDENTITY = '77777777-7777-4777-8777-777777777777';
const JS37_CREDENTIAL = '7777777777777777777777777777777777777777777777777777777777777777';

function linkIdentityRequest(TestCase $test, string $identityId = JS37_IDENTITY, string $credential = JS37_CREDENTIAL)
{
    return $test->withHeaders([
        'X-Access-Identity-ID' => $identityId,
        'Authorization' => 'Bearer '.$credential,
    ])->postJson('/api/account/access-identities/link');
}

function js37Account(string $email = 'owner@example.test'): Account
{
    return Account::query()->create([
        'email' => $email,
        'password' => 'correct horse battery staple',
    ]);
}

it('links a verified anonymous identity to the authenticated Account idempotently', function () {
    registerAccessIdentityForTest(JS37_IDENTITY, JS37_CREDENTIAL);
    $account = js37Account();
    $this->actingAs($account, 'web');

    linkIdentityRequest($this)
        ->assertOk()
        ->assertExactJson(['data' => ['id' => JS37_IDENTITY]]);
    linkIdentityRequest($this)
        ->assertOk()
        ->assertExactJson(['data' => ['id' => JS37_IDENTITY]]);

    $identity = AccessIdentity::findOrFail(JS37_IDENTITY);
    expect($identity->account_id)->toBe($account->id)
        ->and($identity->credential_digest)->toBeNull()
        ->and($identity->linked_at)->not->toBeNull();
});

it('rejects missing, invalid, and foreign-account adoption generically', function () {
    registerAccessIdentityForTest(JS37_IDENTITY, JS37_CREDENTIAL);
    $first = js37Account();
    $second = js37Account('second@example.test');

    $this->actingAs($first, 'web');
    linkIdentityRequest($this, JS37_IDENTITY, str_repeat('a', 64))
        ->assertConflict()
        ->assertExactJson(['message' => 'Access identity adoption failed.']);
    linkIdentityRequest($this, '88888888-8888-4888-8888-888888888888', str_repeat('a', 64))
        ->assertConflict()
        ->assertExactJson(['message' => 'Access identity adoption failed.']);
    linkIdentityRequest($this)->assertOk();

    $this->actingAs($second, 'web');
    linkIdentityRequest($this)
        ->assertConflict()
        ->assertExactJson(['message' => 'Access identity adoption failed.']);
});

it('disables the anonymous bearer credential after linking', function () {
    registerAccessIdentityForTest(JS37_IDENTITY, JS37_CREDENTIAL);
    $account = js37Account();
    $this->actingAs($account, 'web');
    linkIdentityRequest($this)->assertOk();

    $this->withHeaders([
        'X-Access-Identity-ID' => JS37_IDENTITY,
        'Authorization' => 'Bearer '.JS37_CREDENTIAL,
    ])->postJson('/api/groups', [
        'id' => '99999999-9999-4999-8999-999999999999',
        'name' => 'Must not be created',
        'currency' => 'EUR',
        'initialParticipant' => null,
    ])->assertUnauthorized()
        ->assertExactJson(['message' => 'Access identity authentication failed.']);
});

it('excludes linked identities from anonymous retention pruning', function () {
    registerAccessIdentityForTest(JS37_IDENTITY, JS37_CREDENTIAL);
    $account = js37Account();
    $this->actingAs($account, 'web');
    linkIdentityRequest($this)->assertOk();

    AccessIdentity::query()->whereKey(JS37_IDENTITY)->update([
        'created_at' => now()->subDays(60),
        'updated_at' => now()->subDays(60),
        'last_mutated_at' => now()->subDays(60),
    ]);

    expect(app(PruneExpiredAccessIdentities::class)->handle())->toBe([
        'identities' => 0,
        'groups' => 0,
    ])->and(AccessIdentity::find(JS37_IDENTITY))->not->toBeNull();
});

it('requires an authenticated Account session to adopt an identity', function () {
    registerAccessIdentityForTest(JS37_IDENTITY, JS37_CREDENTIAL);

    linkIdentityRequest($this)->assertUnauthorized();
});
