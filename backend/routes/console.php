<?php

use App\Support\ProductionConfiguration;
use App\Actions\PruneExpiredAccessIdentities;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('app:validate-production-config', function (ProductionConfiguration $configuration) {
    $configuration->ensureValid();
    $this->info('Production configuration is valid.');
})->purpose('Validate production configuration without exposing values');

Artisan::command('app:prune-expired-identities', function (PruneExpiredAccessIdentities $prune) {
    $result = $prune->handle();
    $this->info(sprintf(
        'Retention cleanup completed: identities=%d groups=%d',
        $result['identities'],
        $result['groups'],
    ));
})->purpose('Delete access identities and owned data after 30 days without an accepted mutation');

Schedule::command('app:prune-expired-identities')
    ->dailyAt('03:17')
    ->withoutOverlapping();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
