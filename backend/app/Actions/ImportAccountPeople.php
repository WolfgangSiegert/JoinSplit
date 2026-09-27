<?php

namespace App\Actions;

use App\Exceptions\AccountPeopleImportException;
use App\Models\Account;
use App\Models\Group;
use App\Models\Participant;
use App\Models\Person;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ImportAccountPeople
{
    /**
     * @param array<int, array{id: string, name: string, status: string}> $people
     * @param array<int, array{participantId: string, personId: string}> $associations
     */
    public function handle(Account $account, string $adoptionId, string $importId, array $people, array $associations): void
    {
        $canonical = [
            'people' => collect($people)->sortBy('id')->values()->all(),
            'associations' => collect($associations)->sortBy('participantId')->values()->all(),
        ];
        $digest = hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));

        try {
            DB::transaction(function () use ($account, $adoptionId, $importId, $canonical, $digest): void {
                $previous = DB::table('account_people_imports')->where('id', $importId)->lockForUpdate()->first();
                if ($previous) {
                    if ($previous->account_id === $account->id
                        && $previous->adoption_id === $adoptionId
                        && hash_equals($previous->snapshot_digest, $digest)) {
                        return;
                    }

                    throw new AccountPeopleImportException;
                }

                $personIds = collect($canonical['people'])->pluck('id');
                if (Group::query()->whereKey($personIds)->lockForUpdate()->exists()
                    || Person::query()->whereKey($personIds)->lockForUpdate()->exists()
                    || Participant::query()->whereKey($personIds)->lockForUpdate()->exists()) {
                    throw new AccountPeopleImportException;
                }

                $now = now();
                foreach ($canonical['people'] as $person) {
                    DB::table('people')->insert([
                        'id' => $person['id'], 'account_id' => $account->id,
                        'name' => $person['name'], 'is_active' => $person['status'] === 'active',
                        'revision' => 1, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }

                foreach ($canonical['associations'] as $association) {
                    $participant = Participant::query()
                        ->whereKey($association['participantId'])
                        ->whereHas('group.owner', fn ($query) => $query->where('account_id', $account->id))
                        ->lockForUpdate()->first();
                    $person = Person::query()->whereKey($association['personId'])
                        ->where('account_id', $account->id)->lockForUpdate()->first();
                    if (! $participant || ! $person || $participant->person_id !== null) {
                        throw new AccountPeopleImportException;
                    }
                    $participant->person_id = $person->id;
                    $participant->save();
                }

                DB::table('account_people_imports')->insert([
                    'id' => $importId, 'adoption_id' => $adoptionId, 'account_id' => $account->id,
                    'snapshot_digest' => $digest, 'created_at' => $now, 'updated_at' => $now,
                ]);
            });
        } catch (QueryException $exception) {
            throw new AccountPeopleImportException(previous: $exception);
        }
    }
}
