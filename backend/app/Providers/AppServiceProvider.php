<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('identity-registration', fn (Request $request) => Limit::perMinute(30)
            ->by('identity-registration:'.$request->ip())
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('group-creation', fn (Request $request) => Limit::perMinute(10)
            ->by('group-creation:'.$this->requestKey($request))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('authenticated-mutations', fn (Request $request) => Limit::perMinute(60)
            ->by('authenticated-mutations:'.$this->requestKey($request))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));
    }

    private function requestKey(Request $request): string
    {
        $identityId = strtolower((string) $request->header('X-Access-Identity-ID'));

        return $request->ip().'|'.$identityId;
    }
}
