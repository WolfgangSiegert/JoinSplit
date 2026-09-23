<?php

namespace App\Http\Controllers;

use App\Actions\ManageParticipant;
use App\Actions\VerifyAccessIdentity;
use App\Http\Requests\AddParticipantRequest;
use App\Http\Requests\UpdateParticipantRequest;
use App\Http\Resources\ParticipantResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ParticipantController extends Controller
{
    public function store(
        AddParticipantRequest $request,
        string $group,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageParticipant $manageParticipant,
    ): JsonResponse {
        $result = $manageParticipant->add($verifyAccessIdentity->handle($request), $group, $request->validated());
        return (new ParticipantResource($result['participant']))->response()->setStatusCode($result['created'] ? 201 : 200);
    }

    public function update(
        UpdateParticipantRequest $request,
        string $group,
        string $participant,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageParticipant $manageParticipant,
    ): JsonResponse {
        $updated = $manageParticipant->update($verifyAccessIdentity->handle($request), $group, $participant, $request->validated());
        return (new ParticipantResource($updated))->response();
    }

    public function destroy(
        Request $request,
        string $group,
        string $participant,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageParticipant $manageParticipant,
    ): Response {
        $manageParticipant->delete($verifyAccessIdentity->handle($request), $group, $participant);
        return response()->noContent();
    }
}
