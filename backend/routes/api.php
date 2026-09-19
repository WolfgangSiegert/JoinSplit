<?php

use App\Http\Controllers\CreateGroupController;
use Illuminate\Support\Facades\Route;

Route::post('/groups', CreateGroupController::class);
