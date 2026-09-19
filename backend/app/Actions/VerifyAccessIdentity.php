<?php

namespace App\Actions;

use App\Exceptions\AccessIdentityAuthenticationException;
use App\Exceptions\PersistenceException;
use App\Models\AccessIdentity;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VerifyAccessIdentity
{
    public function handle(Request $request): AccessIdentity
    {
        $identityId = $request->header('X-Access-Identity-ID');
        $credential = $request->bearerToken();

        if (! is_string($identityId)
            || ! Str::isUuid($identityId, 4)
            || ! is_string($credential)
            || preg_match('/^[0-9a-f]{64}$/D', $credential) !== 1) {
            throw new AccessIdentityAuthenticationException;
        }

        $digest = hash('sha256', hex2bin($credential));
        $now = now();

        try {
            DB::table('access_identities')->insertOrIgnore([
                'id' => $identityId,
                'credential_digest' => $digest,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $identity = AccessIdentity::query()->find($identityId);
        } catch (QueryException) {
            throw new PersistenceException;
        }

        if (! $identity || ! hash_equals($identity->credential_digest, $digest)) {
            throw new AccessIdentityAuthenticationException;
        }

        return $identity;
    }
}
