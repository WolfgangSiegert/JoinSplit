<?php

use App\Support\DeterministicSettlementProposalCalculator;

it('matches every shared deterministic settlement proposal vector', function () {
    $fixture = json_decode(
        file_get_contents(__DIR__.'/../../../docs/architecture/fixtures/settlement-proposal-vectors.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $calculator = new DeterministicSettlementProposalCalculator;

    foreach ($fixture['vectors'] as $vector) {
        expect($calculator->calculate($vector['participants']))
            ->toBe($vector['expected']['deterministic'], $vector['name']);

        $reversed = array_reverse($vector['participants']);
        expect($calculator->calculate($reversed))
            ->toBe($vector['expected']['deterministic'], $vector['name'].' with reversed input');
    }
});

it('does not mutate its input', function () {
    $participants = [
        ['participantId' => 'creditor', 'participantOrder' => 2, 'status' => 'inactive', 'balanceAmountMinor' => '500'],
        ['participantId' => 'debtor', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '-500'],
    ];
    $original = $participants;

    (new DeterministicSettlementProposalCalculator)->calculate($participants);

    expect($participants)->toBe($original);
});

it('uses validation precedence independent of input order', function () {
    $participants = [
        ['participantId' => 'valid', 'participantOrder' => -1, 'status' => 'active', 'balanceAmountMinor' => '0'],
        null,
    ];
    $calculator = new DeterministicSettlementProposalCalculator;

    expect($calculator->calculate($participants))->toBe([
        'status' => 'invalid',
        'error' => 'invalid_participant',
    ])->and($calculator->calculate(array_reverse($participants)))->toBe([
        'status' => 'invalid',
        'error' => 'invalid_participant',
    ]);
});

it('accepts the common maximum participant order and a non-breaking-space ID', function () {
    expect((new DeterministicSettlementProposalCalculator)->calculate([[
        'participantId' => "\u{00A0}",
        'participantOrder' => 9007199254740991,
        'status' => 'active',
        'balanceAmountMinor' => '0',
    ]]))->toBe([
        'status' => 'success',
        'transfers' => [],
    ]);
});

it('returns stable validation errors for malformed participant input', function (array $participants, string $error) {
    expect((new DeterministicSettlementProposalCalculator)->calculate($participants))->toBe([
        'status' => 'invalid',
        'error' => $error,
    ]);
})->with([
    'non-object participant' => [[null], 'invalid_participant'],
    'list-shaped participant' => [[[]], 'invalid_participant'],
    'blank ID' => [[['participantId' => ' ', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '0']], 'invalid_participant_id'],
    'ASCII-whitespace-only ID' => [[['participantId' => "\t\n\v\f\r ", 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '0']], 'invalid_participant_id'],
    'duplicate ID' => [[
        ['participantId' => 'same', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '0'],
        ['participantId' => 'same', 'participantOrder' => 2, 'status' => 'inactive', 'balanceAmountMinor' => '0'],
    ], 'duplicate_participant_id'],
    'negative order' => [[['participantId' => 'a', 'participantOrder' => -1, 'status' => 'active', 'balanceAmountMinor' => '0']], 'invalid_participant_order'],
    'non-integer order' => [[['participantId' => 'a', 'participantOrder' => '1', 'status' => 'active', 'balanceAmountMinor' => '0']], 'invalid_participant_order'],
    'order above common maximum' => [[['participantId' => 'a', 'participantOrder' => 9007199254740992, 'status' => 'active', 'balanceAmountMinor' => '0']], 'invalid_participant_order'],
    'unknown status' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'paused', 'balanceAmountMinor' => '0']], 'invalid_participant_status'],
    'JSON number amount' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => 0]], 'invalid_balance_amount'],
    'leading zero amount' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '00']], 'invalid_balance_amount'],
    'negative zero amount' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '-0']], 'invalid_balance_amount'],
    'positive overflow' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '9223372036854775808']], 'balance_out_of_supported_range'],
    'negative overflow' => [[['participantId' => 'a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '-9223372036854775809']], 'balance_out_of_supported_range'],
]);
