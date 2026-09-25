<?php

use Illuminate\Support\Facades\DB;

it('boots the application', function () {
    $this->get('/up')->assertOk();
    $this->get('/ready')->assertOk()->assertExactJson(['status' => 'ready']);
    $this->get('/')->assertOk()
        ->assertSee('JoinSplit')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        ->assertHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
});

it('connects to the isolated PostgreSQL test database', function () {
    $connection = DB::selectOne('select current_database() as database, current_user as username');

    expect($connection->database)->toBe('joinsplit_test')
        ->and($connection->username)->toBe('joinsplit_test');
});
