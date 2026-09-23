<?php

use App\Http\Controllers\CreateGroupController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\ParticipantController;
use Illuminate\Support\Facades\Route;

Route::post('/groups', CreateGroupController::class);
Route::post('/groups/{group}/participants', [ParticipantController::class, 'store']);
Route::patch('/groups/{group}/participants/{participant}', [ParticipantController::class, 'update']);
Route::delete('/groups/{group}/participants/{participant}', [ParticipantController::class, 'destroy']);
Route::post('/groups/{group}/expenses', [ExpenseController::class, 'store']);
Route::put('/groups/{group}/expenses/{expense}', [ExpenseController::class, 'update']);
Route::delete('/groups/{group}/expenses/{expense}', [ExpenseController::class, 'destroy']);
