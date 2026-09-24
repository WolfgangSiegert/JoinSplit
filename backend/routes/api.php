<?php

use App\Http\Controllers\CreateGroupController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\GroupLifecycleController;
use App\Http\Controllers\ParticipantController;
use App\Http\Controllers\SettlementController;
use Illuminate\Support\Facades\Route;

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
