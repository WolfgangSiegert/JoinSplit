<?php

namespace App\Http\Controllers;

use App\Actions\ManageSettlement;
use App\Actions\VerifyAccessIdentity;
use App\Http\Requests\CreateSettlementRequest;
use App\Http\Requests\UpdateSettlementRequest;
use App\Http\Resources\SettlementResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class SettlementController extends Controller
{
    public function store(
        CreateSettlementRequest $request,
        string $group,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageSettlement $manageSettlement,
    ): JsonResponse {
        $result = $manageSettlement->create(
            $verifyAccessIdentity->handle($request),
            $group,
            $request->validated(),
        );

        return (new SettlementResource($result['settlement']))
            ->response()
            ->setStatusCode($result['created'] ? 201 : 200);
    }

    public function update(
        UpdateSettlementRequest $request,
        string $group,
        string $settlement,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageSettlement $manageSettlement,
    ): JsonResponse {
        $updated = $manageSettlement->update(
            $verifyAccessIdentity->handle($request),
            $group,
            $settlement,
            $request->validated(),
        );

        return (new SettlementResource($updated))->response();
    }

    public function destroy(
        Request $request,
        string $group,
        string $settlement,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageSettlement $manageSettlement,
    ): Response {
        $manageSettlement->delete($verifyAccessIdentity->handle($request), $group, $settlement);

        return response()->noContent();
    }
}
