<?php

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS62_MUTATION_ACCOUNT = '62100000-0000-4000-8000-000000000001';
const JS62_MUTATION_PERSON = '62100000-0000-4000-8000-000000000002';
const JS62_MUTATION_CREATE = '62100000-0000-4000-8000-000000000003';
const JS62_MUTATION_UPDATE = '62100000-0000-4000-8000-000000000004';

function js62MutationAccount(): Account
{
    return Account::query()->create([
        'id' => JS62_MUTATION_ACCOUNT, 'email' => 'person-mutation@example.test',
        'password' => 'correct horse battery staple',
    ]);
}

function js62Headers(string $mutation, int $revision): array
{
    return ['X-Mutation-ID' => $mutation, 'X-Person-Revision' => (string) $revision];
}

function js62PersonPayload(string $name): array
{
    return ['person' => ['id' => JS62_MUTATION_PERSON, 'name' => $name, 'status' => 'active']];
}

it('creates updates and deletes a Person with revision preconditions', function () {
    $this->actingAs(js62MutationAccount(), 'web');

    $this->withHeaders(js62Headers(JS62_MUTATION_CREATE, 0))
        ->postJson('/api/account/workspace/people', js62PersonPayload('Ada'))
        ->assertCreated()->assertHeader('X-Person-Revision', '1')
        ->assertJsonPath('data.person.revision', 1);

    $this->withHeaders(js62Headers(JS62_MUTATION_UPDATE, 1))
        ->putJson('/api/account/workspace/people/'.JS62_MUTATION_PERSON, js62PersonPayload('Ada Lovelace'))
        ->assertOk()->assertHeader('X-Person-Revision', '2')
        ->assertJsonPath('data.person.name', 'Ada Lovelace');

    $this->withHeaders(js62Headers('62100000-0000-4000-8000-000000000005', 2))
        ->deleteJson('/api/account/workspace/people/'.JS62_MUTATION_PERSON)
        ->assertNoContent()->assertHeader('X-Person-Revision', '3');
    $this->assertDatabaseMissing('people', ['id' => JS62_MUTATION_PERSON])
        ->assertDatabaseCount('account_person_mutations', 3);
});

it('replays exactly once and rejects a stale Person revision', function () {
    $this->actingAs(js62MutationAccount(), 'web');
    $this->withHeaders(js62Headers(JS62_MUTATION_CREATE, 0))
        ->postJson('/api/account/workspace/people', js62PersonPayload('Ada'))->assertCreated();
    $this->withHeaders(js62Headers(JS62_MUTATION_CREATE, 0))
        ->postJson('/api/account/workspace/people', js62PersonPayload('Ada'))->assertCreated();
    $this->assertDatabaseCount('people', 1)->assertDatabaseCount('account_person_mutations', 1);
    $this->withHeaders(js62Headers(JS62_MUTATION_CREATE, 0))
        ->postJson('/api/account/workspace/people', js62PersonPayload('Changed replay'))
        ->assertConflict();

    $this->withHeaders(js62Headers(JS62_MUTATION_UPDATE, 0))
        ->putJson('/api/account/workspace/people/'.JS62_MUTATION_PERSON, js62PersonPayload('Stale'))
        ->assertConflict()->assertJsonPath('serverRevision', 1);
    $this->assertDatabaseHas('people', ['id' => JS62_MUTATION_PERSON, 'name' => 'Ada']);
});

it('requires an authenticated valid mutation contract', function () {
    $this->postJson('/api/account/workspace/people', js62PersonPayload('Ada'))->assertUnauthorized();
    $this->actingAs(js62MutationAccount(), 'web');
    $this->postJson('/api/account/workspace/people', js62PersonPayload('Ada'))->assertUnprocessable();
});

it('allows browsers to send and read the Person revision header', function () {
    config(['cors.allowed_origins' => ['https://client.example.test']]);

    $response = $this->withHeaders([
        'Origin' => 'https://client.example.test',
        'Access-Control-Request-Method' => 'PUT',
        'Access-Control-Request-Headers' => 'content-type,x-csrf-token,x-mutation-id,x-person-revision',
    ])->options('/api/account/workspace/people/'.JS62_MUTATION_PERSON)
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', 'https://client.example.test');

    expect(strtolower((string) $response->headers->get('Access-Control-Allow-Headers')))
        ->toContain('x-person-revision');
    expect(config('cors.exposed_headers'))->toContain('X-Person-Revision');
});
