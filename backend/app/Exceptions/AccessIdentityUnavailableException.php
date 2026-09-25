<?php

namespace App\Exceptions;

use RuntimeException;

class AccessIdentityUnavailableException extends RuntimeException
{
    public function render()
    {
        return response()->json(['message' => 'Access identity is no longer available.'], 410);
    }
}
