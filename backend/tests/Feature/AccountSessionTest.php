<?php

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

function accountPayload(array $overrides = []): array
{
    return array_replace([
        'email' => 'owner@example.test',
        'password' => 'correct horse battery staple',
        'password_confirmation' => 'correct horse battery staple',
        'dataAdoptionConfirmed' => true,
    ], $overrides);
}

it('starts an account session with a non-cacheable CSRF bootstrap response', function () {
    $response = $this->getJson('/api/account/csrf')
        ->assertOk()
        ->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonStructure(['data' => ['csrfToken']]);

    expect($response->json('data.csrfToken'))->toBeString()->not->toBeEmpty();
});

it('registers a normalized Account and never returns its password', function () {
    $response = $this->postJson('/api/account/register', accountPayload([
        'email' => '  Owner@Example.Test ',
    ]))->assertCreated()
        ->assertJsonPath('data.email', 'owner@example.test')
        ->assertJsonMissingPath('data.password');

    $account = Account::findOrFail($response->json('data.id'));
    expect($account->email)->toBe('owner@example.test')
        ->and($account->password)->not->toBe('correct horse battery staple')
        ->and(Hash::check('correct horse battery staple', $account->password))->toBeTrue();

    $this->getJson('/api/account')->assertOk()->assertJsonPath('data.id', $account->id);
});

it('requires explicit adoption confirmation and a 12-character password', function () {
    $this->postJson('/api/account/register', accountPayload([
        'password' => 'too-short',
        'password_confirmation' => 'too-short',
        'dataAdoptionConfirmed' => false,
    ]))->assertUnprocessable()
        ->assertJsonValidationErrors(['password', 'dataAdoptionConfirmed']);

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
        'data' => ['id' => $account->id, 'email' => 'owner@example.test'],
    ]);

    $this->postJson('/api/account/logout')->assertNoContent();
    $this->getJson('/api/account')->assertUnauthorized();
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

it('protects Account reads and mutations from unauthenticated requests', function () {
    $this->getJson('/api/account')->assertUnauthorized();
    $this->postJson('/api/account/logout')->assertUnauthorized();
    $this->deleteJson('/api/account', ['password' => 'irrelevant'])->assertUnauthorized();
});
