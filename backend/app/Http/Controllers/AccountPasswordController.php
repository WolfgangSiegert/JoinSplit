<?php

namespace App\Http\Controllers;

use App\Http\Requests\ForgotAccountPasswordRequest;
use App\Http\Requests\ResetAccountPasswordRequest;
use App\Models\Account;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Throwable;

class AccountPasswordController extends Controller
{
    public function forgot(ForgotAccountPasswordRequest $request): JsonResponse
    {
        if (config('app.env') === 'production' && config('mail.default') === 'log') {
            return response()->json(['message' => 'Password recovery is temporarily unavailable.'], 503);
        }

        try {
            Password::broker()->sendResetLink([
                'email' => Str::lower(trim($request->string('email')->toString())),
            ]);
        } catch (Throwable $exception) {
            Log::error('Password recovery mail delivery failed.', [
                'exception' => $exception::class,
            ]);
        }

        return response()->json(['message' => 'If the account exists, a recovery email has been sent.'], 202);
    }

    public function reset(ResetAccountPasswordRequest $request): JsonResponse
    {
        $status = Password::broker()->reset([
            'email' => Str::lower(trim($request->string('email')->toString())),
            'password' => $request->string('password')->toString(),
            'password_confirmation' => $request->string('password_confirmation')->toString(),
            'token' => $request->string('token')->toString(),
        ], function (Account $account, string $password): void {
            $account->forceFill([
                'password' => $password,
            ])->save();
            DB::table('sessions')->where('user_id', $account->getKey())->delete();
            event(new PasswordReset($account));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password reset failed.'], 422);
        }

        return response()->json(['message' => 'Password reset completed.']);
    }
}
