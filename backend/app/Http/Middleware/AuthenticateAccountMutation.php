<?php

namespace App\Http\Middleware;

use App\Models\AccessIdentity;
use App\Models\Account;
use App\Models\Group;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateAccountMutation
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Account|null $account */
        $account = $request->user('web');
        if (! $account) return response()->json(['message' => 'Unauthenticated.'], 401);

        $mutationId = strtolower((string) $request->header('X-Mutation-ID'));
        $baseRevision = $request->header('X-Group-Revision');
        if (! Str::isUuid($mutationId, 4) || ! is_string($baseRevision)
            || preg_match('/^(0|[1-9][0-9]*)$/D', $baseRevision) !== 1
            || strlen($baseRevision) > 16
            || (strlen($baseRevision) === 16 && strcmp($baseRevision, '9007199254740990') > 0)) {
            return response()->json(['message' => 'Mutation revision contract is invalid.'], 422);
        }
        $baseRevision = (int) $baseRevision;
        if (! is_string($request->route('group')) && $baseRevision !== 0) {
            return response()->json(['message' => 'New Group revision must start at zero.'], 409);
        }

        return DB::transaction(function () use ($request, $next, $account, $mutationId, $baseRevision): Response {
            $replay = DB::table('account_mutations')->where('id', $mutationId)->lockForUpdate()->first();
            if ($replay) {
                $requestedGroup = $request->route('group');
                if ($replay->account_id !== $account->id || $replay->base_revision !== $baseRevision) {
                    return response()->json(['message' => 'Mutation replay conflict.'], 409);
                }
                if (is_string($requestedGroup) && $replay->group_id !== strtolower($requestedGroup)) {
                    return response()->json(['message' => 'Mutation replay conflict.'], 409);
                }

                $response = new JsonResponse(
                    $replay->response_body ? json_decode($replay->response_body, true, flags: JSON_THROW_ON_ERROR) : null,
                    $replay->response_status,
                );
                $response->headers->set('X-Group-Revision', (string) $replay->resulting_revision);

                return $response;
            }

            $routeGroupId = $request->route('group');
            $group = is_string($routeGroupId)
                ? Group::query()->whereKey($routeGroupId)
                    ->whereHas('owner', fn ($query) => $query->where('account_id', $account->id))
                    ->lockForUpdate()->first()
                : null;

            if (is_string($routeGroupId) && ! $group) return response()->json(['message' => 'Group not found.'], 404);
            if ($group && $group->revision !== $baseRevision) {
                return response()->json([
                    'message' => 'Group revision conflict.',
                    'serverRevision' => $group->revision,
                ], 409);
            }

            $identity = $group?->owner;
            if (! $identity) {
                $identityId = strtolower((string) $request->header('X-Access-Identity-ID'));
                $identity = AccessIdentity::query()->whereKey($identityId)
                    ->where('account_id', $account->id)->lockForUpdate()->first();
            }
            if (! $identity) return response()->json(['message' => 'Account identity authorization failed.'], 403);
            $request->attributes->set(AccessIdentity::class, $identity);

            $response = $next($request);
            if (! $response->isSuccessful()) return $response;

            $groupId = is_string($routeGroupId) ? $routeGroupId : $this->createdGroupId($response);
            if (! is_string($groupId)) return response()->json(['message' => 'Mutation result is incomplete.'], 500);
            $resultingRevision = $baseRevision + 1;
            Group::query()->whereKey($groupId)->update(['revision' => $resultingRevision]);

            $content = $response->getContent();
            DB::table('account_mutations')->insert([
                'id' => $mutationId, 'account_id' => $account->id, 'group_id' => $groupId,
                'base_revision' => $baseRevision, 'resulting_revision' => $resultingRevision,
                'response_status' => $response->getStatusCode(),
                'response_body' => $content !== '' ? $content : null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $response->headers->set('X-Group-Revision', (string) $resultingRevision);

            return $response;
        });
    }

    private function createdGroupId(Response $response): ?string
    {
        $body = json_decode($response->getContent(), true);

        return is_array($body) && is_string($body['data']['group']['id'] ?? null)
            ? $body['data']['group']['id'] : null;
    }
}
