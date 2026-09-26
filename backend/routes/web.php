<?php

use App\Http\Controllers\AccountSessionController;
use App\Http\Controllers\AccountAccessIdentityController;
use App\Http\Controllers\AccountWorkspaceController;
use App\Http\Controllers\CreateGroupController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\GroupLifecycleController;
use App\Http\Controllers\ParticipantController;
use App\Http\Controllers\SettlementController;
use App\Http\Controllers\ReadinessController;
use Illuminate\Support\Facades\Route;

Route::get('/ready', ReadinessController::class);

Route::prefix('/api/account')->middleware('api.origin')->group(function () {
    Route::get('/csrf', [AccountSessionController::class, 'csrf'])
        ->middleware('throttle:account-session');
    Route::post('/register', [AccountSessionController::class, 'register'])
        ->middleware(['guest:web', 'throttle:account-registration']);
    Route::post('/login', [AccountSessionController::class, 'login'])
        ->middleware(['guest:web', 'throttle:account-login']);

    Route::middleware(['auth:web', 'throttle:account-session'])->group(function () {
        Route::get('/', [AccountSessionController::class, 'current']);
        Route::post('/logout', [AccountSessionController::class, 'logout']);
        Route::delete('/', [AccountSessionController::class, 'destroy']);
        Route::post('/access-identities/link', [AccountAccessIdentityController::class, 'store'])
            ->middleware('throttle:account-adoption');
        Route::post('/access-identities', [AccountAccessIdentityController::class, 'create'])
            ->middleware('throttle:account-adoption');
        Route::get('/workspace', [AccountWorkspaceController::class, 'index']);
        Route::post('/adoptions/{adoption}/groups/{group}/import', [AccountWorkspaceController::class, 'import'])
            ->whereUuid('adoption')->whereUuid('group')
            ->middleware('throttle:account-adoption');

        Route::prefix('/workspace')->middleware(['throttle:authenticated-mutations', 'account.mutation'])->group(function () {
            Route::post('/groups', CreateGroupController::class);
            Route::patch('/groups/{group}', [GroupLifecycleController::class, 'update']);
            Route::delete('/groups/{group}', [GroupLifecycleController::class, 'destroy']);
            Route::post('/groups/{group}/participants', [ParticipantController::class, 'store']);
            Route::patch('/groups/{group}/participants/{participant}', [ParticipantController::class, 'update']);
            Route::delete('/groups/{group}/participants/{participant}', [ParticipantController::class, 'destroy']);
            Route::post('/groups/{group}/expenses', [ExpenseController::class, 'store']);
            Route::put('/groups/{group}/expenses/{expense}', [ExpenseController::class, 'update']);
            Route::delete('/groups/{group}/expenses/{expense}', [ExpenseController::class, 'destroy']);
            Route::post('/groups/{group}/settlements', [SettlementController::class, 'store']);
            Route::put('/groups/{group}/settlements/{settlement}', [SettlementController::class, 'update']);
            Route::delete('/groups/{group}/settlements/{settlement}', [SettlementController::class, 'destroy']);
        });
    });
});

Route::get('/', function () {
    return view('welcome');
});
