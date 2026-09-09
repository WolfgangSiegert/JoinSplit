# Local development — JS-008

## Scope

`backend/` contains Laravel 13 and Pest. `frontend/` contains Nuxt 4, Vue,
TypeScript strict, Pinia, Nuxt UI, Tailwind CSS 4, Vitest, Playwright and axe.
There are no JoinSplit domain models, domain migrations, API operations,
identity handling, offline storage or Create Group screens yet.

The default User/account model, user provider and all three scaffold migrations
are removed. There are no application migrations or seeded application data.
Sessions and cache use files; queues run synchronously, so none requires tables.

## Runtimes

Verified on this Mac:

| Runtime | Version |
| --- | --- |
| Node, existing nvm | 24.20.0 |
| npm, bundled with Node; not used for dependency installation | 11.19.0 |
| pnpm, existing Homebrew installation | 8.10.5 |
| PHP, Homebrew | 8.5.10 |
| Composer, Homebrew | 2.10.3 |
| PostgreSQL, Homebrew `postgresql@18` | 18.6 |

Node 24 is selected by `frontend/.nvmrc`; activate it with `nvm use` whenever
opening a frontend terminal. Other projects' Node versions were not replaced.
pnpm was not upgraded. PHP has PDO, pdo_pgsql and pgsql enabled by its formula;
no manual extension installation or php.ini editing was required.

Homebrew installation used `brew install composer postgresql@18`; Composer
brought PHP and its required libraries. The preceding update migrated old
Homebrew catalogs and installed pkgconf 3.0.7, but its linking conflicted with
the existing pkg-config 0.29.2_3 symlinks. That unrelated linking conflict was
left unresolved. Installation and all application checks succeeded afterward.

## Local PostgreSQL

Only the formula-created default cluster is used:
`/opt/homebrew/var/postgresql@18`. It was started with `pg_ctl`, without a
login service. To start it again after stopping it or restarting the machine:

```sh
/opt/homebrew/opt/postgresql@18/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@18 \
  -l /opt/homebrew/var/log/postgresql@18.log start
```

To stop this cluster when no application needs it:

```sh
/opt/homebrew/opt/postgresql@18/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@18 stop
```

| Purpose | Database | Role | Connection |
| --- | --- | --- | --- |
| Development | joinsplit_dev | joinsplit_dev | 127.0.0.1:5432 |
| Test | joinsplit_test | joinsplit_test | 127.0.0.1:5432 |

Both roles are non-superusers, cannot create roles or databases, and own only
their corresponding JoinSplit database. PUBLIC access was revoked on these two
databases. The test role's connection to the development database was explicitly
verified to fail.

Homebrew initialized local connections with trust authentication. No database
passwords or production credentials were created, and no authentication config
was changed. This is a local development setup: role separation protects against
accidental test access, not impersonation by other local processes under trust
authentication. It is not a production security configuration.

For a fresh default cluster only, create the same roles/databases once using
the cluster owner's `psql -d postgres` connection:

```sql
CREATE ROLE joinsplit_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE joinsplit_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE joinsplit_dev OWNER joinsplit_dev;
CREATE DATABASE joinsplit_test OWNER joinsplit_test;
REVOKE ALL ON DATABASE joinsplit_dev FROM PUBLIC;
REVOKE ALL ON DATABASE joinsplit_test FROM PUBLIC;
```

## Backend

From the canonical repository root:

```sh
cd backend
composer install
```

On this machine `.env` and `.env.testing` already exist, have separate generated
application keys, and are ignored by Git. For a fresh checkout, copy
`.env.example` to each file. In `.env.testing`, set `APP_ENV=testing`,
`DB_DATABASE=joinsplit_test` and `DB_USERNAME=joinsplit_test`. Then generate keys:

```sh
php artisan key:generate
php artisan key:generate --env=testing
```

Keep all real credentials and application keys in ignored environment files.
`.env.example` contains no secrets. Local environments and configuration defaults
use `SESSION_DRIVER=file`, `CACHE_STORE=file` and `QUEUE_CONNECTION=sync`.
Start development and run checks with:

```sh
php artisan migrate
composer test
composer dev
```

Laravel listens on `http://127.0.0.1:8000`. `/` is a minimal landing page and
`/up` is Laravel's standard health endpoint. No backend Node/Vite build is needed.

Pest uses the official Laravel plugin. PHPUnit configuration forces the local
PostgreSQL test database and role, clears a connection URL override, and uses
in-memory cache/session drivers. The base test case refuses a wrong database or
role before tests run. `composer test` clears cached
application configuration first. The smoke tests only read the test database; no reset is needed because there
are no application migrations or database writes.

Console output mocking is disabled using Laravel's built-in option, so these
smoke tests do not require a direct Mockery dependency.
Future mock-based tests or factories may need separately approved packages.

## Frontend

From the canonical repository root, in a separate terminal:

```sh
cd frontend
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

Nuxt listens on `http://127.0.0.1:3000`. The page contains only a heading and a
short introductory sentence. Pinia is registered without a speculative store.
Nuxt UI registers the Tailwind 4 Vite plugin itself; it is not registered twice.
CSS imports Tailwind and Nuxt UI. Automatic web fonts, color-mode integration,
Nuxt devtools and telemetry are disabled for this minimal bootstrap.

```sh
pnpm test:unit
pnpm typecheck
pnpm build
pnpm exec playwright install chromium --only-shell
pnpm test:e2e
```

The typecheck covers the Nuxt application, Vitest configuration/unit tests and
Playwright configuration/tests.
TypeScript 6 is deliberately bounded to its major version. `vue-tsc` is the
additional direct development dependency approved during JS-008.

Vitest handles frontend unit tests and, when needed, Nuxt-focused tests.
`pnpm test:unit` runs the single replaceable TypeScript runner smoke test under
`test/unit/` in Node without starting Nuxt. `test/nuxt/` is reserved for future
Nuxt-runtime tests; no runtime project or DOM dependencies are configured yet.
`@nuxt/test-utils` is installed for that future concrete need. Playwright + axe
cover real-browser/E2E and accessibility checks; Pest covers backend/API and
persistence tests.

Playwright starts the previously built production server on
`http://127.0.0.1:3100` and shuts it down afterward. A conflicting server is not
reused. Only Chromium's headless shell was installed, with Playwright's required
support binary; no Firefox or WebKit was installed. Build before running E2E
tests after application changes.

The single browser smoke test verifies HTTP success, title, heading, Vue mounting,
no uncaught page errors and zero axe violations for WCAG 2 A/AA, 2.1 A/AA and
2.2 AA tags. This is not a complete accessibility conformance assessment.

## Verification at bootstrap

- Laravel 13.31.0: HTTP 200 for `/` and `/up`.
- PostgreSQL: both local JoinSplit databases were reset to the empty migration
  set. Only Laravel migration bookkeeping remains; all user/session/cache/queue
  scaffold tables are removed. Development and test databases remain separate;
  the test role cannot connect to the development database.
- Pest 4.7.8 with Laravel plugin 4.1.0: two tests, five assertions passed.
- Nuxt 4.5.2: development server and production build passed.
- Vitest 5.0.0: one pure TypeScript smoke test passed in the Node unit project.
- Strict application, Vitest and browser-test typechecks passed.
- pnpm frozen-lockfile installation passed without upgrading pnpm.
- Chromium: one smoke test passed; axe reported no violations in that test.

There is no CI, nested Git repository, workspace manager or publishing setup.
Generated dependencies, output, test reports and local environments are ignored.
No files were staged or committed during the bootstrap.
