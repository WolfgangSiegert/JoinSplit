<?php

use Illuminate\Routing\Route as LaravelRoute;

/** @return array<string, mixed> */
function jsOpenApiDocument(): array
{
    $path = dirname(__DIR__, 3).'/docs/api/openapi.json';
    $decoded = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

    expect($decoded)->toBeArray();

    return $decoded;
}

/** @param array<string, mixed> $document */
function jsResolveOpenApiReference(array $document, string $reference): mixed
{
    expect($reference)->toStartWith('#/');
    $value = $document;

    foreach (explode('/', substr($reference, 2)) as $encodedSegment) {
        $segment = str_replace(['~1', '~0'], ['/', '~'], $encodedSegment);
        expect($value)->toBeArray()->and(array_key_exists($segment, $value))->toBeTrue();
        $value = $value[$segment];
    }

    return $value;
}

/** @return array<int, array<string, mixed>> */
function jsOpenApiParameters(array $document, array $pathItem, array $operation): array
{
    return collect([...(array) ($pathItem['parameters'] ?? []), ...(array) ($operation['parameters'] ?? [])])
        ->map(function (mixed $parameter) use ($document): mixed {
            if (is_array($parameter) && is_string($parameter['$ref'] ?? null)) {
                return jsResolveOpenApiReference($document, $parameter['$ref']);
            }

            return $parameter;
        })
        ->filter(fn (mixed $parameter): bool => is_array($parameter))
        ->values()
        ->all();
}

/** @param array<int, array<string, mixed>> $parameters */
function jsExpectHeaderParameters(array $parameters, string ...$names): void
{
    $headers = collect($parameters)
        ->filter(fn (array $parameter): bool => ($parameter['in'] ?? null) === 'header')
        ->pluck('name');

    foreach ($names as $name) {
        expect($headers)->toContain($name);
    }
}

/** @param array<int, mixed> $requirements */
function jsExpectSecurityRequirement(array $requirements, string ...$schemes): void
{
    $matches = collect($requirements)->contains(function (mixed $requirement) use ($schemes): bool {
        return is_array($requirement)
            && collect($schemes)->every(fn (string $scheme): bool => array_key_exists($scheme, $requirement));
    });

    expect($matches)->toBeTrue();
}

/** @return array<string, mixed> */
function jsResolveOpenApiResponse(array $document, array $response): array
{
    if (is_string($response['$ref'] ?? null)) {
        $response = jsResolveOpenApiReference($document, $response['$ref']);
    }

    expect($response)->toBeArray();

    return $response;
}

it('is valid JSON with resolvable local references and unique operation ids', function () {
    $document = jsOpenApiDocument();

    expect($document['openapi'] ?? null)->toBe('3.0.3')
        ->and($document['paths'] ?? null)->toBeArray();

    $operationIds = [];
    $walk = function (mixed $value) use (&$walk, &$operationIds, $document): void {
        if (! is_array($value)) return;

        if (isset($value['$ref'])) {
            expect($value['$ref'])->toBeString();
            jsResolveOpenApiReference($document, $value['$ref']);
        }
        if (isset($value['operationId'])) {
            expect($value['operationId'])->toBeString();
            $operationIds[] = $value['operationId'];
        }
        foreach ($value as $child) $walk($child);
    };
    $walk($document);

    expect($operationIds)->not->toBeEmpty()
        ->and(array_unique($operationIds))->toHaveCount(count($operationIds));
});

it('documents every application API method registered by Laravel', function () {
    $document = jsOpenApiDocument();
    $httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

    $documented = collect($document['paths'])
        ->flatMap(function (array $pathItem, string $path) use ($httpMethods): array {
            return collect($httpMethods)
                ->filter(fn (string $method): bool => isset($pathItem[$method]))
                ->map(fn (string $method): string => strtoupper($method).' '.$path)
                ->all();
        })->sort()->values()->all();

    $registered = collect(app('router')->getRoutes()->getRoutes())
        ->filter(fn (LaravelRoute $route): bool => in_array($route->uri(), ['up', 'ready'], true)
            || str_starts_with($route->uri(), 'api/'))
        ->flatMap(function (LaravelRoute $route): array {
            return collect($route->methods())
                ->reject(fn (string $method): bool => in_array($method, ['HEAD', 'OPTIONS'], true))
                ->map(fn (string $method): string => $method.' /'.$route->uri())
                ->all();
        })->sort()->values()->all();

    expect($documented)->toBe($registered);
});

it('keeps anonymous credentials and Account session security distinct', function () {
    $document = jsOpenApiDocument();

    foreach ($document['paths'] as $path => $pathItem) {
        foreach (['get', 'post', 'put', 'patch', 'delete'] as $method) {
            $operation = $pathItem[$method] ?? null;
            if (! is_array($operation)) continue;

            if ($path === '/api/access-identities' || str_starts_with($path, '/api/groups')) {
                jsExpectSecurityRequirement(
                    (array) ($operation['security'] ?? []),
                    'accessIdentityHeader',
                    'bearerCredential',
                );
            }

            $publicAccountOperation = in_array($path, [
                '/api/account/csrf',
                '/api/account/register',
                '/api/account/login',
                '/api/account/password/forgot',
                '/api/account/password/reset',
            ], true);
            if (str_starts_with($path, '/api/account') && ! $publicAccountOperation) {
                jsExpectSecurityRequirement((array) ($operation['security'] ?? []), 'cookieAuth');
            }

            if (str_starts_with($path, '/api/account') && $method !== 'get') {
                jsExpectHeaderParameters(
                    jsOpenApiParameters($document, $pathItem, $operation),
                    'X-CSRF-TOKEN',
                );
            }
        }
    }

    jsExpectSecurityRequirement(
        $document['paths']['/api/account/access-identities/link']['post']['security'],
        'cookieAuth',
        'accessIdentityHeader',
        'bearerCredential',
    );
});

it('documents optimistic revisions and idempotency headers for Account mutations', function () {
    $document = jsOpenApiDocument();

    foreach ($document['paths'] as $path => $pathItem) {
        foreach (['post', 'put', 'patch', 'delete'] as $method) {
            $operation = $pathItem[$method] ?? null;
            if (! is_array($operation)) continue;

            if (str_starts_with($path, '/api/account/workspace/groups')) {
                jsExpectHeaderParameters(
                    jsOpenApiParameters($document, $pathItem, $operation),
                    'X-Mutation-ID',
                    'X-Group-Revision',
                );
                $successfulResponse = collect((array) ($operation['responses'] ?? []))
                    ->first(fn (mixed $_response, string $status): bool => str_starts_with($status, '2'));
                expect($successfulResponse)->toBeArray();
                $successfulResponse = jsResolveOpenApiResponse($document, $successfulResponse);
                expect(array_keys((array) ($successfulResponse['headers'] ?? [])))
                    ->toContain('X-Group-Revision');
            }
            if (str_starts_with($path, '/api/account/workspace/people')) {
                jsExpectHeaderParameters(
                    jsOpenApiParameters($document, $pathItem, $operation),
                    'X-Mutation-ID',
                    'X-Person-Revision',
                );
                $successfulResponse = collect((array) ($operation['responses'] ?? []))
                    ->first(fn (mixed $_response, string $status): bool => str_starts_with($status, '2'));
                expect($successfulResponse)->toBeArray();
                $successfulResponse = jsResolveOpenApiResponse($document, $successfulResponse);
                expect(array_keys((array) ($successfulResponse['headers'] ?? [])))
                    ->toContain('X-Person-Revision');
            }
        }
    }

    jsExpectHeaderParameters(
        jsOpenApiParameters(
            $document,
            $document['paths']['/api/account/workspace/groups'],
            $document['paths']['/api/account/workspace/groups']['post'],
        ),
        'X-Access-Identity-ID',
    );
});
