<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveAccountPersonRequest;
use App\Models\Account;
use App\Models\Group;
use App\Models\Participant;
use App\Models\Person;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AccountPersonController extends Controller
{
    public function store(SaveAccountPersonRequest $request): JsonResponse
    {
        $data = $request->validated('person');

        return $this->mutate($request, $data['id'], true, function (Account $account, int $revision) use ($data): JsonResponse {
            $person = Person::query()->create([
                'id' => $data['id'], 'account_id' => $account->id, 'name' => $data['name'],
                'is_active' => $data['status'] === 'active', 'revision' => $revision,
            ]);

            return response()->json(['data' => ['person' => $this->personData($person)]], 201);
        });
    }

    public function update(SaveAccountPersonRequest $request, string $person): JsonResponse
    {
        $data = $request->validated('person');
        abort_unless(strtolower($data['id']) === strtolower($person), 422, 'Person identifier mismatch.');

        return $this->mutate($request, $person, false, function (Account $_account, int $revision, Person $current) use ($data): JsonResponse {
            $current->forceFill([
                'name' => $data['name'], 'is_active' => $data['status'] === 'active', 'revision' => $revision,
            ])->save();

            return response()->json(['data' => ['person' => $this->personData($current)]]);
        });
    }

    public function destroy(Request $request, string $person): Response
    {
        return $this->mutate($request, $person, false, function (Account $_account, int $_revision, Person $current): Response {
            if ($current->participants()->exists()) {
                return response()->json(['message' => 'Referenced Person cannot be deleted.'], 409);
            }
            $current->delete();

            return response()->noContent();
        });
    }

    private function mutate(Request $request, string $personId, bool $creating, callable $operation): Response
    {
        /** @var Account $account */
        $account = $request->user('web');
        $mutationId = strtolower((string) $request->header('X-Mutation-ID'));
        $base = (string) $request->header('X-Person-Revision');
        if (! Str::isUuid($mutationId, 4) || ! Str::isUuid($personId, 4)
            || preg_match('/^(0|[1-9][0-9]*)$/D', $base) !== 1 || strlen($base) > 16) {
            return response()->json(['message' => 'Person mutation contract is invalid.'], 422);
        }
        $baseRevision = (int) $base;
        if ($creating && $baseRevision !== 0) return response()->json(['message' => 'New Person revision must start at zero.'], 409);
        $requestDigest = hash('sha256', $request->method().'\n'.json_encode($request->json()->all(), JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($account, $mutationId, $baseRevision, $personId, $creating, $operation, $requestDigest): Response {
            $replay = DB::table('account_person_mutations')->where('id', $mutationId)->lockForUpdate()->first();
            if ($replay) {
                if ($replay->account_id !== $account->id || $replay->person_id !== strtolower($personId)
                    || $replay->base_revision !== $baseRevision || ! hash_equals($replay->request_digest, $requestDigest)) {
                    return response()->json(['message' => 'Person mutation replay conflict.'], 409);
                }
                $response = new JsonResponse(
                    $replay->response_body ? json_decode($replay->response_body, true, flags: JSON_THROW_ON_ERROR) : null,
                    $replay->response_status,
                );
                $response->headers->set('X-Person-Revision', (string) $replay->resulting_revision);

                return $response;
            }

            $storedPerson = Person::query()->whereKey($personId)->lockForUpdate()->first();
            $person = $storedPerson?->account_id === $account->id ? $storedPerson : null;
            $identifierCollision = $creating && (Group::query()->whereKey($personId)->lockForUpdate()->exists()
                || Participant::query()->whereKey($personId)->lockForUpdate()->exists());
            if (($creating && ($storedPerson || $identifierCollision)) || (! $creating && ! $person)) {
                return response()->json(['message' => $creating ? 'Person already exists.' : 'Person not found.'], $creating ? 409 : 404);
            }
            if ($person && $person->revision !== $baseRevision) {
                return response()->json(['message' => 'Person revision conflict.', 'serverRevision' => $person->revision], 409);
            }

            $resultingRevision = $baseRevision + 1;
            $response = $operation($account, $resultingRevision, $person);
            if (! $response->isSuccessful()) return $response;
            $content = $response->getContent();
            DB::table('account_person_mutations')->insert([
                'id' => $mutationId, 'account_id' => $account->id, 'person_id' => strtolower($personId),
                'base_revision' => $baseRevision, 'resulting_revision' => $resultingRevision,
                'request_digest' => $requestDigest,
                'response_status' => $response->getStatusCode(), 'response_body' => $content !== '' ? $content : null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $response->headers->set('X-Person-Revision', (string) $resultingRevision);

            return $response;
        });
    }

    /** @return array{id: string, name: string, status: string, revision: int} */
    private function personData(Person $person): array
    {
        return [
            'id' => $person->id, 'name' => $person->name,
            'status' => $person->is_active ? 'active' : 'inactive', 'revision' => $person->revision,
        ];
    }
}
