<?php

it('keeps the zero-cost Render and Neon showcase deployment explicit and manually triggered', function () {
    $specification = file_get_contents(dirname(__DIR__, 3).'/render.yaml');

    expect($specification)->not->toBeFalse()
        ->and($specification)->toContain('region: frankfurt')
        ->and($specification)->toContain('healthCheckPath: /up')
        ->and(substr_count($specification, 'autoDeployTrigger: off'))->toBe(1)
        ->and($specification)->toContain('type: web')
        ->and($specification)->toContain('plan: free')
        ->and($specification)->toContain('JOIN_SPLIT_COMBINED_SERVICE')
        ->and($specification)->not->toContain('type: pserv')
        ->and($specification)->not->toContain('type: cron')
        ->and(substr_count($specification, 'sync: false'))->toBe(3)
        ->and($specification)->not->toContain('generateValue: true')
        ->and($specification)->toContain("- key: DB_POOLED\n        value: \"true\"")
        ->and($specification)->toContain('- key: DB_DIRECT_HOST')
        ->and($specification)->toContain('value: verify-full')
        ->and($specification)->toContain('value: /etc/ssl/certs/ca-certificates.crt')
        ->and($specification)->not->toContain('postgresql://')
        ->and($specification)->not->toContain('deploy_on_push: true');
});

it('keeps Laravel routes out of the internal Nuxt proxy', function () {
    $apacheConfiguration = file_get_contents(dirname(__DIR__, 2).'/docker/joinsplit.conf');

    expect($apacheConfiguration)->not->toBeFalse()
        ->and($apacheConfiguration)->toContain('ProxyPass /index.php !')
        ->and($apacheConfiguration)->toContain('ProxyPass /api !')
        ->and($apacheConfiguration)->toContain('ProxyPass /up !')
        ->and($apacheConfiguration)->toContain('ProxyPass /ready !');
});
