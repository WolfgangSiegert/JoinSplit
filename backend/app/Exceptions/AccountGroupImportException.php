<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class AccountGroupImportException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'Group adoption failed.'], 409);
    }
}
