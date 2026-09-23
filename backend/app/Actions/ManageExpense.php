<?php

namespace App\Actions;

use App\Exceptions\ExpenseConflictException;
use App\Exceptions\PersistenceException;
use App\Models\AccessIdentity;
use App\Models\Expense;
use App\Models\Group;
use App\Models\Participant;
use App\Support\EqualSplitCalculator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ManageExpense
{
    public function __construct(private EqualSplitCalculator $equalSplitCalculator) {}

    /** @return array{expense: Expense, created: bool} */
    public function create(AccessIdentity $actor, string $groupId, array $data): array
    {
        try {
            return DB::transaction(function () use ($actor, $groupId, $data): array {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $existing = Expense::query()->whereKey($data['expenseId'])->lockForUpdate()->first();
                $participants = $this->orderedParticipants($group);

                if ($existing) {
                    $orderedIds = $this->validateExistingParticipants($participants, $data);
                    $shares = $this->equalSplitCalculator->calculate($data['amountMinor'], $orderedIds);
                    $this->assertEquivalent($existing, $group, $actor, $data, $shares);

                    return ['expense' => $this->loadForResponse($existing), 'created' => false];
                }

                $orderedIds = $this->validateCreateParticipants($participants, $data);
                $shares = $this->equalSplitCalculator->calculate($data['amountMinor'], $orderedIds);

                $expense = $group->expenses()->create([
                    'id' => $data['expenseId'],
                    'description' => $data['description'],
                    'amount_minor' => $data['amountMinor'],
                    'incurred_on' => $data['incurredOn'],
                    'payer_participant_id' => $data['payerParticipantId'],
                    'creator_access_identity_id' => $actor->id,
                    'split_method' => 'equal',
                ]);
                $this->persistShares($expense, $shares);

                if (! $group->has_financial_history) {
                    $group->has_financial_history = true;
                    $group->save();
                }

                return ['expense' => $this->loadForResponse($expense), 'created' => true];
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') {
                throw new ExpenseConflictException(previous: $exception);
            }

            throw new PersistenceException(previous: $exception);
        }
    }

    public function update(
        AccessIdentity $actor,
        string $groupId,
        string $expenseId,
        array $data,
    ): Expense {
        try {
            return DB::transaction(function () use ($actor, $groupId, $expenseId, $data): Expense {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $expense = Expense::query()->whereKey($expenseId)->lockForUpdate()->first();

                if (! $expense || $expense->group_id !== $group->id) {
                    throw new NotFoundHttpException;
                }

                $expense->load('shares');
                $participants = $this->orderedParticipants($group);
                $orderedIds = $this->validateUpdateParticipants($participants, $expense, $data);
                $shares = $this->equalSplitCalculator->calculate($data['amountMinor'], $orderedIds);

                $expense->fill([
                    'description' => $data['description'],
                    'amount_minor' => $data['amountMinor'],
                    'incurred_on' => $data['incurredOn'],
                    'payer_participant_id' => $data['payerParticipantId'],
                    'split_method' => 'equal',
                ]);
                $expense->save();
                $expense->shares()->delete();
                $this->persistShares($expense, $shares);

                return $this->loadForResponse($expense);
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        }
    }

    public function delete(AccessIdentity $actor, string $groupId, string $expenseId): void
    {
        try {
            DB::transaction(function () use ($actor, $groupId, $expenseId): void {
                $group = $this->ownedActiveGroup($actor, $groupId);
                $expense = Expense::query()->whereKey($expenseId)->lockForUpdate()->first();

                if (! $expense) {
                    return;
                }

                if ($expense->group_id !== $group->id) {
                    throw new NotFoundHttpException;
                }

                $expense->delete();
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

        if (! $group || ! $group->is_active) {
            throw new NotFoundHttpException;
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

    /** @return list<string> */
    private function validateCreateParticipants(Collection $participants, array $data): array
    {
        $payer = $this->participant($participants, $data['payerParticipantId']);
        if (! $payer || ! $payer->is_active) {
            throw new ExpenseConflictException;
        }

        $selected = $this->selectedParticipants($participants, $data['participantIds']);
        if ($selected->contains(fn (Participant $participant): bool => ! $participant->is_active)) {
            throw new ExpenseConflictException;
        }

        return $selected->pluck('id')->values()->all();
    }

    /** @return list<string> */
    private function validateExistingParticipants(Collection $participants, array $data): array
    {
        if (! $this->participant($participants, $data['payerParticipantId'])) {
            throw new ExpenseConflictException;
        }

        return $this->selectedParticipants($participants, $data['participantIds'])
            ->pluck('id')
            ->values()
            ->all();
    }

    /** @return list<string> */
    private function validateUpdateParticipants(
        Collection $participants,
        Expense $expense,
        array $data,
    ): array {
        $payer = $this->participant($participants, $data['payerParticipantId']);
        if (! $payer || (! $payer->is_active && $payer->id !== $expense->payer_participant_id)) {
            throw new ExpenseConflictException;
        }

        $previousShareIds = $expense->shares
            ->mapWithKeys(fn ($share): array => [strtolower($share->participant_id) => true]);
        $selected = $this->selectedParticipants($participants, $data['participantIds']);

        if ($selected->contains(
            fn (Participant $participant): bool => ! $participant->is_active
                && ! $previousShareIds->has(strtolower($participant->id)),
        )) {
            throw new ExpenseConflictException;
        }

        return $selected->pluck('id')->values()->all();
    }

    private function participant(Collection $participants, string $participantId): ?Participant
    {
        return $participants->first(
            fn (Participant $participant): bool => strtolower($participant->id) === strtolower($participantId),
        );
    }

    /** @return Collection<int, Participant> */
    private function selectedParticipants(Collection $participants, array $requestedIds): Collection
    {
        $requested = collect($requestedIds)
            ->mapWithKeys(fn (string $id): array => [strtolower($id) => true]);
        $selected = $participants
            ->filter(fn (Participant $participant): bool => $requested->has(strtolower($participant->id)))
            ->values();

        if ($selected->count() !== $requested->count()) {
            throw new ExpenseConflictException;
        }

        return $selected;
    }

    /** @param list<array{participantId: string, amountMinor: int}> $shares */
    private function persistShares(Expense $expense, array $shares): void
    {
        $expense->shares()->createMany(array_map(
            fn (array $share): array => [
                'participant_id' => $share['participantId'],
                'amount_minor' => $share['amountMinor'],
            ],
            $shares,
        ));
    }

    /** @param list<array{participantId: string, amountMinor: int}> $expectedShares */
    private function assertEquivalent(
        Expense $expense,
        Group $group,
        AccessIdentity $actor,
        array $data,
        array $expectedShares,
    ): void {
        $expense = $this->loadForResponse($expense);
        $actualShares = $expense->shares->map(fn ($share): array => [
            'participantId' => $share->participant_id,
            'amountMinor' => $share->amount_minor,
        ])->values()->all();

        $matches = $expense->group_id === $group->id
            && $expense->creator_access_identity_id === $actor->id
            && $expense->description === $data['description']
            && $expense->amount_minor === $data['amountMinor']
            && $expense->incurred_on->format('Y-m-d') === $data['incurredOn']
            && strtolower($expense->payer_participant_id) === strtolower($data['payerParticipantId'])
            && $expense->split_method === 'equal'
            && $actualShares === $expectedShares;

        if (! $matches) {
            throw new ExpenseConflictException;
        }
    }

    private function loadForResponse(Expense $expense): Expense
    {
        $fresh = $expense->fresh(['shares.participant']);
        if (! $fresh) {
            throw new PersistenceException;
        }

        return $fresh->setRelation(
            'shares',
            $fresh->shares
                ->sortBy(fn ($share): int => $share->participant->position)
                ->values(),
        );
    }
}
