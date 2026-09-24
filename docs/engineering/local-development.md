# Local development

## Current scope

`backend/` contains the Laravel 13/PostgreSQL API and Pest tests. `frontend/`
contains the Nuxt 4 application, TypeScript domain logic, Pinia runtime state,
IndexedDB persistence, Vitest tests and Playwright/axe browser integration.

The completed M2 Core includes:

- anonymous Access Identity and local-first Group creation,
- durable Groups, Participants, Expenses, ExpenseShares, settings and pending
  mutations,
- Participant management,
- Expense CRUD with deterministic Equal Split,
- derived Participant balances and balance details,
- ordered synchronization of local mutations to Laravel/PostgreSQL.

The current M3 implementation additionally includes recorded Settlement CRUD
and the deterministic Settlement Proposal. The minimum-transfer proposal and
Statement Snapshots are not implemented yet.

## Runtimes

The repository currently targets:

| Runtime | Version source |
| --- | --- |
| Node 24 | `frontend/.nvmrc` and `frontend/package.json` |
| pnpm 8.10.5 | `frontend/package.json` |
| PHP 8.5 | `backend/composer.json` and CI |
| Composer 2 | CI setup |
| PostgreSQL 18 | local setup and CI service |

Use `nvm use` before frontend commands. Do not update runtime or dependency
versions as a side effect of unrelated work.

## Local PostgreSQL

The verified local setup uses separate databases and non-superuser roles:

| Purpose | Database | Role | Connection |
| --- | --- | --- | --- |
| Development | `joinsplit_dev` | `joinsplit_dev` | `127.0.0.1:5432` |
| Test | `joinsplit_test` | `joinsplit_test` | `127.0.0.1:5432` |

The test role must not be able to connect to the development database. This
separation protects against accidental destructive test setup; local trust
authentication is not a production security configuration.

For a fresh local PostgreSQL 18 cluster, create the roles and databases once as
the cluster owner:

```sql
CREATE ROLE joinsplit_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE joinsplit_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE joinsplit_dev OWNER joinsplit_dev;
CREATE DATABASE joinsplit_test OWNER joinsplit_test;
REVOKE ALL ON DATABASE joinsplit_dev FROM PUBLIC;
REVOKE ALL ON DATABASE joinsplit_test FROM PUBLIC;
```

## Backend setup

From the repository root:

```sh
cd backend
composer install
cp .env.example .env
cp .env.example .env.testing
php artisan key:generate
php artisan key:generate --env=testing
```

Configure `.env` for `joinsplit_dev`. Configure `.env.testing` for
`APP_ENV=testing`, database `joinsplit_test` and role `joinsplit_test`. Both files
are ignored by Git; never commit application keys or credentials.

Prepare and run the backend:

```sh
php artisan migrate
composer test
composer dev
```

Laravel listens on `http://127.0.0.1:8000`; `/up` is the health endpoint.

Pest forces the PostgreSQL test connection through `phpunit.xml`. The base test
case refuses to run unless Laravel resolves the testing environment, database
and role exactly as expected. Feature tests use Laravel's database reset
facilities against that isolated database.

## Frontend setup

In a separate terminal from the repository root:

```sh
cd frontend
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

Nuxt listens on `http://127.0.0.1:3000` and sends API mutations to
`http://127.0.0.1:8000` by default. Override the public API base only when needed:

```sh
NUXT_PUBLIC_API_BASE=http://127.0.0.1:8000 pnpm dev
```

Do not put credentials in this public runtime setting.

## Local browser state

The client persists its local-first state in IndexedDB database `joinsplit`,
currently at schema version 4. Rehydration completes before domain UI is shown.
Connectivity, active synchronization, form drafts and transient error/focus
state are not persisted.

For isolated development troubleshooting, IndexedDB may be deleted manually in
browser developer tools. This loses unsynchronized local data and the anonymous
Access Identity credential. It is a developer operation, not an application
recovery feature.

Multiple open tabs are not coordinated in M2. There is no BroadcastChannel,
cross-tab lock or leader election, so concurrent tabs can temporarily hold
different runtime state.

## Verification

Run frontend checks after installing dependencies:

```sh
cd frontend
pnpm test:unit
pnpm typecheck
pnpm build
pnpm exec playwright install chromium --only-shell
pnpm test:e2e
```

Vitest covers TypeScript domain, persistence orchestration and synchronization
units. Strict typechecking covers the Nuxt application and test sources.
Playwright starts the built Nuxt server plus a real Laravel test server and uses
real IndexedDB and PostgreSQL. Browser tests include axe checks for the selected
WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags; automated axe results are not a complete
accessibility conformance assessment.

Before Playwright runs `migrate:fresh`, a dedicated guard verifies
`APP_ENV=testing`, database `joinsplit_test` and role `joinsplit_test`. Never
redirect the browser suite to the development database.

Run backend checks separately:

```sh
cd backend
composer test
```

## Continuous integration

`.github/workflows/ci.yml` runs for pushes and pull requests targeting `main`.
The existing verification job performs:

1. frozen pnpm dependency installation,
2. Vitest unit tests,
3. strict TypeScript checks,
4. Nuxt production build,
5. Composer dependency installation,
6. Pest against the PostgreSQL 18 service,
7. Playwright/axe browser integration with the database safety guard.

Generated dependencies, build output, local environments, browser reports and
logs are ignored by Git.
