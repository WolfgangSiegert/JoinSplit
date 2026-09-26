<?php

namespace App\Providers;

use App\Support\ProductionConfiguration;
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
        if (filter_var(config('production.validate'), FILTER_VALIDATE_BOOL)) {
            app(ProductionConfiguration::class)->ensureValid();
        }

        RateLimiter::for('identity-registration', fn (Request $request) => Limit::perMinute(30)
            ->by('identity-registration:'.$request->ip())
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('group-creation', fn (Request $request) => Limit::perMinute(10)
            ->by('group-creation:'.$this->requestKey($request))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('authenticated-mutations', fn (Request $request) => Limit::perMinute(60)
            ->by('authenticated-mutations:'.$this->requestKey($request))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('account-registration', fn (Request $request) => Limit::perHour(5)
            ->by('account-registration:'.$request->ip())
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('account-login', fn (Request $request) => Limit::perMinute(10)
            ->by('account-login:'.$request->ip().'|'.$this->emailKey($request))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('account-session', fn (Request $request) => Limit::perMinute(60)
            ->by('account-session:'.($request->user('web')?->getAuthIdentifier() ?? $request->ip()))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));

        RateLimiter::for('account-adoption', fn (Request $request) => Limit::perMinute(30)
            ->by('account-adoption:'.($request->user('web')?->getAuthIdentifier() ?? $request->ip()))
            ->response(fn () => response()->json(['message' => 'Too many requests.'], 429)));
    }

    private function requestKey(Request $request): string
    {
        if ($accountId = $request->user('web')?->getAuthIdentifier()) {
            return $request->ip().'|account:'.$accountId;
        }
        $identityId = strtolower((string) $request->header('X-Access-Identity-ID'));

        return $request->ip().'|'.$identityId;
    }

    private function emailKey(Request $request): string
    {
        return hash('sha256', strtolower(trim((string) $request->input('email'))));
    }
}
