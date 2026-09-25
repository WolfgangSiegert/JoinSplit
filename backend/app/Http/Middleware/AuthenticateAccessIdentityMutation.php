<?php

namespace App\Http\Middleware;

use App\Actions\VerifyAccessIdentity;
use App\Models\AccessIdentity;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateAccessIdentityMutation
{
    public function __construct(private VerifyAccessIdentity $verifyAccessIdentity) {}

    public function handle(Request $request, Closure $next): Response
    {
        return DB::transaction(function () use ($request, $next): Response {
            $identity = $this->verifyAccessIdentity->handle($request);
            $request->attributes->set(AccessIdentity::class, $identity);
            $response = $next($request);

            if ($response->isSuccessful()) {
                $identity->forceFill(['last_mutated_at' => now()])->save();
            }

            return $response;
        });
    }
}
