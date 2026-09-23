<?php

use App\Http\Controllers\CreateGroupController;
use App\Http\Controllers\ParticipantController;
use Illuminate\Support\Facades\Route;

Route::post('/groups', CreateGroupController::class);
Route::post('/groups/{group}/participants', [ParticipantController::class, 'store']);
Route::patch('/groups/{group}/participants/{participant}', [ParticipantController::class, 'update']);
Route::delete('/groups/{group}/participants/{participant}', [ParticipantController::class, 'destroy']);
