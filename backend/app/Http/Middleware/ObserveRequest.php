<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class ObserveRequest
{
    public const ATTRIBUTE = 'joinsplit_request_id';

    public function handle(Request $request, Closure $next): Response
    {
        $requestId = (string) Str::uuid();
        $startedAt = hrtime(true);

        // Never trust a caller-provided correlation ID: it could contain user
        // data or control characters that would then be copied into logs.
        $request->attributes->set(self::ATTRIBUTE, $requestId);

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);

        $this->reportExceptionalStatus($request, $response, $startedAt);

        return $response;
    }

    /** @return array{request_id?: string, request_method: string, request_surface: string} */
    public static function safeContext(Request $request): array
    {
        $requestId = $request->attributes->get(self::ATTRIBUTE);

        return array_filter([
            'request_id' => is_string($requestId) ? $requestId : null,
            'request_method' => $request->getMethod(),
            'request_surface' => self::surface($request),
        ], static fn (mixed $value): bool => $value !== null);
    }

    private static function surface(Request $request): string
    {
        if ($request->is('api/*')) {
            return 'api';
        }

        if ($request->is('up') || $request->is('ready') || $request->is('health')) {
            return 'health';
        }

        return 'frontend';
    }

    private function reportExceptionalStatus(Request $request, Response $response, int $startedAt): void
    {
        $status = $response->getStatusCode();
        if ($status !== Response::HTTP_TOO_MANY_REQUESTS && $status < Response::HTTP_INTERNAL_SERVER_ERROR) {
            return;
        }

        $context = self::safeContext($request) + [
            'event' => $status === Response::HTTP_TOO_MANY_REQUESTS
                ? 'http.rate_limited'
                : 'http.server_error_response',
            'status' => $status,
            'duration_ms' => (int) round((hrtime(true) - $startedAt) / 1_000_000),
        ];

        if ($status === Response::HTTP_TOO_MANY_REQUESTS) {
            Log::warning('HTTP request rate limited.', $context);

            return;
        }

        Log::error('HTTP request returned a server error.', $context);
    }
}
