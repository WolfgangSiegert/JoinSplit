<?php

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

function useObservabilityTestLog(string $path): void
{
    config([
        'logging.default' => 'single',
        'logging.channels.single.path' => $path,
        'logging.channels.single.level' => 'debug',
    ]);
    Log::setDefaultDriver('single');
    Log::forgetChannel('single');
}

it('assigns its own request id and returns it without echoing caller input', function () {
    $response = $this->withHeader('X-Request-ID', "caller-controlled\nvalue")
        ->get('/up')
        ->assertOk();

    $requestId = $response->headers->get('X-Request-ID');

    expect($requestId)
        ->toBeString()
        ->not->toBe("caller-controlled\nvalue")
        ->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/');

    expect(config('cors.exposed_headers'))->toContain('X-Request-ID');
});

it('adds the request id to rendered exception responses', function () {
    config(['logging.default' => 'null']);
    Log::setDefaultDriver('null');
    Log::forgetChannel('null');
    Route::get('/observability-test/exception', fn () => throw new RuntimeException('private test value'));

    $this->get('/observability-test/exception')
        ->assertServerError()
        ->assertHeader('X-Request-ID');
});

it('logs exceptional response metadata without paths or request data', function () {
    $logPath = tempnam(sys_get_temp_dir(), 'joinsplit-observability-');
    expect($logPath)->not->toBeFalse();
    useObservabilityTestLog($logPath);
    Route::get('/observability-test/rate-limited/private-value', fn () => response('private response', 429));

    $response = $this->withHeader('Authorization', 'Bearer private-credential')
        ->get('/observability-test/rate-limited/private-value')
        ->assertTooManyRequests();

    $contents = file_get_contents($logPath);
    unlink($logPath);

    expect($contents)->toBeString()
        ->toContain('HTTP request rate limited.')
        ->toContain('"event":"http.rate_limited"')
        ->toContain('"request_id":"'.$response->headers->get('X-Request-ID').'"')
        ->toContain('"request_method":"GET"')
        ->toContain('"request_surface":"frontend"')
        ->toContain('"status":429')
        ->not->toContain('private');
});
