<?php

namespace App\Actions;

use App\Exceptions\AccountGroupImportException;
use App\Models\AccessIdentity;
use App\Models\Account;
use App\Models\Group;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ImportAccountGroup
{
    /** @param array<string, mixed> $snapshot */
    public function handle(Account $account, string $adoptionId, string $importId, array $snapshot): Group
    {
        $canonical = $this->canonicalSnapshot($snapshot);
        $digest = hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));
        $groupData = $canonical['group'];

        try {
            return DB::transaction(function () use ($account, $adoptionId, $importId, $canonical, $digest, $groupData): Group {
                $previous = DB::table('account_group_imports')->where('id', $importId)->lockForUpdate()->first();
                if ($previous) {
                    if ($previous->account_id === $account->id
                        && $previous->adoption_id === $adoptionId
                        && $previous->group_id === $groupData['id']
                        && hash_equals($previous->snapshot_digest, $digest)) {
                        return Group::query()->findOrFail($groupData['id']);
                    }

                    throw new AccountGroupImportException;
                }

                if (Group::query()->whereKey($groupData['id'])->lockForUpdate()->exists()) {
                    throw new AccountGroupImportException;
                }

                $identity = AccessIdentity::query()->whereKey($groupData['ownerAccessIdentityId'])->lockForUpdate()->first();
                if ($identity && $identity->account_id !== $account->id) {
                    throw new AccountGroupImportException;
                }
                if (! $identity) {
                    $identity = AccessIdentity::query()->create([
                        'id' => $groupData['ownerAccessIdentityId'],
                        'credential_digest' => null,
                        'account_id' => $account->id,
                        'linked_at' => now(),
                    ]);
                }

                $now = now();
                DB::table('groups')->insert([
                    'id' => $groupData['id'],
                    'owner_access_identity_id' => $identity->id,
                    'name' => $groupData['name'],
                    'currency' => 'EUR',
                    'is_active' => $groupData['status'] === 'active',
                    'has_financial_history' => $groupData['hasFinancialHistory'],
                    'revision' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                foreach ($canonical['participants'] as $participant) {
                    DB::table('participants')->insert([
                        'id' => $participant['id'], 'group_id' => $groupData['id'],
                        'name' => $participant['name'], 'is_active' => $participant['status'] === 'active',
                        'position' => $participant['order'], 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
                foreach ($canonical['expenses'] as $expense) {
                    DB::table('expenses')->insert([
                        'id' => $expense['id'], 'group_id' => $groupData['id'],
                        'description' => $expense['description'], 'amount_minor' => $expense['amountMinor'],
                        'incurred_on' => $expense['incurredOn'], 'payer_participant_id' => $expense['payerParticipantId'],
                        'creator_access_identity_id' => $identity->id, 'split_method' => 'equal',
                        'created_at' => $now, 'updated_at' => $now,
                    ]);
                    foreach ($expense['shares'] as $share) {
                        DB::table('expense_shares')->insert([
                            'expense_id' => $expense['id'], 'participant_id' => $share['participantId'],
                            'amount_minor' => $share['amountMinor'], 'created_at' => $now, 'updated_at' => $now,
                        ]);
                    }
                }
                foreach ($canonical['settlements'] as $settlement) {
                    DB::table('settlements')->insert([
                        'id' => $settlement['id'], 'group_id' => $groupData['id'],
                        'sender_participant_id' => $settlement['senderParticipantId'],
                        'receiver_participant_id' => $settlement['receiverParticipantId'],
                        'amount_minor' => $settlement['amountMinor'], 'occurred_on' => $settlement['occurredOn'],
                        'creator_access_identity_id' => $identity->id, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }

                DB::table('account_group_imports')->insert([
                    'id' => $importId, 'adoption_id' => $adoptionId, 'account_id' => $account->id,
                    'group_id' => $groupData['id'], 'snapshot_digest' => $digest,
                    'created_at' => $now, 'updated_at' => $now,
                ]);

                return Group::query()->findOrFail($groupData['id']);
            });
        } catch (QueryException $exception) {
            throw new AccountGroupImportException(previous: $exception);
        }
    }

    /** @param array<string, mixed> $snapshot @return array<string, mixed> */
    private function canonicalSnapshot(array $snapshot): array
    {
        $snapshot['participants'] = collect($snapshot['participants'])
            ->sort(fn (array $left, array $right): int => [$left['order'], $left['id']] <=> [$right['order'], $right['id']])
            ->values()->all();
        $snapshot['expenses'] = collect($snapshot['expenses'])->map(function (array $expense): array {
            $expense['shares'] = collect($expense['shares'])->sortBy('participantId')->values()->all();

            return $expense;
        })->sortBy('id')->values()->all();
        $snapshot['settlements'] = collect($snapshot['settlements'])->sortBy('id')->values()->all();

        return $snapshot;
    }
}
