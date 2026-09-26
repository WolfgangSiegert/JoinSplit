<?php

namespace App\Http\Controllers;

use App\Actions\LinkAccessIdentityToAccount;
use App\Exceptions\AccessIdentityAdoptionException;
use App\Models\AccessIdentity;
use App\Models\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountAccessIdentityController extends Controller
{
    public function create(Request $request): JsonResponse
    {
        abort_unless(array_keys($request->all()) === ['identityId'], 422, 'Invalid identity payload.');
        $data = $request->validate([
            'identityId' => ['required', 'string', 'uuid:4'],
        ]);
        /** @var Account $account */
        $account = $request->user('web');

        $identity = DB::transaction(function () use ($account, $data): AccessIdentity {
            $identity = AccessIdentity::query()->lockForUpdate()->find(strtolower($data['identityId']));
            if ($identity && $identity->account_id !== $account->id) throw new AccessIdentityAdoptionException;

            return $identity ?? $account->accessIdentities()->create([
                'id' => strtolower($data['identityId']), 'credential_digest' => null, 'linked_at' => now(),
            ]);
        });

        return response()->json(['data' => ['id' => $identity->id]], $identity->wasRecentlyCreated ? 201 : 200);
    }

    public function store(Request $request, LinkAccessIdentityToAccount $link): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');
        $identity = $link->handle($request, $account);

        return response()->json(['data' => ['id' => $identity->id]]);
    }
}
