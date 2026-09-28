<?php

namespace App\Http\Controllers;

use App\Actions\ImportAccountGroup;
use App\Actions\ImportAccountPeople;
use App\Http\Requests\ImportAccountGroupRequest;
use App\Http\Requests\ImportAccountPeopleRequest;
use App\Models\Account;
use App\Models\Group;
use App\Models\Person;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountWorkspaceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');

        [$groups, $people] = DB::transaction(function () use ($account) {
            $groups = Group::query()
                ->whereHas('owner', fn ($query) => $query->where('account_id', $account->id))
                ->lockForUpdate()
                ->with(['participants', 'expenses.shares', 'settlements'])
                ->orderBy('id')
                ->get()
                ->map(fn (Group $group): array => $this->snapshot($group))
                ->values();
            $people = Person::query()->where('account_id', $account->id)
                ->lockForUpdate()->orderBy('id')->get()
                ->map(fn (Person $person): array => [
                    'id' => $person->id, 'name' => $person->name,
                    'status' => $person->is_active ? 'active' : 'inactive',
                    'revision' => $person->revision,
                ])->values();

            return [$groups, $people];
        });

        return response()->json([
            'data' => [
                'account' => ['id' => $account->id, 'name' => $account->name, 'email' => $account->email],
                'people' => $people,
                'groups' => $groups,
            ],
        ]);
    }

    public function import(
        ImportAccountGroupRequest $request,
        string $adoption,
        string $group,
        ImportAccountGroup $import,
    ): JsonResponse {
        abort_unless($request->input('snapshot.group.id') === $group, 422, 'Group identifier mismatch.');

        /** @var Account $account */
        $account = $request->user('web');
        $imported = $import->handle(
            $account,
            strtolower($adoption),
            $request->string('importId')->toString(),
            $request->validated('snapshot'),
        );

        return response()->json(['data' => ['groupId' => $imported->id, 'revision' => $imported->revision]], 201);
    }

    public function importPeople(
        ImportAccountPeopleRequest $request,
        string $adoption,
        ImportAccountPeople $import,
    ): JsonResponse {
        /** @var Account $account */
        $account = $request->user('web');
        $import->handle(
            $account,
            strtolower($adoption),
            $request->string('importId')->toString(),
            $request->validated('people'),
            $request->validated('associations'),
        );

        return response()->json(['data' => ['imported' => count($request->validated('people'))]], 201);
    }

    /** @return array<string, mixed> */
    private function snapshot(Group $group): array
    {
        $participantPositions = $group->participants->pluck('position', 'id');

        return [
            'revision' => $group->revision,
            'group' => [
                'id' => $group->id, 'name' => $group->name, 'currency' => $group->currency,
                'ownerAccessIdentityId' => $group->owner_access_identity_id,
                'status' => $group->is_active ? 'active' : 'archived',
                'hasFinancialHistory' => $group->has_financial_history,
            ],
            'participants' => $group->participants->map(fn ($participant): array => [
                'id' => $participant->id, 'groupId' => $participant->group_id, 'name' => $participant->name,
                'status' => $participant->is_active ? 'active' : 'inactive', 'order' => $participant->position,
                ...($participant->person_id ? ['personId' => $participant->person_id] : []),
            ])->values(),
            'expenses' => $group->expenses->sortBy('id')->map(fn ($expense): array => [
                'id' => $expense->id, 'groupId' => $expense->group_id, 'description' => $expense->description,
                'amountMinor' => $expense->amount_minor, 'incurredOn' => $expense->incurred_on->format('Y-m-d'),
                'payerParticipantId' => $expense->payer_participant_id,
                'creatorAccessIdentityId' => $expense->creator_access_identity_id, 'splitMethod' => 'equal',
                'shares' => $expense->shares
                    ->sort(fn ($left, $right): int => [
                        $participantPositions->get($left->participant_id, PHP_INT_MAX), $left->participant_id,
                    ] <=> [
                        $participantPositions->get($right->participant_id, PHP_INT_MAX), $right->participant_id,
                    ])
                    ->map(fn ($share): array => [
                        'participantId' => $share->participant_id, 'amountMinor' => $share->amount_minor,
                    ])->values(),
            ])->values(),
            'settlements' => $group->settlements->sortBy('id')->map(fn ($settlement): array => [
                'id' => $settlement->id, 'groupId' => $settlement->group_id,
                'senderParticipantId' => $settlement->sender_participant_id,
                'receiverParticipantId' => $settlement->receiver_participant_id,
                'amountMinor' => (string) $settlement->amount_minor,
                'occurredOn' => $settlement->occurred_on->format('Y-m-d'),
                'creatorAccessIdentityId' => $settlement->creator_access_identity_id,
            ])->values(),
        ];
    }
}
