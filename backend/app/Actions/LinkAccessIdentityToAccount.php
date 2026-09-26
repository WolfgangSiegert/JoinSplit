<?php

namespace App\Actions;

use App\Exceptions\AccessIdentityAdoptionException;
use App\Models\AccessIdentity;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LinkAccessIdentityToAccount
{
    public function __construct(private ResolveAccessIdentityCredentials $resolveCredentials) {}

    public function handle(Request $request, Account $account): AccessIdentity
    {
        ['id' => $identityId, 'digest' => $digest] = $this->resolveCredentials->handle($request);

        return DB::transaction(function () use ($identityId, $digest, $account): AccessIdentity {
            $identity = AccessIdentity::query()->lockForUpdate()->find($identityId);

            if (! $identity) {
                throw new AccessIdentityAdoptionException;
            }

            if ($identity->account_id !== null) {
                if ($identity->account_id === $account->id) {
                    return $identity;
                }

                throw new AccessIdentityAdoptionException;
            }

            if (! is_string($identity->credential_digest)
                || ! hash_equals($identity->credential_digest, $digest)) {
                throw new AccessIdentityAdoptionException;
            }

            $identity->forceFill([
                'account_id' => $account->id,
                'credential_digest' => null,
                'linked_at' => now(),
            ])->save();

            return $identity->refresh();
        });
    }
}
