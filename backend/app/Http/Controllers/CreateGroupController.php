<?php

namespace App\Http\Controllers;

use App\Actions\CreateGroup;
use App\Actions\VerifyAccessIdentity;
use App\Http\Requests\CreateGroupRequest;
use App\Http\Resources\GroupResource;
use Illuminate\Http\JsonResponse;

class CreateGroupController extends Controller
{
    public function __invoke(
        CreateGroupRequest $request,
        VerifyAccessIdentity $verifyAccessIdentity,
        CreateGroup $createGroup,
    ): JsonResponse {
        $actor = $verifyAccessIdentity->handle($request);
        $result = $createGroup->handle($actor, $request->validated());

        return (new GroupResource($result['group']))
            ->response()
            ->setStatusCode($result['created'] ? 201 : 200);
    }
}
