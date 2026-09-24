<?php

use App\Support\SettlementBalancePolicy;

it('applies every relevant shared Settlement validation and Balance vector', function () {
    $fixture = json_decode(
        file_get_contents(__DIR__.'/../../../docs/architecture/fixtures/settlement-vectors.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );
    $policy = new SettlementBalancePolicy;

    foreach ($fixture['validationAndBalanceVectors'] as $vector) {
        if ($vector['groupStatus'] !== 'active'
            || $vector['operation']['type'] === 'delete'
            || (($vector['expected']['httpStatus'] ?? null) === 422)) {
            continue;
        }

        $settlement = $vector['operation']['settlement'];
        $balances = $vector['expected']['balancesBeforeCandidate'] ?? $vector['participants'];
        $participants = collect($vector['participants'])->keyBy('participantId');
        $balancesById = collect($balances)->keyBy('participantId');
        $sender = $participants->get($settlement['senderParticipantId']);
        $receiver = $participants->get($settlement['receiverParticipantId']);
        $shouldReject = $vector['expected']['decision'] === 'reject';

        try {
            $result = $policy->apply(
                (int) $balancesById->get($sender['participantId'])['balanceAmountMinor'],
                (int) $balancesById->get($receiver['participantId'])['balanceAmountMinor'],
                $sender['status'] === 'active',
                $receiver['status'] === 'active',
                (int) $settlement['amountMinor'],
            );
        } catch (InvalidArgumentException|OverflowException) {
            expect($shouldReject)->toBeTrue($vector['name']);
            continue;
        }

        expect($shouldReject)->toBeFalse($vector['name']);
        $expected = collect($vector['expected']['balancesAfter'])->keyBy('participantId');
        expect((string) $result['senderBalanceAfter'])
            ->toBe($expected->get($sender['participantId'])['balanceAmountMinor'], $vector['name'])
            ->and((string) $result['receiverBalanceAfter'])
            ->toBe($expected->get($receiver['participantId'])['balanceAmountMinor'], $vector['name']);
    }
});
