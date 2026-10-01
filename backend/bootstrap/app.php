<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use App\Http\Middleware\AuthenticateAccessIdentityMutation;
use App\Http\Middleware\EnforceApiOrigin;
use App\Http\Middleware\ObserveRequest;
use App\Http\Middleware\SetSecurityHeaders;
use App\Http\Middleware\AuthenticateAccountMutation;
use App\Support\PrivacyPreservingExceptionReporter;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $trustedProxies = env('TRUSTED_PROXIES');
        if (is_string($trustedProxies) && $trustedProxies !== '') {
            $middleware->trustProxies(at: $trustedProxies);
        }
        $middleware->append(ObserveRequest::class);
        $middleware->append(SetSecurityHeaders::class);
        $middleware->alias([
            'access.identity.mutation' => AuthenticateAccessIdentityMutation::class,
            'api.origin' => EnforceApiOrigin::class,
            'account.mutation' => AuthenticateAccountMutation::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->context(function (): array {
            $request = app()->bound('request') ? request() : null;

            return $request instanceof Request ? ObserveRequest::safeContext($request) : [];
        });
        $exceptions->report(function (\Throwable $exception): bool {
            return app(PrivacyPreservingExceptionReporter::class)->report($exception);
        });
        $exceptions->respond(function (Response $response): Response {
            $request = app()->bound('request') ? request() : null;
            $requestId = $request instanceof Request
                ? $request->attributes->get(ObserveRequest::ATTRIBUTE)
                : null;

            if (is_string($requestId) && ! $response->headers->has('X-Request-ID')) {
                $response->headers->set('X-Request-ID', $requestId);
            }

            return $response;
        });
    })->create();
