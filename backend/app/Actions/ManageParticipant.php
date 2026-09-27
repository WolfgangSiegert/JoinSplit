<?php

namespace App\Actions;

use App\Exceptions\ParticipantConflictException;
use App\Exceptions\GroupLifecycleConflictException;
use App\Models\AccessIdentity;
use App\Models\Group;
use App\Models\Participant;
use App\Models\Person;
use App\Support\ParticipantDeletionEligibility;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ManageParticipant
{
    public function __construct(private ParticipantDeletionEligibility $deletionEligibility) {}

    /** @return array{participant: Participant, created: bool} */
    public function add(AccessIdentity $actor, string $groupId, array $data): array
    {
        try {
            return DB::transaction(function () use ($actor, $groupId, $data) {
                $group = $this->ownedActiveGroup($actor, $groupId, true);
                if (strtolower($data['participantId']) === strtolower($group->id)) throw new ParticipantConflictException;
                $existing = Participant::query()->find($data['participantId']);
                if ($existing) {
                    if ($existing->group_id !== $group->id || $existing->name !== $data['name']
                        || $existing->position !== $data['order'] || ! $existing->is_active
                        || $existing->person_id !== ($data['personId'] ?? null)) throw new ParticipantConflictException;
                    return ['participant' => $existing, 'created' => false];
                }
                $personId = $data['personId'] ?? null;
                if ($personId !== null) {
                    $person = $actor->account_id
                        ? Person::query()->whereKey($personId)->where('account_id', $actor->account_id)->lockForUpdate()->first()
                        : null;
                    if (! $person || ! $person->is_active) throw new ParticipantConflictException;
                }
                $nextOrder = ((int) $group->participants()->max('position')) + ($group->participants()->exists() ? 1 : 0);
                if ($data['order'] !== $nextOrder) throw new ParticipantConflictException;
                $participant = $group->participants()->create([
                    'id' => $data['participantId'], 'person_id' => $personId,
                    'name' => $data['name'], 'is_active' => true, 'position' => $data['order'],
                ]);
                return ['participant' => $participant, 'created' => true];
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') throw new ParticipantConflictException(previous: $exception);
            throw $exception;
        }
    }

    public function update(AccessIdentity $actor, string $groupId, string $participantId, array $data): Participant
    {
        try {
            return DB::transaction(function () use ($actor, $groupId, $participantId, $data) {
                $group = $this->ownedActiveGroup($actor, $groupId, true);
                $participant = $group->participants()->whereKey($participantId)->lockForUpdate()->firstOrFail();
                if (array_key_exists('name', $data)) $participant->name = $data['name'];
                if (array_key_exists('active', $data)) {
                    if ($data['active'] !== false) throw new ParticipantConflictException;
                    $participant->is_active = false;
                }
                if (array_key_exists('personId', $data)) {
                    if (! $actor->account_id) throw new ParticipantConflictException;
                    $personId = $data['personId'];
                    if ($personId !== null) {
                        $person = Person::query()->whereKey($personId)->where('account_id', $actor->account_id)->lockForUpdate()->first();
                        if (! $person || ! $person->is_active) throw new ParticipantConflictException;
                    }
                    $participant->person_id = $personId;
                }
                $participant->save();
                return $participant;
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') throw new ParticipantConflictException(previous: $exception);
            throw $exception;
        }
    }

    public function delete(AccessIdentity $actor, string $groupId, string $participantId): void
    {
        DB::transaction(function () use ($actor, $groupId, $participantId) {
            $group = $this->ownedActiveGroup($actor, $groupId, true);
            $participant = $group->participants()->whereKey($participantId)->lockForUpdate()->first();
            if (! $participant) return;
            if (! $this->deletionEligibility->allows($participant)) throw new ParticipantConflictException;
            $participant->delete();
        });
    }

    private function ownedActiveGroup(AccessIdentity $actor, string $groupId, bool $lock): Group
    {
        $query = Group::query()->whereKey($groupId)->where('owner_access_identity_id', $actor->id);
        if ($lock) $query->lockForUpdate();
        $group = $query->first();
        if (! $group) throw new NotFoundHttpException;
        if (! $group->is_active) throw new GroupLifecycleConflictException;
        return $group;
    }
}
