<?php

namespace App\Support;

use InvalidArgumentException;
use OverflowException;

final class BalanceCalculator
{
    private const MAX_EXPENSE_AMOUNT_MINOR = 9007199254740991;

    /**
     * @param list<array{id: string, groupId: string, order: int}> $participants
     * @param list<array{id: string, groupId: string, amountMinor: int, payerParticipantId: string, shares: list<array{participantId: string, amountMinor: int}>}> $expenses
     * @param list<array{id: string, groupId: string, senderParticipantId: string, receiverParticipantId: string, amountMinor: int}> $settlements
     * @return list<array{participantId: string, paidAmountMinor: int, shareAmountMinor: int, sentSettlementAmountMinor: int, receivedSettlementAmountMinor: int, balanceAmountMinor: int}>
     */
    public function calculate(string $groupId, array $participants, array $expenses, array $settlements = []): array
    {
        if (PHP_INT_SIZE !== 8) {
            throw new OverflowException('Balance calculation requires 64-bit PHP integers.');
        }
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
                'sentSettlementAmountMinor' => 0,
                'receivedSettlementAmountMinor' => 0,
            ];
            $participantOrders[$order] = true;
        }

        $this->addExpenses($groupId, $participantsById, $expenses);
        $this->addSettlements($groupId, $participantsById, $settlements);

        uasort($participantsById, fn (array $left, array $right): int => $left['order'] <=> $right['order']);

        return array_values(array_map(function (array $participant): array {
            $expenseDelta = $participant['paidAmountMinor'] - $participant['shareAmountMinor'];
            $settlementDelta = $participant['sentSettlementAmountMinor'] - $participant['receivedSettlementAmountMinor'];

            return [
                'participantId' => $participant['id'],
                'paidAmountMinor' => $participant['paidAmountMinor'],
                'shareAmountMinor' => $participant['shareAmountMinor'],
                'sentSettlementAmountMinor' => $participant['sentSettlementAmountMinor'],
                'receivedSettlementAmountMinor' => $participant['receivedSettlementAmountMinor'],
                'balanceAmountMinor' => $this->checkedSignedAdd($expenseDelta, $settlementDelta),
            ];
        }, $participantsById));
    }

    private function addExpenses(string $groupId, array &$participantsById, array $expenses): void
    {
        $expenseIds = [];
        foreach ($expenses as $expense) {
            if (! is_array($expense)) {
                throw new InvalidArgumentException('Expense must be an object.');
            }
            $expenseId = $this->requiredString($expense, 'id', 'Expense');
            $expenseGroupId = $this->requiredString($expense, 'groupId', 'Expense');
            $payerId = $this->requiredString($expense, 'payerParticipantId', 'Expense');
            $amount = $this->expenseAmount($expense['amountMinor'] ?? null, false, 'Expense amount');
            $shares = $expense['shares'] ?? null;
            if ($expenseGroupId !== $groupId) {
                throw new InvalidArgumentException('Expense belongs to another Group.');
            }
            if (isset($expenseIds[$expenseId])) {
                throw new InvalidArgumentException('Expense IDs must be unique.');
            }
            if (! isset($participantsById[$payerId])) {
                throw new InvalidArgumentException('Expense payer is not a supplied Participant.');
            }
            if (! is_array($shares) || $shares === []) {
                throw new InvalidArgumentException('Expense must have at least one Share.');
            }
            $expenseIds[$expenseId] = true;
            $shareIds = [];
            $shareTotal = 0;
            foreach ($shares as $share) {
                if (! is_array($share)) {
                    throw new InvalidArgumentException('Expense Share must be an object.');
                }
                $shareId = $this->requiredString($share, 'participantId', 'Expense Share');
                $shareAmount = $this->expenseAmount($share['amountMinor'] ?? null, true, 'Expense Share amount');
                if (! isset($participantsById[$shareId])) {
                    throw new InvalidArgumentException('Expense Share references an unknown Participant.');
                }
                if (isset($shareIds[$shareId])) {
                    throw new InvalidArgumentException('Expense Share Participant IDs must be unique per Expense.');
                }
                $shareIds[$shareId] = true;
                $shareTotal = $this->checkedNonNegativeAdd($shareTotal, $shareAmount);
                $participantsById[$shareId]['shareAmountMinor'] = $this->checkedNonNegativeAdd(
                    $participantsById[$shareId]['shareAmountMinor'],
                    $shareAmount,
                );
            }
            if ($shareTotal !== $amount) {
                throw new InvalidArgumentException('Expense Share amounts must sum to the Expense amount.');
            }
            $participantsById[$payerId]['paidAmountMinor'] = $this->checkedNonNegativeAdd(
                $participantsById[$payerId]['paidAmountMinor'],
                $amount,
            );
        }
    }

    private function addSettlements(string $groupId, array &$participantsById, array $settlements): void
    {
        $settlementIds = [];
        foreach ($settlements as $settlement) {
            if (! is_array($settlement)) {
                throw new InvalidArgumentException('Settlement must be an object.');
            }
            $id = $this->requiredString($settlement, 'id', 'Settlement');
            $settlementGroupId = $this->requiredString($settlement, 'groupId', 'Settlement');
            $senderId = $this->requiredString($settlement, 'senderParticipantId', 'Settlement');
            $receiverId = $this->requiredString($settlement, 'receiverParticipantId', 'Settlement');
            $amount = $this->settlementAmount($settlement['amountMinor'] ?? null);
            if ($settlementGroupId !== $groupId) {
                throw new InvalidArgumentException('Settlement belongs to another Group.');
            }
            if (isset($settlementIds[$id])) {
                throw new InvalidArgumentException('Settlement IDs must be unique.');
            }
            if ($senderId === $receiverId) {
                throw new InvalidArgumentException('Settlement sender and receiver must differ.');
            }
            if (! isset($participantsById[$senderId]) || ! isset($participantsById[$receiverId])) {
                throw new InvalidArgumentException('Settlement references an unknown Participant.');
            }
            $settlementIds[$id] = true;
            $participantsById[$senderId]['sentSettlementAmountMinor'] = $this->checkedNonNegativeAdd(
                $participantsById[$senderId]['sentSettlementAmountMinor'],
                $amount,
            );
            $participantsById[$receiverId]['receivedSettlementAmountMinor'] = $this->checkedNonNegativeAdd(
                $participantsById[$receiverId]['receivedSettlementAmountMinor'],
                $amount,
            );
        }
    }

    private function requiredString(array $value, string $key, string $label): string
    {
        $result = $value[$key] ?? null;
        if (! is_string($result) || $result === '') {
            throw new InvalidArgumentException("{$label} {$key} must be a non-empty string.");
        }
        return $result;
    }

    private function expenseAmount(mixed $value, bool $allowZero, string $label): int
    {
        if (! is_int($value) || $value < ($allowZero ? 0 : 1) || $value > self::MAX_EXPENSE_AMOUNT_MINOR) {
            throw new InvalidArgumentException("{$label} is outside the supported range.");
        }
        return $value;
    }

    private function settlementAmount(mixed $value): int
    {
        if (! is_int($value) || $value < 1) {
            throw new InvalidArgumentException('Settlement amount is outside the supported range.');
        }
        return $value;
    }

    private function checkedNonNegativeAdd(int $left, int $right): int
    {
        if ($left < 0 || $right < 0 || $left > PHP_INT_MAX - $right) {
            throw new OverflowException('Balance aggregate exceeds signed 64-bit range.');
        }
        return $left + $right;
    }

    private function checkedSignedAdd(int $left, int $right): int
    {
        if (($right > 0 && $left > PHP_INT_MAX - $right)
            || ($right < 0 && $left < PHP_INT_MIN - $right)) {
            throw new OverflowException('Balance aggregate exceeds signed 64-bit range.');
        }
        return $left + $right;
    }
}
