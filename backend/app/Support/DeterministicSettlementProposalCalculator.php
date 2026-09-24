<?php

namespace App\Support;

use OverflowException;

final class DeterministicSettlementProposalCalculator
{
    private const MIN_AMOUNT = '-9223372036854775808';

    private const MAX_AMOUNT = '9223372036854775807';

    private const MAX_PARTICIPANT_ORDER = 9007199254740991;

    /**
     * @param list<array{participantId: mixed, participantOrder: mixed, status: mixed, balanceAmountMinor: mixed}> $participants
     * @return array{status: 'success', transfers: list<array{senderParticipantId: string, receiverParticipantId: string, amountMinor: string}>}|array{status: 'invalid', error: string}
     */
    public function calculate(array $participants): array
    {
        if (PHP_INT_SIZE !== 8) {
            throw new OverflowException('Settlement proposals require 64-bit PHP integers.');
        }

        foreach ($participants as $participant) {
            if (! is_array($participant) || array_is_list($participant)) {
                return $this->invalid('invalid_participant');
            }
        }

        $normalized = [];
        foreach ($participants as $participant) {
            $order = $participant['participantOrder'] ?? null;
            if (! is_int($order) || $order < 0 || $order > self::MAX_PARTICIPANT_ORDER) {
                return $this->invalid('invalid_participant_order');
            }

            $normalized[] = [
                'participantId' => $participant['participantId'] ?? null,
                'participantOrder' => $order,
                'status' => $participant['status'] ?? null,
                'balanceAmountMinor' => $participant['balanceAmountMinor'] ?? null,
            ];
        }

        usort(
            $normalized,
            fn (array $left, array $right): int => $left['participantOrder'] <=> $right['participantOrder'],
        );

        $ids = [];
        $orders = [];
        $debtors = [];
        $creditors = [];

        foreach ($normalized as $participant) {
            $participantId = $participant['participantId'];
            if (! is_string($participantId) || preg_match('/^[\x09-\x0D\x20]*$/D', $participantId) === 1) {
                return $this->invalid('invalid_participant_id');
            }
        }

        foreach ($normalized as $participant) {
            $participantId = $participant['participantId'];
            if (isset($ids[$participantId])) {
                return $this->invalid('duplicate_participant_id');
            }
            $ids[$participantId] = true;
        }

        foreach ($normalized as $participant) {
            $order = $participant['participantOrder'];
            if (isset($orders[$order])) {
                return $this->invalid('duplicate_participant_order');
            }
            $orders[$order] = true;
        }

        foreach ($normalized as $participant) {
            if ($participant['status'] !== 'active' && $participant['status'] !== 'inactive') {
                return $this->invalid('invalid_participant_status');
            }
        }

        foreach ($normalized as $participant) {
            $parsedBalance = $this->parseAmount($participant['balanceAmountMinor']);
            if (is_string($parsedBalance)) {
                return $this->invalid($parsedBalance);
            }

            $entry = [
                'participantId' => $participant['participantId'],
                'participantOrder' => $participant['participantOrder'],
                'balanceAmountMinor' => $parsedBalance,
            ];
            if ($parsedBalance < 0) {
                $debtors[] = $entry;
            } elseif ($parsedBalance > 0) {
                $creditors[] = $entry;
            }
        }

        if (! $this->balancesSumToZero($debtors, $creditors)) {
            return $this->invalid('balance_sum_not_zero');
        }

        $transfers = [];
        $debtorIndex = 0;
        $creditorIndex = 0;

        while (isset($debtors[$debtorIndex], $creditors[$creditorIndex])) {
            $debt = $debtors[$debtorIndex]['balanceAmountMinor'];
            $credit = $creditors[$creditorIndex]['balanceAmountMinor'];
            $remainder = $debt + $credit;

            if ($remainder <= 0) {
                $amount = $credit;
            } else {
                // A positive remainder proves that the debt magnitude is less
                // than this positive credit, so $debt cannot be PHP_INT_MIN.
                $amount = -$debt;
            }

            $transfers[] = [
                'senderParticipantId' => $debtors[$debtorIndex]['participantId'],
                'receiverParticipantId' => $creditors[$creditorIndex]['participantId'],
                'amountMinor' => (string) $amount,
            ];

            if ($remainder < 0) {
                $debtors[$debtorIndex]['balanceAmountMinor'] = $remainder;
                $creditorIndex++;
            } elseif ($remainder > 0) {
                $creditors[$creditorIndex]['balanceAmountMinor'] = $remainder;
                $debtorIndex++;
            } else {
                $debtorIndex++;
                $creditorIndex++;
            }
        }

        if (isset($debtors[$debtorIndex]) || isset($creditors[$creditorIndex])) {
            return $this->invalid('balance_sum_not_zero');
        }

        return ['status' => 'success', 'transfers' => $transfers];
    }

    /**
     * @param list<array{participantId: string, participantOrder: int, balanceAmountMinor: int}> $debtors
     * @param list<array{participantId: string, participantOrder: int, balanceAmountMinor: int}> $creditors
     */
    private function balancesSumToZero(array $debtors, array $creditors): bool
    {
        $debtorIndex = 0;
        $creditorIndex = 0;

        while (isset($debtors[$debtorIndex], $creditors[$creditorIndex])) {
            $remainder = $debtors[$debtorIndex]['balanceAmountMinor']
                + $creditors[$creditorIndex]['balanceAmountMinor'];

            if ($remainder < 0) {
                $debtors[$debtorIndex]['balanceAmountMinor'] = $remainder;
                $creditorIndex++;
            } elseif ($remainder > 0) {
                $creditors[$creditorIndex]['balanceAmountMinor'] = $remainder;
                $debtorIndex++;
            } else {
                $debtorIndex++;
                $creditorIndex++;
            }
        }

        return ! isset($debtors[$debtorIndex]) && ! isset($creditors[$creditorIndex]);
    }

    /** @return int|'invalid_balance_amount'|'balance_out_of_supported_range' */
    private function parseAmount(mixed $value): int|string
    {
        if (! is_string($value) || preg_match('/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/D', $value) !== 1) {
            return 'invalid_balance_amount';
        }

        if ($this->isOutsideSupportedRange($value)) {
            return 'balance_out_of_supported_range';
        }

        return (int) $value;
    }

    private function isOutsideSupportedRange(string $value): bool
    {
        if ($value[0] === '-') {
            $magnitude = substr($value, 1);
            $minimumMagnitude = substr(self::MIN_AMOUNT, 1);

            return strlen($magnitude) > strlen($minimumMagnitude)
                || (strlen($magnitude) === strlen($minimumMagnitude) && strcmp($magnitude, $minimumMagnitude) > 0);
        }

        return strlen($value) > strlen(self::MAX_AMOUNT)
            || (strlen($value) === strlen(self::MAX_AMOUNT) && strcmp($value, self::MAX_AMOUNT) > 0);
    }

    /** @return array{status: 'invalid', error: string} */
    private function invalid(string $error): array
    {
        return ['status' => 'invalid', 'error' => $error];
    }
}
