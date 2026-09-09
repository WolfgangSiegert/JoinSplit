# JoinSplit backend

Minimal Laravel 13 API foundation with PostgreSQL and Pest.

See [local development](../docs/engineering/local-development.md) for runtimes,
environment setup, the isolated test database, startup and verification.

With PostgreSQL running and local environment files configured:

```sh
composer install
php artisan migrate
composer test
composer dev
```

Laravel's default User/account model, user provider and all default scaffold
migrations (users, sessions, cache and queues) have been removed. There are
currently no JoinSplit application or domain migrations.
PostgreSQL connectivity is configured for separate local development and test
databases. Migrations will be added only when required by JoinSplit functionality.
No JoinSplit domain functionality or account flow is implemented.
