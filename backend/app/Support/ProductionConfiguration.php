<?php

namespace App\Support;

use RuntimeException;

class ProductionConfiguration
{
    /** @return list<string> */
    public function errors(): array
    {
        $errors = [];
        $canonicalOrigin = $this->origin((string) config('production.canonical_origin'));
        $appOrigin = $this->origin((string) config('app.url'));
        $databaseUrl = (string) config('database.connections.pgsql.url');
        $databaseHost = parse_url($databaseUrl, PHP_URL_HOST);
        $databasePooled = (bool) config('database.connections.pgsql.pooled');
        $databaseDirectHost = config('database.connections.pgsql.direct.host');
        $databaseSslMode = $this->databaseSslMode($databaseUrl);
        $rootCertificate = config('database.connections.pgsql.sslrootcert');

        if (config('app.env') !== 'production') {
            $errors[] = 'APP_ENV';
        }
        if ((bool) config('app.debug')) {
            $errors[] = 'APP_DEBUG';
        }
        if ($canonicalOrigin !== 'https://joinsplit.tiny-bits.org') {
            $errors[] = 'JOIN_SPLIT_CANONICAL_ORIGIN';
        }
        if ($appOrigin !== $canonicalOrigin) {
            $errors[] = 'APP_URL';
        }
        if (config('cors.allowed_origins') !== [$canonicalOrigin]) {
            $errors[] = 'JOIN_SPLIT_CLIENT_ORIGIN';
        }
        if (config('database.default') !== 'pgsql') {
            $errors[] = 'DB_CONNECTION';
        }
        if (! is_string($databaseHost)
            || ! str_ends_with(strtolower($databaseHost), '.neon.tech')
            || ! str_contains(strtolower($databaseHost), '-pooler.')) {
            $errors[] = 'DB_URL';
        }
        if (! $databasePooled) {
            $errors[] = 'DB_POOLED';
        }
        if (! is_string($databaseDirectHost)
            || ! str_ends_with(strtolower($databaseDirectHost), '.neon.tech')
            || str_contains(strtolower($databaseDirectHost), '-pooler.')) {
            $errors[] = 'DB_DIRECT_HOST';
        }
        if ($databaseSslMode !== 'verify-full') {
            $errors[] = 'DB_SSLMODE';
        }
        if (! is_string($rootCertificate) || ! str_starts_with($rootCertificate, '/') || ! is_readable($rootCertificate)) {
            $errors[] = 'DB_SSLROOTCERT';
        }
        if (config('logging.default') !== 'stderr') {
            $errors[] = 'LOG_CHANNEL';
        }
        if (config('production.trusted_proxies') !== 'REMOTE_ADDR') {
            $errors[] = 'TRUSTED_PROXIES';
        }
        if (config('session.driver') !== 'database') {
            $errors[] = 'SESSION_DRIVER';
        }
        if ((int) config('session.lifetime') !== 720) {
            $errors[] = 'SESSION_LIFETIME';
        }
        if (! (bool) config('session.encrypt')) {
            $errors[] = 'SESSION_ENCRYPT';
        }
        if (! (bool) config('session.secure')) {
            $errors[] = 'SESSION_SECURE_COOKIE';
        }
        if (! (bool) config('session.http_only')) {
            $errors[] = 'SESSION_HTTP_ONLY';
        }
        if (config('session.same_site') !== 'lax') {
            $errors[] = 'SESSION_SAME_SITE';
        }

        return $errors;
    }

    public function ensureValid(): void
    {
        $errors = $this->errors();
        if ($errors !== []) {
            throw new RuntimeException('Invalid production configuration: '.implode(', ', $errors));
        }
    }

    private function origin(string $value): string
    {
        $parts = parse_url($value);
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])
            || isset($parts['user'], $parts['pass'], $parts['query'], $parts['fragment'])
            || ($parts['path'] ?? '') !== '') {
            return '';
        }
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return strtolower($parts['scheme'].'://'.$parts['host'].$port);
    }

    private function databaseSslMode(string $databaseUrl): mixed
    {
        $query = parse_url($databaseUrl, PHP_URL_QUERY);
        if (! is_string($query) || $query === '') {
            return config('database.connections.pgsql.sslmode');
        }

        parse_str($query, $options);

        return $options['sslmode'] ?? config('database.connections.pgsql.sslmode');
    }
}
