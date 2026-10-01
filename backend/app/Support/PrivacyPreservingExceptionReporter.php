<?php

namespace App\Support;

use App\Http\Middleware\ObserveRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

final class PrivacyPreservingExceptionReporter
{
    /**
     * Report a production exception without copying its message, arguments,
     * request payload or authenticated identity into the retained runtime log.
     *
     * @return bool Whether Laravel's detailed default reporter should continue.
     */
    public function report(Throwable $exception): bool
    {
        if (! app()->environment('production')) {
            return true;
        }

        $request = app()->bound('request') ? request() : null;
        $context = $request instanceof Request ? ObserveRequest::safeContext($request) : [];

        Log::error('Unhandled application exception.', $context + [
            'event' => 'application.exception',
            'exception_class' => $exception::class,
            'exception_location' => $this->applicationLocation($exception),
        ]);

        // Returning false stops Laravel's default exception logger, whose
        // message and trace may contain domain data or SQL binding values.
        return false;
    }

    private function applicationLocation(Throwable $exception): string
    {
        $basePath = rtrim(base_path(), DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;
        $file = $exception->getFile();

        if (str_starts_with($file, $basePath)) {
            $file = substr($file, strlen($basePath));
        } else {
            $file = basename($file);
        }

        return $file.':'.$exception->getLine();
    }
}
