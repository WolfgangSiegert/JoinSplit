<?php

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

function accountPayload(array $overrides = []): array
{
    return array_replace([
        'name' => 'Ada Example',
        'email' => 'owner@example.test',
        'password' => 'correct horse battery staple',
        'password_confirmation' => 'correct horse battery staple',
        'dataAdoptionConfirmed' => true,
        'groupAreaOrder' => ['people', 'expenses', 'settlement'],
        'defaultGroupArea' => 'expenses',
        'languagePreference' => 'system',
    ], $overrides);
}

it('starts an account session with a non-cacheable CSRF bootstrap response', function () {
    $response = $this->getJson('/api/account/csrf')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonStructure(['data' => ['csrfToken']]);

    expect($response->json('data.csrfToken'))->toBeString()->not->toBeEmpty();
});

it('allows only the approved web and native origins to bootstrap an Account session', function () {
    config(['cors.allowed_origins' => [
        'https://joinsplit.tiny-bits.org',
        'capacitor://localhost',
        'https://localhost',
    ]]);

    foreach (['https://joinsplit.tiny-bits.org', 'capacitor://localhost', 'https://localhost'] as $origin) {
        $this->withHeader('Origin', $origin)->getJson('/api/account/csrf')
            ->assertOk()
            ->assertHeader('Access-Control-Allow-Origin', $origin)
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    $this->withHeader('Origin', 'https://attacker.example')->getJson('/api/account/csrf')
        ->assertForbidden()
        ->assertExactJson(['message' => 'Request origin is not allowed.']);
});

it('registers a normalized Account and never returns its password', function () {
    $response = $this->postJson('/api/account/register', accountPayload([
        'email' => '  Owner@Example.Test ',
    ]))->assertCreated()
        ->assertJsonPath('data.name', 'Ada Example')
        ->assertJsonPath('data.email', 'owner@example.test')
        ->assertJsonMissingPath('data.password');

    $account = Account::findOrFail($response->json('data.id'));
    expect($account->email)->toBe('owner@example.test')
        ->and($account->name)->toBe('Ada Example')
        ->and($account->group_area_order)->toBe(['people', 'expenses', 'settlement'])
        ->and($account->default_group_area)->toBe('expenses')
        ->and($account->language_preference)->toBe('system')
        ->and($account->password)->not->toBe('correct horse battery staple')
        ->and(Hash::check('correct horse battery staple', $account->password))->toBeTrue();

    $this->getJson('/api/account')->assertOk()->assertJsonPath('data.id', $account->id);
});

it('keeps registration compatible with clients that do not send preferences yet', function () {
    $payload = accountPayload(['email' => 'legacy-client@example.test']);
    unset($payload['groupAreaOrder'], $payload['defaultGroupArea'], $payload['languagePreference']);

    $response = $this->postJson('/api/account/register', $payload)
        ->assertCreated()
        ->assertJsonPath('data.groupAreaOrder', ['people', 'expenses', 'settlement'])
        ->assertJsonPath('data.defaultGroupArea', 'expenses')
        ->assertJsonPath('data.languagePreference', 'system');

    $account = Account::findOrFail($response->json('data.id'));
    expect($account->group_area_order)->toBe(['people', 'expenses', 'settlement'])
        ->and($account->default_group_area)->toBe('expenses')
        ->and($account->language_preference)->toBe('system');
});

it('requires explicit adoption confirmation and a 12-character password', function () {
    $this->postJson('/api/account/register', accountPayload([
        'name' => '   ',
        'password' => 'too-short',
        'password_confirmation' => 'too-short',
        'dataAdoptionConfirmed' => false,
    ]))->assertUnprocessable()
        ->assertJsonValidationErrors(['name', 'password', 'dataAdoptionConfirmed']);

    expect(Account::count())->toBe(0);
});

it('returns a generic registration error for an existing normalized email', function () {
    Account::query()->create(accountPayload(['email' => 'owner@example.test']));

    $this->postJson('/api/account/register', accountPayload(['email' => 'OWNER@example.test']))
        ->assertUnprocessable()
        ->assertExactJson(['message' => 'Account registration failed.']);
});

it('uses the same generic login failure for unknown emails and wrong passwords', function () {
    Account::query()->create(accountPayload());

    $unknown = $this->postJson('/api/account/login', [
        'email' => 'unknown@example.test',
        'password' => 'incorrect password',
    ])->assertUnauthorized()->json();

    $wrong = $this->postJson('/api/account/login', [
        'email' => 'owner@example.test',
        'password' => 'incorrect password',
    ])->assertUnauthorized()->json();

    expect($unknown)->toBe(['message' => 'Account authentication failed.'])
        ->and($wrong)->toBe($unknown);
});

it('logs in case-insensitively, exposes the current Account, and logs out', function () {
    $account = Account::query()->create(accountPayload());

    $this->postJson('/api/account/login', [
        'email' => 'OWNER@EXAMPLE.TEST',
        'password' => 'correct horse battery staple',
    ])->assertOk()->assertJsonPath('data.id', $account->id);

    $this->getJson('/api/account')->assertOk()->assertExactJson([
        'data' => [
            'id' => $account->id,
            'name' => 'Ada Example',
            'email' => 'owner@example.test',
            'groupAreaOrder' => ['people', 'expenses', 'settlement'],
            'defaultGroupArea' => 'expenses',
            'languagePreference' => 'system',
        ],
    ]);

    $this->postJson('/api/account/logout')->assertNoContent();
    $this->getJson('/api/account')->assertUnauthorized();
});

it('persists a validated group area order per account', function () {
    $account = Account::query()->create(accountPayload());
    $this->actingAs($account, 'web');

    $this->putJson('/api/account/preferences', [
        'groupAreaOrder' => ['people', 'expenses', 'settlement'],
    ])->assertOk()->assertExactJson([
        'data' => [
            'groupAreaOrder' => ['people', 'expenses', 'settlement'],
            'defaultGroupArea' => 'expenses',
            'languagePreference' => 'system',
        ],
    ]);

    expect($account->fresh()->group_area_order)->toBe(['people', 'expenses', 'settlement']);
    $this->getJson('/api/account')->assertOk()
        ->assertJsonPath('data.groupAreaOrder', ['people', 'expenses', 'settlement']);

    $this->putJson('/api/account/preferences', [
        'groupAreaOrder' => ['people', 'people', 'settlement'],
    ])->assertUnprocessable()->assertJsonValidationErrors(['groupAreaOrder.1']);

    $this->putJson('/api/account/preferences', ['defaultGroupArea' => 'settlement'])
        ->assertOk()
        ->assertJsonPath('data.defaultGroupArea', 'settlement');
    expect($account->fresh()->default_group_area)->toBe('settlement');

    $this->putJson('/api/account/preferences', ['defaultGroupArea' => 'unknown'])
        ->assertUnprocessable()->assertJsonValidationErrors(['defaultGroupArea']);

    $this->putJson('/api/account/preferences', ['languagePreference' => 'en'])
        ->assertOk()
        ->assertJsonPath('data.languagePreference', 'en');
    expect($account->fresh()->language_preference)->toBe('en');

    $this->putJson('/api/account/preferences', ['languagePreference' => 'fr'])
        ->assertUnprocessable()->assertJsonValidationErrors(['languagePreference']);
});

it('requires fresh password confirmation before deleting an Account', function () {
    $account = Account::query()->create(accountPayload());
    $this->actingAs($account, 'web');

    $this->deleteJson('/api/account', ['password' => 'wrong password'])
        ->assertUnprocessable()
        ->assertExactJson(['message' => 'Account confirmation failed.']);
    expect(Account::find($account->id))->not->toBeNull();

    $this->deleteJson('/api/account', ['password' => 'correct horse battery staple'])
        ->assertNoContent();

    expect(Account::find($account->id))->toBeNull();
    $this->getJson('/api/account')->assertUnauthorized();
});

it('changes the password only after confirming the current password', function () {
    $account = Account::query()->create(accountPayload());
    $this->actingAs($account, 'web');

    $this->putJson('/api/account/password', [
        'currentPassword' => 'wrong password',
        'password' => 'new correct horse battery staple',
        'password_confirmation' => 'new correct horse battery staple',
    ])->assertUnprocessable()->assertExactJson(['message' => 'Current password confirmation failed.']);

    $this->putJson('/api/account/password', [
        'currentPassword' => 'correct horse battery staple',
        'password' => 'new correct horse battery staple',
        'password_confirmation' => 'new correct horse battery staple',
    ])->assertNoContent();

    expect(Hash::check('new correct horse battery staple', $account->fresh()->password))->toBeTrue();
    $this->getJson('/api/account')->assertOk();
});

it('protects Account reads and mutations from unauthenticated requests', function () {
    $this->getJson('/api/account')->assertUnauthorized();
    $this->postJson('/api/account/logout')->assertUnauthorized();
    $this->putJson('/api/account/preferences', ['groupAreaOrder' => ['expenses', 'settlement', 'people']])->assertUnauthorized();
    $this->deleteJson('/api/account', ['password' => 'irrelevant'])->assertUnauthorized();
});
