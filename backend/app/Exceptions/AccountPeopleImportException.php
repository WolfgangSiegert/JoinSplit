<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class AccountPeopleImportException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => 'People adoption failed.'], 409);
    }
}
