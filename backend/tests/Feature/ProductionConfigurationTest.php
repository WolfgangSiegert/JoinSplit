<?php

use App\Support\ProductionConfiguration;

function configureValidProduction(string $certificate): void
{
    config([
        'app.env' => 'production',
        'app.debug' => false,
        'app.url' => 'https://joinsplit.tiny-bits.org',
        'production.canonical_origin' => 'https://joinsplit.tiny-bits.org',
        'production.trusted_proxies' => 'REMOTE_ADDR',
        'cors.allowed_origins' => ['https://joinsplit.tiny-bits.org'],
        'database.default' => 'pgsql',
        'database.connections.pgsql.url' => 'postgresql://user:secret@private-db.example:25060/joinsplit',
        'database.connections.pgsql.sslmode' => 'verify-full',
        'database.connections.pgsql.sslrootcert' => $certificate,
        'logging.default' => 'stderr',
    ]);
}

it('accepts only the approved production boundary without exposing values', function () {
    $certificate = tempnam(sys_get_temp_dir(), 'joinsplit-ca-');
    expect($certificate)->not->toBeFalse();
    file_put_contents($certificate, 'test certificate');
    configureValidProduction($certificate);

    expect(app(ProductionConfiguration::class)->errors())->toBe([]);
    app(ProductionConfiguration::class)->ensureValid();

    $this->get('/')
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    unlink($certificate);
});

it('rejects debug, noncanonical origins, public database hosts, weak TLS and file logging', function () {
    config([
        'app.env' => 'local',
        'app.debug' => true,
        'app.url' => 'http://127.0.0.1:8000',
        'production.canonical_origin' => 'https://other.example',
        'production.trusted_proxies' => '*',
        'cors.allowed_origins' => ['*'],
        'database.default' => 'sqlite',
        'database.connections.pgsql.url' => 'postgresql://user:secret@public-db.example/joinsplit',
        'database.connections.pgsql.sslmode' => 'require',
        'database.connections.pgsql.sslrootcert' => '/missing/ca.crt',
        'logging.default' => 'single',
    ]);

    $errors = app(ProductionConfiguration::class)->errors();
    expect($errors)->toEqual([
        'APP_ENV',
        'APP_DEBUG',
        'JOIN_SPLIT_CANONICAL_ORIGIN',
        'APP_URL',
        'JOIN_SPLIT_CLIENT_ORIGIN',
        'DB_CONNECTION',
        'DB_URL',
        'DB_SSLMODE',
        'DB_SSLROOTCERT',
        'LOG_CHANNEL',
        'TRUSTED_PROXIES',
    ])->and(implode(',', $errors))->not->toContain('secret');
});

it('returns generic readiness failure when production configuration is unsafe', function () {
    config(['app.env' => 'production']);

    $this->get('/ready')
        ->assertServiceUnavailable()
        ->assertExactJson(['status' => 'unavailable']);
});
