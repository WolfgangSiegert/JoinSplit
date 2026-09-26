<?php

namespace App\Actions;

use App\Exceptions\AccessIdentityAuthenticationException;
use App\Exceptions\PersistenceException;
use App\Models\AccessIdentity;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RegisterAccessIdentity
{
    public function __construct(private ResolveAccessIdentityCredentials $resolveCredentials) {}

    /** @return array{identity: AccessIdentity, created: bool} */
    public function handle(Request $request): array
    {
        ['id' => $identityId, 'digest' => $digest] = $this->resolveCredentials->handle($request);
        $now = now();

        try {
            return DB::transaction(function () use ($identityId, $digest, $now): array {
                $created = DB::table('access_identities')->insertOrIgnore([
                    'id' => $identityId,
                    'credential_digest' => $digest,
                    'last_mutated_at' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]) === 1;
                $identity = AccessIdentity::query()->lockForUpdate()->findOrFail($identityId);

                if ($identity->account_id !== null
                    || ! is_string($identity->credential_digest)
                    || ! hash_equals($identity->credential_digest, $digest)) {
                    throw new AccessIdentityAuthenticationException;
                }

                return ['identity' => $identity, 'created' => $created];
            });
        } catch (QueryException $exception) {
            throw new PersistenceException(previous: $exception);
        }
    }
}
