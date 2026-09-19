<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class CreateGroupConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'The create group request conflicts with existing data.'], 409);
    }
}
