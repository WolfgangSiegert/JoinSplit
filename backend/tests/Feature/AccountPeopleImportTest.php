<?php

use App\Models\AccessIdentity;
use App\Models\Account;
use App\Models\Group;
use App\Models\Participant;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

const JS62_ADOPTION = '62000000-0000-4000-8000-000000000001';
const JS62_IMPORT = '62000000-0000-4000-8000-000000000002';
const JS62_IDENTITY = '62000000-0000-4000-8000-000000000003';
const JS62_GROUP = '62000000-0000-4000-8000-000000000004';
const JS62_PARTICIPANT = '62000000-0000-4000-8000-000000000005';
const JS62_PERSON = '62000000-0000-4000-8000-000000000006';

function js62AccountGraph(): Account
{
    $account = Account::query()->create([
        'email' => 'people@example.test', 'password' => 'correct horse battery staple',
    ]);
    $identity = AccessIdentity::query()->create([
        'id' => JS62_IDENTITY, 'credential_digest' => null, 'account_id' => $account->id, 'linked_at' => now(),
    ]);
    $group = new Group([
        'id' => JS62_GROUP, 'name' => 'Hüttentour', 'currency' => 'EUR', 'is_active' => true, 'revision' => 1,
    ]);
    $group->owner()->associate($identity);
    $group->save();
    $group->participants()->create([
        'id' => JS62_PARTICIPANT, 'name' => 'Ada', 'is_active' => true, 'position' => 0,
    ]);

    return $account;
}

function js62Payload(string $name = 'Ada Lovelace'): array
{
    return [
        'importId' => JS62_IMPORT,
        'people' => [[
            'id' => JS62_PERSON, 'name' => $name, 'status' => 'active',
        ]],
        'associations' => [[
            'participantId' => JS62_PARTICIPANT, 'personId' => JS62_PERSON,
        ]],
    ];
}

function js62Url(): string
{
    return '/api/account/adoptions/'.JS62_ADOPTION.'/people/import';
}

it('imports Account People and authorized Participant associations atomically', function () {
    $account = js62AccountGraph();
    $this->actingAs($account, 'web');

    $this->postJson(js62Url(), js62Payload())
        ->assertCreated()
        ->assertExactJson(['data' => ['imported' => 1]]);

    $this->assertDatabaseHas('people', [
        'id' => JS62_PERSON, 'account_id' => $account->id, 'name' => 'Ada Lovelace',
        'is_active' => true, 'revision' => 1,
    ])->assertDatabaseHas('participants', [
        'id' => JS62_PARTICIPANT, 'person_id' => JS62_PERSON,
    ])->assertDatabaseCount('account_people_imports', 1);
});

it('replays an identical People import and rejects changed identifier reuse', function () {
    $this->actingAs(js62AccountGraph(), 'web');
    $this->postJson(js62Url(), js62Payload())->assertCreated();
    $this->postJson(js62Url(), js62Payload())->assertCreated();

    $this->assertDatabaseCount('people', 1)->assertDatabaseCount('account_people_imports', 1);
    $this->postJson(js62Url(), js62Payload('Changed'))->assertConflict()
        ->assertExactJson(['message' => 'People adoption failed.']);
});

it('includes People and optional associations in device hydration', function () {
    $account = js62AccountGraph();
    $this->actingAs($account, 'web');
    $this->postJson(js62Url(), js62Payload())->assertCreated();

    $this->getJson('/api/account/workspace')->assertOk()
        ->assertJsonPath('data.people.0.id', JS62_PERSON)
        ->assertJsonPath('data.people.0.revision', 1)
        ->assertJsonPath('data.groups.0.participants.0.personId', JS62_PERSON);
});

it('rolls back when an association is outside the Account workspace', function () {
    $account = js62AccountGraph();
    $other = Account::query()->create([
        'email' => 'other-people@example.test', 'password' => 'correct horse battery staple',
    ]);
    $identity = AccessIdentity::query()->create([
        'id' => '62000000-0000-4000-8000-000000000013', 'credential_digest' => null,
        'account_id' => $other->id, 'linked_at' => now(),
    ]);
    $group = new Group([
        'id' => '62000000-0000-4000-8000-000000000014', 'name' => 'Other',
        'currency' => 'EUR', 'is_active' => true, 'revision' => 1,
    ]);
    $group->owner()->associate($identity);
    $group->save();
    $foreign = $group->participants()->create([
        'id' => '62000000-0000-4000-8000-000000000015', 'name' => 'Foreign',
        'is_active' => true, 'position' => 0,
    ]);
    $payload = js62Payload();
    $payload['associations'][0]['participantId'] = $foreign->id;
    $this->actingAs($account, 'web');

    $this->postJson(js62Url(), $payload)->assertConflict();
    $this->assertDatabaseCount('people', 0)->assertDatabaseCount('account_people_imports', 0);
});
