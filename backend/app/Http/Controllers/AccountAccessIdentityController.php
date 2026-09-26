<?php

namespace App\Http\Controllers;

use App\Actions\LinkAccessIdentityToAccount;
use App\Models\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountAccessIdentityController extends Controller
{
    public function store(Request $request, LinkAccessIdentityToAccount $link): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');
        $identity = $link->handle($request, $account);

        return response()->json(['data' => ['id' => $identity->id]]);
    }
}
