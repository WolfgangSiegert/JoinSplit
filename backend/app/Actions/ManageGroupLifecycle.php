<?php

namespace App\Actions;

use App\Exceptions\GroupLifecycleConflictException;
use App\Exceptions\PersistenceException;
use App\Models\AccessIdentity;
use App\Models\Group;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ManageGroupLifecycle
{
    public function update(AccessIdentity $actor, string $groupId, string $status): Group
    {
        try {
            return DB::transaction(function () use ($actor, $groupId, $status): Group {
                $group = $this->ownedGroup($actor, $groupId);
                $group->is_active = $status === 'active';
                $group->save();

                return $group;
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        }
    }

    public function delete(AccessIdentity $actor, string $groupId): void
    {
        try {
            DB::transaction(function () use ($actor, $groupId): void {
                $group = $this->ownedGroup($actor, $groupId);

                if (! $group->is_active || $group->has_financial_history) {
                    throw new GroupLifecycleConflictException;
                }

                $group->delete();
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        }
    }

    private function ownedGroup(AccessIdentity $actor, string $groupId): Group
    {
        $group = Group::query()
            ->whereKey($groupId)
            ->where('owner_access_identity_id', $actor->id)
            ->lockForUpdate()
            ->first();

        if (! $group) {
            throw new NotFoundHttpException;
        }

        return $group;
    }
}
