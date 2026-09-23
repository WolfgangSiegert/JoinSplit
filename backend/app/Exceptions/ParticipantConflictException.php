<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class ParticipantConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'The participant request conflicts with existing data.'], 409);
    }
}
