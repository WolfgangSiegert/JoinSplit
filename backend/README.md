# JoinSplit backend

Laravel 13 application API for the JoinSplit local-first beta, backed by
PostgreSQL and verified with Pest.

See [local development](../docs/engineering/local-development.md) for runtimes,
environment setup, the isolated test database, startup and verification.

With PostgreSQL running and local environment files configured:

```sh
composer install
php artisan migrate
composer test
composer dev
```

The API supports anonymous Access Identity mutations, Account sessions and
workspace hydration, Group lifecycle, Participant, Expense and Settlement
management, Account People, preferences, password management and explicit
local-data adoption. Balance Calculation and Settlement Proposals are derived
domain behavior and are not persisted as separate records.

The machine-readable [OpenAPI description](../docs/api/openapi.json) can be
imported into Postman. Its companion [API guide](../docs/api/README.md) explains
anonymous credentials, Account cookies, CSRF and optimistic revision headers.

JoinSplit uses focused models and migrations for Accounts, Access Identities,
Groups, Participants, Expenses, Expense Shares, Settlements and Account People.
PostgreSQL connectivity is configured for separate local development and test
databases, and destructive test setup is guarded against the development
database.
