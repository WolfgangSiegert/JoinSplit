<?php

namespace App\Actions;

use App\Models\AccessIdentity;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class PruneExpiredAccessIdentities
{
    /** @return array{identities: int, groups: int} */
    public function handle(?CarbonInterface $cutoff = null): array
    {
        $cutoff ??= now()->subDays(30);
        $candidateIds = AccessIdentity::query()
            ->where(function ($query) use ($cutoff): void {
                $query->where('last_mutated_at', '<=', $cutoff)
                    ->orWhere(function ($query) use ($cutoff): void {
                        $query->whereNull('last_mutated_at')
                            ->where('created_at', '<=', $cutoff);
                    });
            })
            ->orderBy('id')
            ->pluck('id');

        $deletedIdentities = 0;
        $deletedGroups = 0;

        foreach ($candidateIds as $identityId) {
            $result = DB::transaction(function () use ($identityId, $cutoff): array {
                $identity = AccessIdentity::query()->lockForUpdate()->find($identityId);
                if (! $identity || ! $this->isExpired($identity, $cutoff)) {
                    return ['identities' => 0, 'groups' => 0];
                }

                $groupIds = $identity->groups()->pluck('id');
                $groupCount = $groupIds->count();
                $expenseIds = DB::table('expenses')->whereIn('group_id', $groupIds)->pluck('id');

                DB::table('expense_shares')->whereIn('expense_id', $expenseIds)->delete();
                DB::table('settlements')->whereIn('group_id', $groupIds)->delete();
                DB::table('expenses')->whereIn('group_id', $groupIds)->delete();
                DB::table('participants')->whereIn('group_id', $groupIds)->delete();
                DB::table('groups')->whereIn('id', $groupIds)->delete();
                $identity->delete();

                return ['identities' => 1, 'groups' => $groupCount];
            });

            $deletedIdentities += $result['identities'];
            $deletedGroups += $result['groups'];
        }

        return ['identities' => $deletedIdentities, 'groups' => $deletedGroups];
    }

    private function isExpired(AccessIdentity $identity, CarbonInterface $cutoff): bool
    {
        $activity = $identity->last_mutated_at ?? $identity->created_at;

        return $activity !== null && $activity->lessThanOrEqualTo($cutoff);
    }
}
