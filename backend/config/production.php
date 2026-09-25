<?php

return [
    'validate' => env('JOIN_SPLIT_VALIDATE_PRODUCTION', false),
    'canonical_origin' => env('JOIN_SPLIT_CANONICAL_ORIGIN'),
    'trusted_proxies' => env('TRUSTED_PROXIES'),
];
