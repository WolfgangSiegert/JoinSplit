<?php

namespace App\Support;

use InvalidArgumentException;
use OverflowException;

final class SettlementBalancePolicy
{
    /** @return array{senderBalanceAfter: int, receiverBalanceAfter: int} */
    public function apply(
        int $senderBalance,
        int $receiverBalance,
        bool $senderActive,
        bool $receiverActive,
        int $amountMinor,
    ): array {
        if ($amountMinor < 1) {
            throw new InvalidArgumentException('Settlement amount must be positive.');
        }

        if ((! $senderActive || ! $receiverActive)
            && ($senderBalance > -$amountMinor || $amountMinor > $receiverBalance)) {
            throw new InvalidArgumentException('An inactive Participant payment must reduce both open Balances.');
        }

        if ($senderBalance > PHP_INT_MAX - $amountMinor) {
            throw new OverflowException('Settlement would overflow the sender Balance.');
        }
        if ($receiverBalance < PHP_INT_MIN + $amountMinor) {
            throw new OverflowException('Settlement would overflow the receiver Balance.');
        }

        return [
            'senderBalanceAfter' => $senderBalance + $amountMinor,
            'receiverBalanceAfter' => $receiverBalance - $amountMinor,
        ];
    }
}
