<?php

namespace App\Http\Controllers;

use App\Actions\RegisterAccessIdentity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccessIdentityController extends Controller
{
    public function __invoke(Request $request, RegisterAccessIdentity $register): JsonResponse
    {
        $result = $register->handle($request);

        return response()->json(
            ['data' => ['id' => $result['identity']->id]],
            $result['created'] ? 201 : 200,
        );
    }
}
