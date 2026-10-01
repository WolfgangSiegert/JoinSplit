<?php

use App\Support\PrivacyPreservingExceptionReporter;
use Illuminate\Support\Facades\Log;

function useExceptionReporterTestLog(string $path): void
{
    config([
        'logging.default' => 'single',
        'logging.channels.single.path' => $path,
        'logging.channels.single.level' => 'debug',
    ]);
    Log::setDefaultDriver('single');
    Log::forgetChannel('single');
}

it('keeps Laravel detailed reporting outside production', function () {
    $logPath = tempnam(sys_get_temp_dir(), 'joinsplit-observability-');
    expect($logPath)->not->toBeFalse();
    useExceptionReporterTestLog($logPath);
    $this->app['env'] = 'testing';

    expect(app(PrivacyPreservingExceptionReporter::class)->report(new RuntimeException('diagnostic detail')))
        ->toBeTrue()
        ->and(file_get_contents($logPath))->toBe('');

    unlink($logPath);
});

it('replaces detailed production exception logs with safe metadata', function () {
    $logPath = tempnam(sys_get_temp_dir(), 'joinsplit-observability-');
    expect($logPath)->not->toBeFalse();
    useExceptionReporterTestLog($logPath);
    $this->app['env'] = 'production';

    $continueDefaultReporting = app(PrivacyPreservingExceptionReporter::class)
        ->report(new RuntimeException('participant and financial private value'));
    $contents = file_get_contents($logPath);
    unlink($logPath);

    expect($continueDefaultReporting)->toBeFalse()
        ->and($contents)->toBeString()
        ->toContain('Unhandled application exception.')
        ->toContain('"event":"application.exception"')
        ->toContain('"exception_class":"RuntimeException"')
        ->toContain('tests/Feature/PrivacyPreservingExceptionReporterTest.php:')
        ->not->toContain(base_path())
        ->not->toContain('participant and financial private value');
});
