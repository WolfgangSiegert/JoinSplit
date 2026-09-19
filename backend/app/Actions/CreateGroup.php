<?php

namespace App\Actions;

use App\Exceptions\CreateGroupConflictException;
use App\Exceptions\PersistenceException;
use App\Models\AccessIdentity;
use App\Models\Group;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class CreateGroup
{
    /** @return array{group: Group, created: bool} */
    public function handle(AccessIdentity $actor, array $data): array
    {
        if (strtolower($data['actorId']) !== strtolower($actor->id)) {
            throw new CreateGroupConflictException;
        }

        try {
            return DB::transaction(function () use ($actor, $data) {
                $now = now();
                $created = DB::table('groups')->insertOrIgnore([
                    'id' => $data['groupId'],
                    'owner_access_identity_id' => $actor->id,
                    'name' => $data['name'],
                    'currency' => $data['currency'],
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]) === 1;

                $group = Group::query()
                    ->with('participants')
                    ->findOrFail($data['groupId']);

                if (! $created) {
                    $this->assertEquivalent($group, $actor, $data);

                    return ['group' => $group, 'created' => false];
                }

                if ($data['initialParticipant'] !== null) {
                    $group->participants()->create([
                        'id' => $data['initialParticipant']['participantId'],
                        'name' => $data['initialParticipant']['name'],
                        'is_active' => true,
                        'position' => 0,
                    ]);
                }

                return [
                    'group' => $group->load('participants'),
                    'created' => true,
                ];
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') {
                throw new CreateGroupConflictException(previous: $exception);
            }

            throw new PersistenceException;
        }
    }

    private function assertEquivalent(Group $group, AccessIdentity $actor, array $data): void
    {
        $participant = $data['initialParticipant'];
        $storedParticipant = $group->participants->first();

        $groupMatches = $group->owner_access_identity_id === $actor->id
            && $group->name === $data['name']
            && $group->currency === $data['currency']
            && $group->is_active;
        $participantMatches = $participant === null
            ? $group->participants->isEmpty()
            : $group->participants->count() === 1
                && $storedParticipant->id === $participant['participantId']
                && $storedParticipant->name === $participant['name']
                && $storedParticipant->is_active
                && $storedParticipant->position === 0;

        if (! $groupMatches || ! $participantMatches) {
            throw new CreateGroupConflictException;
        }
    }
}
