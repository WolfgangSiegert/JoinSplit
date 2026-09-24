<?php

namespace App\Actions;

use App\Exceptions\PersistenceException;
use App\Exceptions\GroupLifecycleConflictException;
use App\Exceptions\SettlementConflictException;
use App\Models\AccessIdentity;
use App\Models\Expense;
use App\Models\Group;
use App\Models\Participant;
use App\Models\Settlement;
use App\Support\BalanceCalculator;
use App\Support\SettlementBalancePolicy;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use OverflowException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ManageSettlement
{
    public function __construct(
        private BalanceCalculator $balanceCalculator,
        private SettlementBalancePolicy $balancePolicy,
    ) {}

    /** @return array{settlement: Settlement, created: bool} */
    public function create(AccessIdentity $actor, string $groupId, array $data): array
    {
        try {
            return DB::transaction(function () use ($actor, $groupId, $data): array {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $existing = Settlement::query()->whereKey($data['settlementId'])->lockForUpdate()->first();
                $amountMinor = $this->amount($data['amountMinor']);

                if ($existing) {
                    $this->assertEquivalent($existing, $group, $actor, $data, $amountMinor);

                    return ['settlement' => $existing, 'created' => false];
                }

                $participants = $this->orderedParticipants($group);
                $this->assertCandidateAllowed($group, $participants, $data, $amountMinor);

                $settlement = $group->settlements()->create([
                    'id' => $data['settlementId'],
                    'sender_participant_id' => $data['senderParticipantId'],
                    'receiver_participant_id' => $data['receiverParticipantId'],
                    'amount_minor' => $amountMinor,
                    'occurred_on' => $data['occurredOn'],
                    'creator_access_identity_id' => $actor->id,
                ]);

                if (! $group->has_financial_history) {
                    $group->has_financial_history = true;
                    $group->save();
                }

                return ['settlement' => $settlement, 'created' => true];
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') {
                throw new SettlementConflictException(previous: $exception);
            }

            throw new PersistenceException(previous: $exception);
        } catch (InvalidArgumentException|OverflowException $exception) {
            throw new SettlementConflictException(previous: $exception);
        }
    }

    public function update(
        AccessIdentity $actor,
        string $groupId,
        string $settlementId,
        array $data,
    ): Settlement {
        try {
            return DB::transaction(function () use ($actor, $groupId, $settlementId, $data): Settlement {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $settlement = Settlement::query()->whereKey($settlementId)->lockForUpdate()->first();

                if (! $settlement || $settlement->group_id !== $group->id) {
                    throw new NotFoundHttpException;
                }

                $amountMinor = $this->amount($data['amountMinor']);
                if ($this->mutableStateMatches($settlement, $data, $amountMinor)) {
                    return $settlement;
                }

                $participants = $this->orderedParticipants($group);
                $this->assertCandidateAllowed($group, $participants, $data, $amountMinor, $settlement->id);

                $settlement->fill([
                    'sender_participant_id' => $data['senderParticipantId'],
                    'receiver_participant_id' => $data['receiverParticipantId'],
                    'amount_minor' => $amountMinor,
                    'occurred_on' => $data['occurredOn'],
                ]);
                $settlement->save();

                return $settlement;
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        } catch (InvalidArgumentException|OverflowException $exception) {
            throw new SettlementConflictException(previous: $exception);
        }
    }

    public function delete(AccessIdentity $actor, string $groupId, string $settlementId): void
    {
        try {
            DB::transaction(function () use ($actor, $groupId, $settlementId): void {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $settlement = Settlement::query()->whereKey($settlementId)->lockForUpdate()->first();

                if (! $settlement) {
                    return;
                }
                if ($settlement->group_id !== $group->id) {
                    throw new NotFoundHttpException;
                }

                $settlement->delete();
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        }
    }

    private function ownedActiveGroup(AccessIdentity $actor, string $groupId): Group
    {
        $group = Group::query()
            ->whereKey($groupId)
            ->where('owner_access_identity_id', $actor->id)
            ->lockForUpdate()
            ->first();

        if (! $group) {
            throw new NotFoundHttpException;
        }
        if (! $group->is_active) {
            throw new GroupLifecycleConflictException;
        }

        return $group;
    }

    /** @return Collection<int, Participant> */
    private function orderedParticipants(Group $group): Collection
    {
        return Participant::query()
            ->where('group_id', $group->id)
            ->orderBy('position')
            ->lockForUpdate()
            ->get();
    }

    private function assertCandidateAllowed(
        Group $group,
        Collection $participants,
        array $data,
        int $amountMinor,
        ?string $excludedSettlementId = null,
    ): void {
        $sender = $this->participant($participants, $data['senderParticipantId']);
        $receiver = $this->participant($participants, $data['receiverParticipantId']);
        if (! $sender || ! $receiver || $sender->id === $receiver->id) {
            throw new SettlementConflictException;
        }

        $balances = collect($this->calculateBalances($group, $participants, $excludedSettlementId))
            ->keyBy('participantId');
        $senderState = $balances->get($sender->id);
        $receiverState = $balances->get($receiver->id);
        $senderBalance = $senderState['balanceAmountMinor'];
        $receiverBalance = $receiverState['balanceAmountMinor'];

        $this->checkedNonNegativeAdd($senderState['sentSettlementAmountMinor'], $amountMinor);
        $this->checkedNonNegativeAdd($receiverState['receivedSettlementAmountMinor'], $amountMinor);

        $this->balancePolicy->apply(
            $senderBalance,
            $receiverBalance,
            $sender->is_active,
            $receiver->is_active,
            $amountMinor,
        );
    }

    /** @return list<array<string, int|string>> */
    private function calculateBalances(
        Group $group,
        Collection $participants,
        ?string $excludedSettlementId,
    ): array {
        $participantInput = $participants->map(fn (Participant $participant): array => [
            'id' => $participant->id,
            'groupId' => $participant->group_id,
            'order' => $participant->position,
        ])->values()->all();

        $expenseInput = Expense::query()
            ->where('group_id', $group->id)
            ->with('shares')
            ->get()
            ->map(fn (Expense $expense): array => [
                'id' => $expense->id,
                'groupId' => $expense->group_id,
                'amountMinor' => $expense->amount_minor,
                'payerParticipantId' => $expense->payer_participant_id,
                'shares' => $expense->shares->map(fn ($share): array => [
                    'participantId' => $share->participant_id,
                    'amountMinor' => $share->amount_minor,
                ])->values()->all(),
            ])->values()->all();

        $settlements = Settlement::query()
            ->where('group_id', $group->id)
            ->when($excludedSettlementId, fn ($query) => $query->where('id', '!=', $excludedSettlementId))
            ->get()
            ->map(fn (Settlement $settlement): array => [
                'id' => $settlement->id,
                'groupId' => $settlement->group_id,
                'senderParticipantId' => $settlement->sender_participant_id,
                'receiverParticipantId' => $settlement->receiver_participant_id,
                'amountMinor' => $settlement->amount_minor,
            ])->values()->all();

        return $this->balanceCalculator->calculate($group->id, $participantInput, $expenseInput, $settlements);
    }

    private function participant(Collection $participants, string $participantId): ?Participant
    {
        return $participants->first(
            fn (Participant $participant): bool => strtolower($participant->id) === strtolower($participantId),
        );
    }

    private function assertEquivalent(
        Settlement $settlement,
        Group $group,
        AccessIdentity $actor,
        array $data,
        int $amountMinor,
    ): void {
        if ($settlement->group_id !== $group->id) {
            throw new NotFoundHttpException;
        }

        if ($settlement->creator_access_identity_id !== $actor->id
            || ! $this->mutableStateMatches($settlement, $data, $amountMinor)) {
            throw new SettlementConflictException;
        }
    }

    private function mutableStateMatches(Settlement $settlement, array $data, int $amountMinor): bool
    {
        return strtolower($settlement->sender_participant_id) === strtolower($data['senderParticipantId'])
            && strtolower($settlement->receiver_participant_id) === strtolower($data['receiverParticipantId'])
            && $settlement->amount_minor === $amountMinor
            && $settlement->occurred_on->format('Y-m-d') === $data['occurredOn'];
    }

    private function amount(string $amountMinor): int
    {
        if (PHP_INT_SIZE !== 8) {
            throw new OverflowException('Settlement handling requires 64-bit PHP integers.');
        }

        return (int) $amountMinor;
    }

    private function checkedNonNegativeAdd(int $aggregate, int $amount): int
    {
        if ($aggregate > PHP_INT_MAX - $amount) {
            throw new OverflowException('Settlement would overflow a financial-state category.');
        }

        return $aggregate + $amount;
    }

}
