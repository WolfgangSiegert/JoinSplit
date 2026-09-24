<?php

use App\Support\MinimumTransferSettlementProposalCalculator;

it('matches every shared minimum-transfer settlement proposal vector', function () {
    $fixture = json_decode(
        file_get_contents(__DIR__.'/../../../docs/architecture/fixtures/settlement-proposal-vectors.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $calculator = new MinimumTransferSettlementProposalCalculator;

    foreach ($fixture['vectors'] as $vector) {
        expect($calculator->calculate($vector['participants']))
            ->toBe($vector['expected']['minimumTransfer'], $vector['name']);

        expect($calculator->calculate(array_reverse($vector['participants'])))
            ->toBe($vector['expected']['minimumTransfer'], $vector['name'].' with reversed input');
    }
});

it('does not mutate its input', function () {
    $participants = [
        ['participantId' => 'creditor', 'participantOrder' => 2, 'status' => 'inactive', 'balanceAmountMinor' => '500'],
        ['participantId' => 'debtor', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '-500'],
    ];
    $original = $participants;

    (new MinimumTransferSettlementProposalCalculator)->calculate($participants);

    expect($participants)->toBe($original);
});

it('chooses the canonical participant-order proposal when optimal partitions tie', function () {
    $participants = [
        ['participantId' => 'creditor-b', 'participantOrder' => 4, 'status' => 'active', 'balanceAmountMinor' => '500'],
        ['participantId' => 'debtor-b', 'participantOrder' => 2, 'status' => 'active', 'balanceAmountMinor' => '-500'],
        ['participantId' => 'creditor-a', 'participantOrder' => 3, 'status' => 'active', 'balanceAmountMinor' => '500'],
        ['participantId' => 'debtor-a', 'participantOrder' => 1, 'status' => 'active', 'balanceAmountMinor' => '-500'],
    ];

    expect((new MinimumTransferSettlementProposalCalculator)->calculate($participants))->toBe([
        'status' => 'success',
        'transfers' => [
            ['senderParticipantId' => 'debtor-a', 'receiverParticipantId' => 'creditor-a', 'amountMinor' => '500'],
            ['senderParticipantId' => 'debtor-b', 'receiverParticipantId' => 'creditor-b', 'amountMinor' => '500'],
        ],
    ]);
});

it('validates all input before returning the participant-limit outcome', function () {
    $participants = [];
    for ($index = 1; $index <= 13; $index++) {
        $participants[] = [
            'participantId' => 'd'.$index,
            'participantOrder' => $index,
            'status' => 'active',
            'balanceAmountMinor' => '-1',
        ];
        $participants[] = [
            'participantId' => 'c'.$index,
            'participantOrder' => 13 + $index,
            'status' => 'active',
            'balanceAmountMinor' => '1',
        ];
    }
    $participants[25]['balanceAmountMinor'] = '9223372036854775808';

    expect((new MinimumTransferSettlementProposalCalculator)->calculate($participants))->toBe([
        'status' => 'invalid',
        'error' => 'balance_out_of_supported_range',
    ]);
});
