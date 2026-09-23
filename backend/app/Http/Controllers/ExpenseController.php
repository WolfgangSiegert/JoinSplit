<?php

namespace App\Http\Controllers;

use App\Actions\ManageExpense;
use App\Actions\VerifyAccessIdentity;
use App\Http\Requests\CreateExpenseRequest;
use App\Http\Requests\UpdateExpenseRequest;
use App\Http\Resources\ExpenseResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ExpenseController extends Controller
{
    public function store(
        CreateExpenseRequest $request,
        string $group,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageExpense $manageExpense,
    ): JsonResponse {
        $result = $manageExpense->create(
            $verifyAccessIdentity->handle($request),
            $group,
            $request->validated(),
        );

        return (new ExpenseResource($result['expense']))
            ->response()
            ->setStatusCode($result['created'] ? 201 : 200);
    }

    public function update(
        UpdateExpenseRequest $request,
        string $group,
        string $expense,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageExpense $manageExpense,
    ): JsonResponse {
        $updated = $manageExpense->update(
            $verifyAccessIdentity->handle($request),
            $group,
            $expense,
            $request->validated(),
        );

        return (new ExpenseResource($updated))->response();
    }

    public function destroy(
        Request $request,
        string $group,
        string $expense,
        VerifyAccessIdentity $verifyAccessIdentity,
        ManageExpense $manageExpense,
    ): Response {
        $manageExpense->delete($verifyAccessIdentity->handle($request), $group, $expense);

        return response()->noContent();
    }
}
