<?php

namespace App\Http\Controllers;

use App\Http\Requests\DeleteAccountRequest;
use App\Http\Requests\LoginAccountRequest;
use App\Http\Requests\RegisterAccountRequest;
use App\Models\Account;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AccountSessionController extends Controller
{
    public function csrf(): JsonResponse
    {
        return response()->json(['data' => ['csrfToken' => csrf_token()]]);
    }

    public function register(RegisterAccountRequest $request): JsonResponse
    {
        try {
            $account = Account::query()->create([
                'email' => $this->normalizedEmail($request->string('email')->toString()),
                'password' => $request->string('password')->toString(),
            ]);
        } catch (QueryException $exception) {
            if ($exception->getCode() !== '23505') {
                throw $exception;
            }

            return response()->json(['message' => 'Account registration failed.'], 422);
        }

        Auth::guard('web')->login($account);
        $request->session()->regenerate();

        return response()->json(['data' => $this->accountData($account)], 201);
    }

    public function login(LoginAccountRequest $request): JsonResponse
    {
        $authenticated = Auth::guard('web')->attempt([
            'email' => $this->normalizedEmail($request->string('email')->toString()),
            'password' => $request->string('password')->toString(),
        ]);

        if (! $authenticated) {
            return response()->json(['message' => 'Account authentication failed.'], 401);
        }

        $request->session()->regenerate();

        /** @var Account $account */
        $account = Auth::guard('web')->user();

        return response()->json(['data' => $this->accountData($account)]);
    }

    public function current(Request $request): JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');

        return response()->json(['data' => $this->accountData($account)]);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function destroy(DeleteAccountRequest $request): Response|JsonResponse
    {
        /** @var Account $account */
        $account = $request->user('web');
        if (! Hash::check($request->string('password')->toString(), $account->getAuthPassword())) {
            return response()->json(['message' => 'Account confirmation failed.'], 422);
        }

        DB::transaction(function () use ($account): void {
            $identityIds = DB::table('access_identities')->where('account_id', $account->getKey())->pluck('id');
            $groupIds = DB::table('groups')->whereIn('owner_access_identity_id', $identityIds)->pluck('id');
            $expenseIds = DB::table('expenses')->whereIn('group_id', $groupIds)->pluck('id');

            DB::table('expense_shares')->whereIn('expense_id', $expenseIds)->delete();
            DB::table('settlements')->whereIn('group_id', $groupIds)->delete();
            DB::table('expenses')->whereIn('group_id', $groupIds)->delete();
            DB::table('participants')->whereIn('group_id', $groupIds)->delete();
            DB::table('account_group_imports')->where('account_id', $account->getKey())->delete();
            DB::table('account_mutations')->where('account_id', $account->getKey())->delete();
            DB::table('groups')->whereIn('id', $groupIds)->delete();
            DB::table('access_identities')->whereIn('id', $identityIds)->delete();
            DB::table('sessions')->where('user_id', $account->getKey())->delete();
            $account->delete();
        });

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    private function normalizedEmail(string $email): string
    {
        return Str::lower(trim($email));
    }

    /** @return array{id: string, email: string} */
    private function accountData(Account $account): array
    {
        return ['id' => $account->getKey(), 'email' => $account->email];
    }
}
