<?php

pest()->extend(Tests\TestCase::class)->in('Feature');

function registerAccessIdentityForTest(string $identityId, string $credential): void
{
    test()->withHeaders([
        'X-Access-Identity-ID' => $identityId,
        'Authorization' => "Bearer {$credential}",
        'Accept' => 'application/json',
    ])->postJson('/api/access-identities')->assertSuccessful();
}
