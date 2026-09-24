# JoinSplit backend

Laravel 13 API for the JoinSplit local-first M2 Core, backed by PostgreSQL and
verified with Pest.

See [local development](../docs/engineering/local-development.md) for runtimes,
environment setup, the isolated test database, startup and verification.

With PostgreSQL running and local environment files configured:

```sh
composer install
php artisan migrate
composer test
composer dev
```

The API currently supports anonymous Access Identity verification, Group
creation, Participant management and Expense CRUD with Equal Split. Balance
Calculation is implemented as a tested domain service; balances remain derived
and do not have a persistence table or read endpoint in M2.

Laravel's default User/account model, user provider and default scaffold
migrations for users, sessions, cache and queues have been removed. JoinSplit
uses focused migrations for Access Identities, Groups, Participants, Expenses
and ExpenseShares. PostgreSQL connectivity is configured for separate local
development and test databases, and destructive test setup is guarded against
the development database.
