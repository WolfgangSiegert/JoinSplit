<?php

use App\Models\Expense;
use App\Models\ExpenseShare;
use App\Models\Group;
use App\Models\Participant;
use App\Actions\ManageExpense;
use App\Actions\VerifyAccessIdentity;
use App\Exceptions\PersistenceException;
use App\Support\EqualSplitCalculator;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

const JS17_ACCESS = '10000000-0000-4000-8000-000000000001';
const JS17_OTHER_ACCESS = '10000000-0000-4000-8000-000000000002';
const JS17_GROUP = '20000000-0000-4000-8000-000000000001';
const JS17_OTHER_GROUP = '20000000-0000-4000-8000-000000000002';
const JS17_A = '30000000-0000-4000-8000-000000000001';
const JS17_B = '30000000-0000-4000-8000-000000000002';
const JS17_C = '30000000-0000-4000-8000-000000000003';
const JS17_FOREIGN_PARTICIPANT = '30000000-0000-4000-8000-000000000004';
const JS17_EXPENSE = '40000000-0000-4000-8000-000000000001';
const JS17_OTHER_EXPENSE = '40000000-0000-4000-8000-000000000002';
const JS17_CREDENTIAL = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const JS17_OTHER_CREDENTIAL = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function js17Headers(string $id = JS17_ACCESS, string $credential = JS17_CREDENTIAL): array
{
    return [
        'X-Access-Identity-ID' => $id,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ];
}

function js17CreateGroup(
    string $groupId = JS17_GROUP,
    string $accessId = JS17_ACCESS,
    string $credential = JS17_CREDENTIAL,
): void {
    test()->withHeaders(js17Headers($accessId, $credential))->postJson('/api/groups', [
        'groupId' => $groupId,
        'name' => 'Reise',
        'currency' => 'EUR',
        'actorId' => $accessId,
        'initialParticipant' => ['participantId' => JS17_A, 'name' => 'Alice'],
    ])->assertCreated();

    foreach ([[JS17_B, 'Bob', 1], [JS17_C, 'Charlie', 2]] as [$id, $name, $order]) {
        test()->withHeaders(js17Headers($accessId, $credential))
            ->postJson("/api/groups/{$groupId}/participants", [
                'participantId' => $id,
                'name' => $name,
                'order' => $order,
            ])->assertCreated();
    }
}

function js17ExpensePayload(array $overrides = []): array
{
    return array_replace([
        'expenseId' => JS17_EXPENSE,
        'description' => 'Dinner',
        'amountMinor' => 1001,
        'incurredOn' => '2026-09-24',
        'payerParticipantId' => JS17_A,
        'participantIds' => [JS17_C, JS17_A, JS17_B],
    ], $overrides);
}

function js17UpdatePayload(array $overrides = []): array
{
    $payload = js17ExpensePayload($overrides);
    unset($payload['expenseId']);

    return $payload;
}

it('calculates every shared equal-split fixture vector in stable order', function () {
    $fixture = json_decode(
        file_get_contents(base_path('../docs/architecture/fixtures/equal-split-vectors.json')),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $order = array_flip($fixture['participantOrder']);
    $calculator = app(EqualSplitCalculator::class);

    foreach ($fixture['vectors'] as $vector) {
        $selected = array_values(array_unique($vector['selectedParticipantIds']));
        usort($selected, fn (string $left, string $right): int => $order[$left] <=> $order[$right]);

        expect($calculator->calculate($vector['amountMinor'], $selected))
            ->toBe($vector['expectedShares'], $vector['name']);
    }
});

it('creates an expense with normalized description, server-owned fields, stable shares, and irreversible history', function () {
    js17CreateGroup();

    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload([
        'description' => "\u{FEFF}\u{00A0} Dinner 😀 \u{3000}",
    ]))->assertCreated()->assertExactJson([
        'data' => [
            'id' => JS17_EXPENSE,
            'groupId' => JS17_GROUP,
            'description' => 'Dinner 😀',
            'amountMinor' => 1001,
            'incurredOn' => '2026-09-24',
            'payerParticipantId' => JS17_A,
            'creatorAccessIdentityId' => JS17_ACCESS,
            'splitMethod' => 'equal',
            'shares' => [
                ['participantId' => JS17_A, 'amountMinor' => 334],
                ['participantId' => JS17_B, 'amountMinor' => 334],
                ['participantId' => JS17_C, 'amountMinor' => 333],
            ],
        ],
    ]);

    expect(Group::findOrFail(JS17_GROUP)->has_financial_history)->toBeTrue()
        ->and(Expense::count())->toBe(1)
        ->and(ExpenseShare::count())->toBe(3);

    test()->withHeaders(js17Headers())->deleteJson('/api/groups/'.JS17_GROUP.'/expenses/'.JS17_EXPENSE)
        ->assertNoContent();

    expect(Group::findOrFail(JS17_GROUP)->has_financial_history)->toBeTrue();
});

it('returns 200 for an identical create retry and 409 for incompatible UUID reuse', function () {
    js17CreateGroup();
    $url = '/api/groups/'.JS17_GROUP.'/expenses';

    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload())->assertCreated();
    Participant::whereKey(JS17_A)->update(['is_active' => false]);
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload())->assertOk();
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['amountMinor' => 1002]))
        ->assertConflict();

    expect(Expense::count())->toBe(1)->and(ExpenseShare::count())->toBe(3);
});

it('updates the full desired state atomically and permits removal or role-specific preservation of inactive references', function () {
    js17CreateGroup();
    $createUrl = '/api/groups/'.JS17_GROUP.'/expenses';
    $updateUrl = $createUrl.'/'.JS17_EXPENSE;
    test()->withHeaders(js17Headers())->postJson($createUrl, js17ExpensePayload())->assertCreated();
    Participant::whereKey(JS17_A)->update(['is_active' => false]);

    test()->withHeaders(js17Headers())->putJson($updateUrl, js17UpdatePayload([
        'description' => 'Changed',
        'amountMinor' => 1,
        'participantIds' => [JS17_C, JS17_A],
    ]))->assertOk()
        ->assertJsonPath('data.payerParticipantId', JS17_A)
        ->assertJsonPath('data.shares.0.participantId', JS17_A)
        ->assertJsonPath('data.shares.0.amountMinor', 1)
        ->assertJsonPath('data.shares.1.amountMinor', 0);

    test()->withHeaders(js17Headers())->putJson($updateUrl, js17UpdatePayload([
        'payerParticipantId' => JS17_B,
        'participantIds' => [JS17_B, JS17_C],
    ]))->assertOk();

    test()->withHeaders(js17Headers())->putJson($updateUrl, js17UpdatePayload([
        'payerParticipantId' => JS17_A,
        'participantIds' => [JS17_B, JS17_C],
    ]))->assertConflict();

    test()->withHeaders(js17Headers())->putJson($updateUrl, js17UpdatePayload([
        'payerParticipantId' => JS17_B,
        'participantIds' => [JS17_A, JS17_B],
    ]))->assertConflict();
});

it('validates exact payload keys, JSON integer money, Unicode length, dates, IDs, and selected participants', function () {
    js17CreateGroup();
    $url = '/api/groups/'.JS17_GROUP.'/expenses';

    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['amountMinor' => '100']))
        ->assertUnprocessable()->assertJsonValidationErrors('amountMinor');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['amountMinor' => 9007199254740992]))
        ->assertUnprocessable()->assertJsonValidationErrors('amountMinor');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['description' => str_repeat('😀', 201)]))
        ->assertUnprocessable()->assertJsonValidationErrors('description');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['incurredOn' => '24-09-2026']))
        ->assertUnprocessable()->assertJsonValidationErrors('incurredOn');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['participantIds' => []]))
        ->assertUnprocessable()->assertJsonValidationErrors('participantIds');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload([
        'participantIds' => ['first' => JS17_A],
    ]))->assertUnprocessable()->assertJsonValidationErrors('participantIds');
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload([
        'participantIds' => [JS17_A, JS17_A, JS17_B],
    ]))->assertCreated()
        ->assertJsonCount(2, 'data.shares')
        ->assertJsonPath('data.shares.0.participantId', JS17_A)
        ->assertJsonPath('data.shares.0.amountMinor', 501)
        ->assertJsonPath('data.shares.1.participantId', JS17_B)
        ->assertJsonPath('data.shares.1.amountMinor', 500);
    test()->withHeaders(js17Headers())->deleteJson($url.'/'.JS17_EXPENSE)->assertNoContent();
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['groupId' => JS17_GROUP]))
        ->assertUnprocessable()->assertJsonValidationErrors('groupId');
});

it('requires valid access identity credentials for every expense mutation', function () {
    js17CreateGroup();
    $collectionUrl = '/api/groups/'.JS17_GROUP.'/expenses';
    $expenseUrl = $collectionUrl.'/'.JS17_EXPENSE;

    test()->flushHeaders();
    test()->postJson($collectionUrl, js17ExpensePayload())->assertUnauthorized();
    test()->flushHeaders();
    test()->withHeaders(js17Headers(JS17_ACCESS, JS17_OTHER_CREDENTIAL))
        ->postJson($collectionUrl, js17ExpensePayload())->assertUnauthorized();
    test()->flushHeaders();
    test()->withHeaders(['X-Access-Identity-ID' => JS17_ACCESS])
        ->putJson($expenseUrl, js17UpdatePayload())->assertUnauthorized();
    test()->flushHeaders();
    test()->withHeaders(['Authorization' => 'Bearer '.JS17_CREDENTIAL])
        ->deleteJson($expenseUrl)->assertUnauthorized();

    expect(Expense::count())->toBe(0);
});

it('rejects inactive, missing, and cross-group participant selections on create', function () {
    js17CreateGroup();
    test()->withHeaders(js17Headers(JS17_OTHER_ACCESS, JS17_OTHER_CREDENTIAL))->postJson('/api/groups', [
        'groupId' => JS17_OTHER_GROUP,
        'name' => 'Other',
        'currency' => 'EUR',
        'actorId' => JS17_OTHER_ACCESS,
        'initialParticipant' => [
            'participantId' => JS17_FOREIGN_PARTICIPANT,
            'name' => 'Foreign',
        ],
    ])->assertCreated();
    Participant::whereKey(JS17_C)->update(['is_active' => false]);
    $url = '/api/groups/'.JS17_GROUP.'/expenses';

    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['participantIds' => [JS17_A, JS17_C]]))
        ->assertConflict();
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload(['payerParticipantId' => JS17_C]))
        ->assertConflict();
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload([
        'participantIds' => [JS17_A, JS17_FOREIGN_PARTICIPANT],
    ]))->assertConflict();
    test()->withHeaders(js17Headers())->postJson($url, js17ExpensePayload([
        'payerParticipantId' => JS17_FOREIGN_PARTICIPANT,
    ]))->assertConflict();
});

it('allows a payer outside the shares and persists zero-valued shares', function () {
    js17CreateGroup();

    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload([
        'amountMinor' => 1,
        'payerParticipantId' => JS17_C,
        'participantIds' => [JS17_B, JS17_A],
    ]))->assertCreated()
        ->assertJsonPath('data.shares.0.amountMinor', 1)
        ->assertJsonPath('data.shares.1.amountMinor', 0);
});

it('blocks participant deletion for payer or share references until the expense is deleted', function () {
    js17CreateGroup();
    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload([
        'payerParticipantId' => JS17_C,
        'participantIds' => [JS17_A, JS17_B],
    ]))->assertCreated();

    foreach ([JS17_A, JS17_C] as $participantId) {
        test()->withHeaders(js17Headers())
            ->deleteJson('/api/groups/'.JS17_GROUP.'/participants/'.$participantId)
            ->assertConflict();
    }

    test()->withHeaders(js17Headers())->deleteJson('/api/groups/'.JS17_GROUP.'/expenses/'.JS17_EXPENSE)
        ->assertNoContent();
    test()->withHeaders(js17Headers())->deleteJson('/api/groups/'.JS17_GROUP.'/participants/'.JS17_A)
        ->assertNoContent();
});

it('deletes idempotently only within an owned active group and exposes no GET route', function () {
    js17CreateGroup();
    $expenseUrl = '/api/groups/'.JS17_GROUP.'/expenses/'.JS17_EXPENSE;

    test()->withHeaders(js17Headers())->deleteJson($expenseUrl)->assertNoContent();
    test()->withHeaders(js17Headers())->deleteJson($expenseUrl)->assertNoContent();
    test()->withHeaders(js17Headers())->getJson($expenseUrl)->assertMethodNotAllowed();

    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload())
        ->assertCreated();
    test()->withHeaders(js17Headers(JS17_OTHER_ACCESS, JS17_OTHER_CREDENTIAL))->deleteJson($expenseUrl)
        ->assertNotFound();
    Group::whereKey(JS17_GROUP)->update(['is_active' => false]);
    test()->withHeaders(js17Headers())->deleteJson($expenseUrl)->assertConflict();

    expect(Expense::whereKey(JS17_EXPENSE)->exists())->toBeTrue();
});

it('keeps archived groups read-only for create, update, and delete', function () {
    js17CreateGroup();
    $collectionUrl = '/api/groups/'.JS17_GROUP.'/expenses';
    $expenseUrl = $collectionUrl.'/'.JS17_EXPENSE;

    test()->withHeaders(js17Headers())->postJson($collectionUrl, js17ExpensePayload())->assertCreated();
    Group::whereKey(JS17_GROUP)->update(['is_active' => false]);

    test()->withHeaders(js17Headers())->postJson($collectionUrl, js17ExpensePayload([
        'expenseId' => JS17_OTHER_EXPENSE,
    ]))->assertConflict();
    test()->withHeaders(js17Headers())->putJson($expenseUrl, js17UpdatePayload([
        'description' => 'Must not change',
    ]))->assertConflict();
    test()->withHeaders(js17Headers())->deleteJson($expenseUrl)->assertConflict();

    expect(Expense::findOrFail(JS17_EXPENSE)->description)->toBe('Dinner');
});

it('rolls back an expense and its shares when a database write fails', function () {
    js17CreateGroup();
    $collectionUrl = '/api/groups/'.JS17_GROUP.'/expenses';
    test()->withHeaders(js17Headers())->postJson($collectionUrl, js17ExpensePayload())->assertCreated();

    $request = Request::create($collectionUrl.'/'.JS17_EXPENSE, 'PUT', server: [
        'HTTP_X_ACCESS_IDENTITY_ID' => JS17_ACCESS,
        'HTTP_AUTHORIZATION' => 'Bearer '.JS17_CREDENTIAL,
    ]);
    $actor = app(VerifyAccessIdentity::class)->handle($request);

    expect(fn () => app(ManageExpense::class)->update(
        $actor,
        JS17_GROUP,
        JS17_EXPENSE,
        js17UpdatePayload(['description' => 'Rolled back', 'amountMinor' => 0]),
    ))->toThrow(PersistenceException::class);

    $expense = Expense::with('shares')->findOrFail(JS17_EXPENSE);
    expect($expense->description)->toBe('Dinner')
        ->and($expense->amount_minor)->toBe(1001)
        ->and($expense->shares)->toHaveCount(3)
        ->and($expense->shares->sum('amount_minor'))->toBe(1001);
});

it('enforces the persisted Expense amount constraint', function () {
    js17CreateGroup();
    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload())
        ->assertCreated();

    expect(fn () => Expense::whereKey(JS17_EXPENSE)->update(['amount_minor' => 0]))
        ->toThrow(QueryException::class);
});

it('enforces the persisted Expense split-method constraint', function () {
    js17CreateGroup();
    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload())
        ->assertCreated();

    expect(fn () => Expense::whereKey(JS17_EXPENSE)->update(['split_method' => 'unequal']))
        ->toThrow(QueryException::class);
});

it('enforces the composite ExpenseShare identity with SQLSTATE 23505', function () {
    js17CreateGroup();
    test()->withHeaders(js17Headers())->postJson('/api/groups/'.JS17_GROUP.'/expenses', js17ExpensePayload())
        ->assertCreated();

    try {
        DB::table('expense_shares')->insert([
            'expense_id' => JS17_EXPENSE,
            'participant_id' => JS17_A,
            'amount_minor' => 1,
        ]);
        $this->fail('Expected the composite ExpenseShare primary key to reject a duplicate pair.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('23505');
    }
});
