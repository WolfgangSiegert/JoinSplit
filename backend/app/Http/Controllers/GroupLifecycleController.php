<?php

namespace App\Http\Controllers;

use App\Actions\ManageGroupLifecycle;
use App\Actions\VerifyAccessIdentity;
use App\Http\Requests\UpdateGroupLifecycleRequest;
use App\Http\Resources\GroupLifecycleResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class GroupLifecycleController extends Controller
{
    public function update(
        UpdateGroupLifecycleRequest $request,
        string $group,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageGroupLifecycle $manageGroupLifecycle,
    ): JsonResponse {
        $updated = $manageGroupLifecycle->update(
            $verifyAccessIdentity->handle($request),
            $group,
            $request->validated('status'),
        );

        return (new GroupLifecycleResource($updated))->response();
    }

    public function destroy(
        Request $request,
        string $group,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageGroupLifecycle $manageGroupLifecycle,
    ): Response {
        $manageGroupLifecycle->delete($verifyAccessIdentity->handle($request), $group);

        return response()->noContent();
    }
}
