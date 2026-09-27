<?php

use App\Models\Account;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

uses(RefreshDatabase::class);

function recoveryAccount(): Account
{
    return Account::query()->create([
        'email' => 'recovery@example.test',
        'password' => 'correct horse battery staple',
    ]);
}

it('returns the same accepted response without revealing whether an Account exists', function () {
    Notification::fake();
    $account = recoveryAccount();

    $known = $this->postJson('/api/account/password/forgot', ['email' => ' RECOVERY@EXAMPLE.TEST '])
        ->assertAccepted()->json();
    $unknown = $this->postJson('/api/account/password/forgot', ['email' => 'unknown@example.test'])
        ->assertAccepted()->json();

    expect($known)->toBe($unknown);
    Notification::assertSentTo($account, ResetPassword::class, function (ResetPassword $notification) use ($account): bool {
        return str_contains($notification->toMail($account)->actionUrl, '/account/reset?token=');
    });
});

it('disables recovery safely when production has no deliverable mailer', function () {
    config(['app.env' => 'production', 'mail.default' => 'log']);
    recoveryAccount();

    $known = $this->postJson('/api/account/password/forgot', ['email' => 'recovery@example.test'])
        ->assertServiceUnavailable()->json();
    $unknown = $this->postJson('/api/account/password/forgot', ['email' => 'unknown@example.test'])
        ->assertServiceUnavailable()->json();

    expect($known)->toBe($unknown);
});

it('resets the password, consumes the token, and invalidates existing sessions', function () {
    $account = recoveryAccount();
    DB::table('sessions')->insert([
        'id' => 'recovery-session', 'user_id' => $account->id, 'ip_address' => '127.0.0.1',
        'user_agent' => 'test', 'payload' => '', 'last_activity' => time(),
    ]);
    $token = Password::broker()->createToken($account);

    $payload = [
        'email' => 'RECOVERY@EXAMPLE.TEST', 'token' => $token,
        'password' => 'new correct horse battery staple',
        'password_confirmation' => 'new correct horse battery staple',
    ];
    $this->postJson('/api/account/password/reset', $payload)->assertOk();

    expect(Hash::check('new correct horse battery staple', $account->fresh()->password))->toBeTrue()
        ->and(DB::table('sessions')->where('user_id', $account->id)->exists())->toBeFalse();
    $this->postJson('/api/account/password/reset', $payload)->assertUnprocessable()
        ->assertExactJson(['message' => 'Password reset failed.']);
});

it('validates the reset password policy and rejects invalid tokens generically', function () {
    recoveryAccount();
    $this->postJson('/api/account/password/reset', [
        'email' => 'recovery@example.test', 'token' => 'invalid',
        'password' => 'short', 'password_confirmation' => 'short',
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);

    $this->postJson('/api/account/password/reset', [
        'email' => 'recovery@example.test', 'token' => 'invalid',
        'password' => 'long enough password', 'password_confirmation' => 'long enough password',
    ])->assertUnprocessable()->assertExactJson(['message' => 'Password reset failed.']);
});
