<?php

namespace App\Actions;

use App\Exceptions\AccessIdentityAuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ResolveAccessIdentityCredentials
{
    /** @return array{id: string, digest: string} */
    public function handle(Request $request): array
    {
        $identityId = $request->header('X-Access-Identity-ID');
        $credential = $request->bearerToken();

        if (! is_string($identityId)
            || ! Str::isUuid($identityId, 4)
            || ! is_string($credential)
            || preg_match('/^[0-9a-f]{64}$/D', $credential) !== 1) {
            throw new AccessIdentityAuthenticationException;
        }

        return [
            'id' => strtolower($identityId),
            'digest' => hash('sha256', hex2bin($credential)),
        ];
    }
}
