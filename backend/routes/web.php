<?php

use App\Http\Controllers\AccountSessionController;
use App\Http\Controllers\AccountAccessIdentityController;
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
    });
});

Route::get('/', function () {
    return view('welcome');
});
