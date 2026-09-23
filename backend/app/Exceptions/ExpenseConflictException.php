<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class ExpenseConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'The expense request conflicts with existing data.'], 409);
    }
}
