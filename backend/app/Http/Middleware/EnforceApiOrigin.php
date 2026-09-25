<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceApiOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->headers->get('Origin');
        $allowedOrigins = config('cors.allowed_origins', []);
        $canonicalOrigin = $this->origin(is_array($allowedOrigins) ? (string) ($allowedOrigins[0] ?? '') : '');

        if (is_string($origin) && $this->origin($origin) !== $canonicalOrigin) {
            return new JsonResponse(['message' => 'Request origin is not allowed.'], 403, [
                'Cache-Control' => 'no-store',
            ]);
        }

        $response = $next($request);
        $response->headers->set('Cache-Control', 'no-store');
        if (is_string($origin) && $origin !== '') {
            $response->headers->set('Access-Control-Allow-Origin', $canonicalOrigin);
            $response->headers->set('Vary', 'Origin');
        }

        return $response;
    }

    private function origin(string $url): string
    {
        $parts = parse_url($url);
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            return '';
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return strtolower($parts['scheme'].'://'.$parts['host'].$port);
    }
}
