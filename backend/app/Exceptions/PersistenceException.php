<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class PersistenceException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'The request could not be persisted.'], 500);
    }
}
