<?php

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => [env('JOIN_SPLIT_CLIENT_ORIGIN', env('APP_URL', 'http://localhost'))],
    'allowed_origins_patterns' => [],
    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'X-Access-Identity-ID',
    ],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
