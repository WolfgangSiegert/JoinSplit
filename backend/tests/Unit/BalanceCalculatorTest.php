<?php

use App\Support\BalanceCalculator;

it('calculates every shared balance fixture vector exactly', function () {
    $fixture = json_decode(
        file_get_contents(__DIR__.'/../../../docs/architecture/fixtures/balance-vectors.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $calculator = new BalanceCalculator;

    foreach ($fixture['vectors'] as $vector) {
        $actual = $calculator->calculate(
            $fixture['groupId'],
            $vector['participants'],
            $vector['expenses'],
        );
        $asDecimalStrings = array_map(fn (array $balance): array => [
            'participantId' => $balance['participantId'],
            'paidAmountMinor' => (string) $balance['paidAmountMinor'],
            'shareAmountMinor' => (string) $balance['shareAmountMinor'],
            'balanceAmountMinor' => (string) $balance['balanceAmountMinor'],
        ], $actual);

        expect($asDecimalStrings)->toBe($vector['expected'], $vector['name']);
    }
});

it('does not mutate inputs and ignores expense and share input order', function () {
    $participants = [
        ['id' => 'bob', 'groupId' => 'group-1', 'order' => 2],
        ['id' => 'alice', 'groupId' => 'group-1', 'order' => 1],
    ];
    $expenses = [[
        'id' => 'expense-1',
        'groupId' => 'group-1',
        'amountMinor' => 3,
        'payerParticipantId' => 'bob',
        'shares' => [
            ['participantId' => 'bob', 'amountMinor' => 1],
            ['participantId' => 'alice', 'amountMinor' => 2],
        ],
    ]];
    $originalParticipants = $participants;
    $originalExpenses = $expenses;

    $result = (new BalanceCalculator)->calculate('group-1', $participants, $expenses);

    expect($result)->toBe([
        ['participantId' => 'alice', 'paidAmountMinor' => 0, 'shareAmountMinor' => 2, 'balanceAmountMinor' => -2],
        ['participantId' => 'bob', 'paidAmountMinor' => 3, 'shareAmountMinor' => 1, 'balanceAmountMinor' => 2],
    ])->and($participants)->toBe($originalParticipants)
        ->and($expenses)->toBe($originalExpenses);
});

it('fails fast for inconsistent domain input', function (array $participants, array $expenses, string $groupId) {
    (new BalanceCalculator)->calculate($groupId, $participants, $expenses);
})->with([
    'empty Group ID without collections' => [
        [],
        [],
        '',
    ],
    'duplicate participant ID' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1], ['id' => 'alice', 'groupId' => 'group-1', 'order' => 2]],
        [],
        'group-1',
    ],
    'duplicate participant order' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1], ['id' => 'bob', 'groupId' => 'group-1', 'order' => 1]],
        [],
        'group-1',
    ],
    'negative participant order' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => -1]],
        [],
        'group-1',
    ],
    'foreign participant' => [
        [['id' => 'alice', 'groupId' => 'group-2', 'order' => 1]],
        [],
        'group-1',
    ],
    'duplicate expense ID' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1]],
        [
            ['id' => 'expense-1', 'groupId' => 'group-1', 'amountMinor' => 1, 'payerParticipantId' => 'alice', 'shares' => [['participantId' => 'alice', 'amountMinor' => 1]]],
            ['id' => 'expense-1', 'groupId' => 'group-1', 'amountMinor' => 1, 'payerParticipantId' => 'alice', 'shares' => [['participantId' => 'alice', 'amountMinor' => 1]]],
        ],
        'group-1',
    ],
    'unknown payer' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1]],
        [['id' => 'expense-1', 'groupId' => 'group-1', 'amountMinor' => 1, 'payerParticipantId' => 'bob', 'shares' => [['participantId' => 'alice', 'amountMinor' => 1]]]],
        'group-1',
    ],
    'duplicate share participant' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1]],
        [['id' => 'expense-1', 'groupId' => 'group-1', 'amountMinor' => 2, 'payerParticipantId' => 'alice', 'shares' => [['participantId' => 'alice', 'amountMinor' => 1], ['participantId' => 'alice', 'amountMinor' => 1]]]],
        'group-1',
    ],
    'share total mismatch' => [
        [['id' => 'alice', 'groupId' => 'group-1', 'order' => 1]],
        [['id' => 'expense-1', 'groupId' => 'group-1', 'amountMinor' => 2, 'payerParticipantId' => 'alice', 'shares' => [['participantId' => 'alice', 'amountMinor' => 1]]]],
        'group-1',
    ],
])->throws(InvalidArgumentException::class);

it('rejects participant aggregates outside the PHP integer range', function () {
    $participants = [
        ['id' => 'alice', 'groupId' => 'group-1', 'order' => 1],
        ['id' => 'bob', 'groupId' => 'group-1', 'order' => 2],
    ];
    $expenses = [];

    for ($index = 0; $index < 1025; $index++) {
        $expenses[] = [
            'id' => "expense-{$index}",
            'groupId' => 'group-1',
            'amountMinor' => 9007199254740991,
            'payerParticipantId' => 'alice',
            'shares' => [['participantId' => 'bob', 'amountMinor' => 9007199254740991]],
        ];
    }

    (new BalanceCalculator)->calculate('group-1', $participants, $expenses);
})->throws(OverflowException::class);
