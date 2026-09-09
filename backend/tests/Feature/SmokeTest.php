<?php

use Illuminate\Support\Facades\DB;

it('boots the application', function () {
    $this->get('/up')->assertOk();
    $this->get('/')->assertOk()->assertSee('JoinSplit');
});

it('connects to the isolated PostgreSQL test database', function () {
    $connection = DB::selectOne('select current_database() as database, current_user as username');

    expect($connection->database)->toBe('joinsplit_test')
        ->and($connection->username)->toBe('joinsplit_test');
});
