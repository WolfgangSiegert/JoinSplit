<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class GroupLifecycleConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'The group lifecycle request conflicts with existing data.'], 409);
    }
}
