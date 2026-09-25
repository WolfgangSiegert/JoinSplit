<?php

it('keeps the deployment template explicit and manually triggered', function () {
    $specification = file_get_contents(dirname(__DIR__, 3).'/.do/app.yaml');

    expect($specification)
        ->not->toBeFalse()
        ->and(substr_count($specification, 'deploy_on_push: false'))->toBe(3)
        ->and($specification)->not->toContain('deploy_on_push: true')
        ->and($specification)->toContain('cluster_name: CHANGE_ME_EXISTING_POSTGRESQL_CLUSTER')
        ->and(substr_count($specification, 'value: CHANGE_ME_APP_KEY'))->toBe(2)
        ->and(substr_count($specification, 'value: CHANGE_ME_BASE64_STANDARD_EDITION_CA'))->toBe(2)
        ->and($specification)->toContain('value: ${joinsplit-db.DATABASE_PRIVATE_URL}')
        ->and($specification)->toContain("kind: PRE_DEPLOY")
        ->and($specification)->toContain("http_path: /ready")
        ->and($specification)->toContain("http_path: /health");

    $api = strpos($specification, 'prefix: /api');
    $up = strpos($specification, 'prefix: /up');
    $ready = strpos($specification, 'prefix: /ready');
    $frontend = strrpos($specification, 'prefix: /');

    expect($api)->toBeLessThan($up)
        ->and($up)->toBeLessThan($ready)
        ->and($ready)->toBeLessThan($frontend);
});
