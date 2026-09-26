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
        'database.connections.pgsql.url' => 'postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/joinsplit?sslmode=verify-full&channel_binding=require',
        'database.connections.pgsql.pooled' => true,
        'database.connections.pgsql.direct.host' => 'ep-example.eu-central-1.aws.neon.tech',
        'database.connections.pgsql.sslmode' => 'verify-full',
        'database.connections.pgsql.sslrootcert' => $certificate,
        'logging.default' => 'stderr',
        'session.driver' => 'database',
        'session.lifetime' => 720,
        'session.encrypt' => true,
        'session.secure' => true,
        'session.http_only' => true,
        'session.same_site' => 'lax',
    ]);
}

it('accepts only the approved production boundary without exposing values', function () {
    $certificate = tempnam(sys_get_temp_dir(), 'joinsplit-ca-');
    expect($certificate)->not->toBeFalse();
    file_put_contents($certificate, 'test certificate');
    configureValidProduction($certificate);

    expect(app(ProductionConfiguration::class)->errors())->toBe([]);
    app(ProductionConfiguration::class)->ensureValid();

    // The production boundary above deliberately requires database-backed
    // sessions. The HSTS assertion itself must stay independent from an
    // external database connection.
    config(['session.driver' => 'array']);

    $this->get('/')
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    unlink($certificate);
});

it('rejects debug, noncanonical origins, non-Neon database hosts, weak TLS and file logging', function () {
    config([
        'app.env' => 'local',
        'app.debug' => true,
        'app.url' => 'http://127.0.0.1:8000',
        'production.canonical_origin' => 'https://other.example',
        'production.trusted_proxies' => '*',
        'cors.allowed_origins' => ['*'],
        'database.default' => 'sqlite',
        'database.connections.pgsql.url' => 'postgresql://user:secret@public-db.example/joinsplit?sslmode=require',
        'database.connections.pgsql.pooled' => false,
        'database.connections.pgsql.direct.host' => 'ep-example-pooler.eu-central-1.aws.neon.tech',
        'database.connections.pgsql.sslmode' => 'verify-full',
        'database.connections.pgsql.sslrootcert' => '/missing/ca.crt',
        'logging.default' => 'single',
        'session.driver' => 'file',
        'session.lifetime' => 120,
        'session.encrypt' => false,
        'session.secure' => false,
        'session.http_only' => false,
        'session.same_site' => 'none',
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
        'DB_POOLED',
        'DB_DIRECT_HOST',
        'DB_SSLMODE',
        'DB_SSLROOTCERT',
        'LOG_CHANNEL',
        'TRUSTED_PROXIES',
        'SESSION_DRIVER',
        'SESSION_LIFETIME',
        'SESSION_ENCRYPT',
        'SESSION_SECURE_COOKIE',
        'SESSION_HTTP_ONLY',
        'SESSION_SAME_SITE',
    ])->and(implode(',', $errors))->not->toContain('secret');
});

it('returns generic readiness failure when production configuration is unsafe', function () {
    config(['app.env' => 'production']);

    $this->get('/ready')
        ->assertServiceUnavailable()
        ->assertExactJson(['status' => 'unavailable']);
});
