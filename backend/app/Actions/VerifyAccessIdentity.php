<?php

namespace App\Actions;

use App\Exceptions\AccessIdentityAuthenticationException;
use App\Exceptions\AccessIdentityUnavailableException;
use App\Models\AccessIdentity;
use Illuminate\Http\Request;

class VerifyAccessIdentity
{
    public function __construct(private ResolveAccessIdentityCredentials $resolveCredentials) {}

    public function handle(Request $request): AccessIdentity
    {
        $resolved = $request->attributes->get(AccessIdentity::class);
        if ($resolved instanceof AccessIdentity) {
            return $resolved;
        }

        ['id' => $identityId, 'digest' => $digest] = $this->resolveCredentials->handle($request);
        $identity = AccessIdentity::query()->lockForUpdate()->find($identityId);
        if (! $identity) {
            throw new AccessIdentityUnavailableException;
        }

        if ($identity->account_id !== null
            || ! is_string($identity->credential_digest)
            || ! hash_equals($identity->credential_digest, $digest)) {
            throw new AccessIdentityAuthenticationException;
        }

        return $identity;
    }
}
