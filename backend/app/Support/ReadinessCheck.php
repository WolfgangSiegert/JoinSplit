<?php

namespace App\Support;

use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReadinessCheck
{
    public function __construct(
        private Migrator $migrator,
        private ProductionConfiguration $productionConfiguration,
    ) {}

    public function passes(): bool
    {
        try {
            if (config('app.env') === 'production' && $this->productionConfiguration->errors() !== []) {
                return false;
            }
            DB::selectOne('select 1');
            if (! $this->migrator->repositoryExists()) {
                return false;
            }

            $expected = array_keys($this->migrator->getMigrationFiles(database_path('migrations')));
            $ran = $this->migrator->getRepository()->getRan();

            return array_diff($expected, $ran) === [];
        } catch (Throwable $exception) {
            report($exception);

            return false;
        }
    }
}
