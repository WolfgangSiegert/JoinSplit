<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class AccessIdentityAdoptionException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'Access identity adoption failed.'], 409);
    }
}
