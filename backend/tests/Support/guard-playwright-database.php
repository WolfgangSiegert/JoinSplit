<?php

use Illuminate\Contracts\Console\Kernel;

require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$safe = $app->environment('testing')
    && config('database.default') === 'pgsql'
    && config('database.connections.pgsql.database') === 'joinsplit_test'
    && config('database.connections.pgsql.username') === 'joinsplit_test';

if (! $safe) {
    fwrite(
        STDERR,
        "Refusing destructive Playwright database setup: Laravel must resolve APP_ENV=testing, database=joinsplit_test and role=joinsplit_test.\n",
    );
    exit(1);
}

fwrite(STDOUT, "Playwright database guard passed: testing / joinsplit_test / joinsplit_test.\n");
