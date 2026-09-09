<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        // The smoke tests execute real commands and do not need Mockery.
        $this->mockConsoleOutput = false;

        $app = parent::createApplication();

        // This runs before RefreshDatabase can execute destructive migrations.
        if (! $app->environment('testing')
            || config('database.default') !== 'pgsql'
            || config('database.connections.pgsql.database') !== 'joinsplit_test'
            || config('database.connections.pgsql.username') !== 'joinsplit_test') {
            throw new RuntimeException('Tests require the isolated joinsplit_test PostgreSQL database and role.');
        }

        return $app;
    }
}
