<?php

namespace App\Support;

final class EqualSplitCalculator
{
    /**
     * @param list<string> $orderedParticipantIds
     * @return list<array{participantId: string, amountMinor: int}>
     */
    public function calculate(int $amountMinor, array $orderedParticipantIds): array
    {
        $count = count($orderedParticipantIds);
        $base = intdiv($amountMinor, $count);
        $remainder = $amountMinor % $count;

        return array_map(
            fn (string $participantId, int $index): array => [
                'participantId' => $participantId,
                'amountMinor' => $base + ($index < $remainder ? 1 : 0),
            ],
            $orderedParticipantIds,
            array_keys($orderedParticipantIds),
        );
    }
}
