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
        'X-CSRF-TOKEN',
        'X-Group-Revision',
        'X-Mutation-ID',
    ],
    'exposed_headers' => ['X-Group-Revision'],
    'max_age' => 0,
    'supports_credentials' => true,
];
