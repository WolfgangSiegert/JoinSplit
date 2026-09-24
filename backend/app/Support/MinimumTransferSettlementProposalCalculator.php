<?php

namespace App\Support;

final class MinimumTransferSettlementProposalCalculator
{
    public const NON_ZERO_PARTICIPANT_LIMIT = 12;

    /**
     * @param list<array{participantId: mixed, participantOrder: mixed, status: mixed, balanceAmountMinor: mixed}> $participants
     * @return array{status: 'success', transfers: list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}>}|array{status: 'unavailable', reason: 'non_zero_participant_limit', nonZeroParticipantCount: int, limit: 12}|array{status: 'invalid', error: string}
     */
    public function calculate(array $participants): array
    {
        $validationResult = (new DeterministicSettlementProposalCalculator)->calculate($participants);
        if ($validationResult['status'] === 'invalid') {
            return $validationResult;
        }

        $nonZeroParticipants = array_values(array_filter(
            $participants,
            fn (array $participant): bool => (int) $participant['balanceAmountMinor'] !== 0,
        ));
        usort(
            $nonZeroParticipants,
            fn (array $left, array $right): int => $left['participantOrder'] <=> $right['participantOrder'],
        );

        $nonZeroParticipantCount = count($nonZeroParticipants);
        if ($nonZeroParticipantCount > self::NON_ZERO_PARTICIPANT_LIMIT) {
            return [
                'status' => 'unavailable',
                'reason' => 'non_zero_participant_limit',
                'nonZeroParticipantCount' => $nonZeroParticipantCount,
                'limit' => self::NON_ZERO_PARTICIPANT_LIMIT,
            ];
        }

        if ($nonZeroParticipantCount === 0) {
            return ['status' => 'success', 'transfers' => []];
        }

        $participantOrders = [];
        foreach ($nonZeroParticipants as $participant) {
            $participantOrders[$participant['participantId']] = $participant['participantOrder'];
        }

        $fullMask = (1 << $nonZeroParticipantCount) - 1;
        $zeroSumMasks = $this->zeroSumMasks($nonZeroParticipants, $fullMask);
        $bestByMask = [0 => []];

        $transfers = $this->bestProposal(
            $fullMask,
            $nonZeroParticipants,
            $zeroSumMasks,
            $participantOrders,
            $bestByMask,
        );

        return ['status' => 'success', 'transfers' => $transfers];
    }

    /**
     * @param list<array{participantId: string, participantOrder: int, status: 'active'|'inactive', balanceAmountMinor: string}> $participants
     * @return array<int, true>
     */
    private function zeroSumMasks(array $participants, int $fullMask): array
    {
        $zeroSumMasks = [];

        for ($mask = 1; $mask <= $fullMask; $mask++) {
            $debtors = [];
            $creditors = [];

            foreach ($participants as $index => $participant) {
                if (($mask & (1 << $index)) === 0) {
                    continue;
                }

                $balance = (int) $participant['balanceAmountMinor'];
                if ($balance < 0) {
                    $debtors[] = $balance;
                } else {
                    $creditors[] = $balance;
                }
            }

            if ($this->oppositeSignsCancelExactly($debtors, $creditors)) {
                $zeroSumMasks[$mask] = true;
            }
        }

        return $zeroSumMasks;
    }

    /**
     * @param list<int> $debtors
     * @param list<int> $creditors
     */
    private function oppositeSignsCancelExactly(array $debtors, array $creditors): bool
    {
        $debtorIndex = 0;
        $creditorIndex = 0;

        while (isset($debtors[$debtorIndex], $creditors[$creditorIndex])) {
            $remainder = $debtors[$debtorIndex] + $creditors[$creditorIndex];

            if ($remainder < 0) {
                $debtors[$debtorIndex] = $remainder;
                $creditorIndex++;
            } elseif ($remainder > 0) {
                $creditors[$creditorIndex] = $remainder;
                $debtorIndex++;
            } else {
                $debtorIndex++;
                $creditorIndex++;
            }
        }

        return ! isset($debtors[$debtorIndex]) && ! isset($creditors[$creditorIndex]);
    }

    /**
     * @param list<array{participantId: string, participantOrder: int, status: 'active'|'inactive', balanceAmountMinor: string}> $participants
     * @param array<int, true> $zeroSumMasks
     * @param array<string, int> $participantOrders
     * @param array<int, list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}>> $bestByMask
     * @return list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}>
     */
    private function bestProposal(
        int $mask,
        array $participants,
        array $zeroSumMasks,
        array $participantOrders,
        array &$bestByMask,
    ): array {
        if (array_key_exists($mask, $bestByMask)) {
            return $bestByMask[$mask];
        }

        $anchor = $mask & (-$mask);
        $best = null;

        for ($subset = $mask; $subset > 0; $subset = ($subset - 1) & $mask) {
            if (($subset & $anchor) === 0 || ! isset($zeroSumMasks[$subset])) {
                continue;
            }

            $block = [];
            foreach ($participants as $index => $participant) {
                if (($subset & (1 << $index)) !== 0) {
                    $block[] = $participant;
                }
            }

            $blockResult = (new DeterministicSettlementProposalCalculator)->calculate($block);
            $candidate = array_merge(
                $blockResult['transfers'],
                $this->bestProposal(
                    $mask ^ $subset,
                    $participants,
                    $zeroSumMasks,
                    $participantOrders,
                    $bestByMask,
                ),
            );
            $this->sortTransfers($candidate, $participantOrders);

            if ($best === null || $this->compareProposals($candidate, $best, $participantOrders) < 0) {
                $best = $candidate;
            }
        }

        // The complete input is validated as zero-sum, so every reachable mask
        // also has at least itself as a zero-sum candidate.
        return $bestByMask[$mask] = $best ?? [];
    }

    /**
     * @param list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}> $transfers
     * @param array<string, int> $participantOrders
     */
    private function sortTransfers(array &$transfers, array $participantOrders): void
    {
        usort($transfers, function (array $left, array $right) use ($participantOrders): int {
            $senderComparison = $participantOrders[$left['senderParticipantId']]
                <=> $participantOrders[$right['senderParticipantId']];
            if ($senderComparison !== 0) {
                return $senderComparison;
            }

            return $participantOrders[$left['receiverParticipantId']]
                <=> $participantOrders[$right['receiverParticipantId']];
        });
    }

    /**
     * @param list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}> $left
     * @param list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}> $right
     * @param array<string, int> $participantOrders
     */
    private function compareProposals(array $left, array $right, array $participantOrders): int
    {
        $countComparison = count($left) <=> count($right);
        if ($countComparison !== 0) {
            return $countComparison;
        }

        foreach ($left as $index => $leftTransfer) {
            $rightTransfer = $right[$index];
            $senderComparison = $participantOrders[$leftTransfer['senderParticipantId']]
                <=> $participantOrders[$rightTransfer['senderParticipantId']];
            if ($senderComparison !== 0) {
                return $senderComparison;
            }

            $receiverComparison = $participantOrders[$leftTransfer['receiverParticipantId']]
                <=> $participantOrders[$rightTransfer['receiverParticipantId']];
            if ($receiverComparison !== 0) {
                return $receiverComparison;
            }

            $amountComparison = (int) $rightTransfer['amountMinor'] <=> (int) $leftTransfer['amountMinor'];
            if ($amountComparison !== 0) {
                return $amountComparison;
            }
        }

        return 0;
    }
}
