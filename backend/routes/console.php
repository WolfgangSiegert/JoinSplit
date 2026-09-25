<?php

use App\Support\ProductionConfiguration;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('app:validate-production-config', function (ProductionConfiguration $configuration) {
    $configuration->ensureValid();
    $this->info('Production configuration is valid.');
})->purpose('Validate production configuration without exposing values');

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
