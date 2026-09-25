<?php

namespace App\Http\Controllers;

use App\Support\ReadinessCheck;
use Illuminate\Http\JsonResponse;

class ReadinessController extends Controller
{
    public function __invoke(ReadinessCheck $readiness): JsonResponse
    {
        $ready = $readiness->passes();

        return response()->json(['status' => $ready ? 'ready' : 'unavailable'], $ready ? 200 : 503);
    }
}
