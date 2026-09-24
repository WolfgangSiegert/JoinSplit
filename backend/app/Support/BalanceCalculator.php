<?php

namespace App\Support;

use InvalidArgumentException;
use OverflowException;

final class BalanceCalculator
{
    private const MAX_AMOUNT_MINOR = 9007199254740991;

    /**
     * @param list<array{id: string, groupId: string, order: int}> $participants
     * @param list<array{id: string, groupId: string, amountMinor: int, payerParticipantId: string, shares: list<array{participantId: string, amountMinor: int}>}> $expenses
     * @return list<array{participantId: string, paidAmountMinor: int, shareAmountMinor: int, balanceAmountMinor: int}>
     */
    public function calculate(string $groupId, array $participants, array $expenses): array
    {
        if ($groupId === '') {
            throw new InvalidArgumentException('Group ID must be a non-empty string.');
        }

        $participantsById = [];
        $participantOrders = [];

        foreach ($participants as $participant) {
            if (! is_array($participant)) {
                throw new InvalidArgumentException('Participant must be an object.');
            }

            $participantId = $this->requiredString($participant, 'id', 'Participant');
            $participantGroupId = $this->requiredString($participant, 'groupId', 'Participant');
            $order = $participant['order'] ?? null;

            if ($participantGroupId !== $groupId) {
                throw new InvalidArgumentException('Participant belongs to another Group.');
            }
            if (isset($participantsById[$participantId])) {
                throw new InvalidArgumentException('Participant IDs must be unique.');
            }
            if (! is_int($order) || $order < 0) {
                throw new InvalidArgumentException('Participant order must be a non-negative integer.');
            }
            if (isset($participantOrders[$order])) {
                throw new InvalidArgumentException('Participant order values must be unique.');
            }

            $participantsById[$participantId] = [
                'id' => $participantId,
                'order' => $order,
                'paidAmountMinor' => 0,
                'shareAmountMinor' => 0,
            ];
            $participantOrders[$order] = true;
        }

        $expenseIds = [];

        foreach ($expenses as $expense) {
            if (! is_array($expense)) {
                throw new InvalidArgumentException('Expense must be an object.');
            }

            $expenseId = $this->requiredString($expense, 'id', 'Expense');
            $expenseGroupId = $this->requiredString($expense, 'groupId', 'Expense');
            $payerParticipantId = $this->requiredString($expense, 'payerParticipantId', 'Expense');
            $amountMinor = $this->amount($expense['amountMinor'] ?? null, false, 'Expense amount');
            $shares = $expense['shares'] ?? null;

            if ($expenseGroupId !== $groupId) {
                throw new InvalidArgumentException('Expense belongs to another Group.');
            }
            if (isset($expenseIds[$expenseId])) {
                throw new InvalidArgumentException('Expense IDs must be unique.');
            }
            if (! isset($participantsById[$payerParticipantId])) {
                throw new InvalidArgumentException('Expense payer is not a supplied Participant.');
            }
            if (! is_array($shares) || $shares === []) {
                throw new InvalidArgumentException('Expense must have at least one Share.');
            }

            $expenseIds[$expenseId] = true;
            $shareParticipantIds = [];
            $shareTotal = 0;

            foreach ($shares as $share) {
                if (! is_array($share)) {
                    throw new InvalidArgumentException('Expense Share must be an object.');
                }

                $shareParticipantId = $this->requiredString($share, 'participantId', 'Expense Share');
                $shareAmountMinor = $this->amount($share['amountMinor'] ?? null, true, 'Expense Share amount');

                if (! isset($participantsById[$shareParticipantId])) {
                    throw new InvalidArgumentException('Expense Share references an unknown Participant.');
                }
                if (isset($shareParticipantIds[$shareParticipantId])) {
                    throw new InvalidArgumentException('Expense Share Participant IDs must be unique per Expense.');
                }

                $shareParticipantIds[$shareParticipantId] = true;
                $shareTotal = $this->checkedAdd($shareTotal, $shareAmountMinor);
                $participantsById[$shareParticipantId]['shareAmountMinor'] = $this->checkedAdd(
                    $participantsById[$shareParticipantId]['shareAmountMinor'],
                    $shareAmountMinor,
                );
            }

            if ($shareTotal !== $amountMinor) {
                throw new InvalidArgumentException('Expense Share amounts must sum to the Expense amount.');
            }

            $participantsById[$payerParticipantId]['paidAmountMinor'] = $this->checkedAdd(
                $participantsById[$payerParticipantId]['paidAmountMinor'],
                $amountMinor,
            );
        }

        uasort(
            $participantsById,
            fn (array $left, array $right): int => $left['order'] <=> $right['order'],
        );

        return array_values(array_map(
            fn (array $participant): array => [
                'participantId' => $participant['id'],
                'paidAmountMinor' => $participant['paidAmountMinor'],
                'shareAmountMinor' => $participant['shareAmountMinor'],
                'balanceAmountMinor' => $participant['paidAmountMinor'] - $participant['shareAmountMinor'],
            ],
            $participantsById,
        ));
    }

    /** @param array<string, mixed> $value */
    private function requiredString(array $value, string $key, string $label): string
    {
        $result = $value[$key] ?? null;

        if (! is_string($result) || $result === '') {
            throw new InvalidArgumentException("{$label} {$key} must be a non-empty string.");
        }

        return $result;
    }

    private function amount(mixed $value, bool $allowZero, string $label): int
    {
        if (! is_int($value)
            || $value < ($allowZero ? 0 : 1)
            || $value > self::MAX_AMOUNT_MINOR) {
            throw new InvalidArgumentException("{$label} is outside the supported range.");
        }

        return $value;
    }

    private function checkedAdd(int $left, int $right): int
    {
        if ($right > 0 && $left > PHP_INT_MAX - $right) {
            throw new OverflowException('Balance aggregate exceeds PHP integer range.');
        }

        if ($right < 0 && $left < PHP_INT_MIN - $right) {
            throw new OverflowException('Balance aggregate exceeds PHP integer range.');
        }

        return $left + $right;
    }
}
