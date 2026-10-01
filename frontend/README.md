# JoinSplit frontend

Nuxt 4, Vue 3 and strict TypeScript client for JoinSplit. The same application
code powers the responsive web app, the bounded PWA distribution and the
Capacitor iOS/Android development projects.

Use the repository's [local development guide](../docs/engineering/local-development.md)
for PostgreSQL, Laravel and end-to-end setup. This file is the short frontend
entry point rather than a duplicate of that guide.

## Setup and development

The supported runtime and package manager are declared in `.nvmrc` and
`package.json`.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

Nuxt listens on `http://127.0.0.1:3000` and uses
`http://127.0.0.1:8000` as its default Laravel API origin. A different public
API base can be supplied for a local session without placing secrets in it:

```sh
NUXT_PUBLIC_API_BASE=http://127.0.0.1:8000 pnpm dev
```

## Verification

```sh
pnpm test:unit
pnpm typecheck
pnpm build
pnpm test:e2e
```

The Playwright suite requires the isolated PostgreSQL test database, backend
environment and Chromium installation described in the
[local development guide](../docs/engineering/local-development.md). Unit tests
use Vitest; browser tests include axe-core checks but do not constitute a full
accessibility audit.

## Structure and state boundaries

- `app/pages` and `app/components` contain Nuxt/Vue presentation.
- `app/domain` contains client-side domain behavior shared by web and native
  builds.
- `app/composables` coordinates focused workflows and local UI behavior.
- `app/stores` contains shared runtime state in Pinia.
- `app/persistence` owns durable IndexedDB state and schema migrations.
- `app/services` owns Laravel API, Account and synchronization boundaries.
- `test/unit` contains Vitest tests; `tests` contains Playwright flows.
- `server` contains the small Nuxt server boundary used by the web
  distribution; core domain behavior must not depend on it.

Pinia is runtime application state, IndexedDB is durable client state, and
Laravel/PostgreSQL becomes the canonical server representation after a
successful synchronization. Account session cookies remain HttpOnly and are
not copied into IndexedDB or localStorage.

The durable-state contract is documented in
[local persistence](../docs/architecture/local-persistence.md). API request,
credential, CSRF and revision contracts are documented in the
[API guide](../docs/api/README.md).

## PWA and native targets

The normal web build retains the bounded PWA behavior. The native build emits a
deterministic static artifact, excludes the PWA Service Worker and install UI,
and is copied into the versioned Capacitor platform projects:

```sh
pnpm build:native
pnpm native:sync
pnpm native:open:ios
pnpm native:open:android
```

Do not add a Capacitor plugin, platform permission or remote `server.url`
without a concrete approved use case. Build commands are not proof of native
runtime behavior. Current commands, platform requirements and remaining iOS /
Android evidence limits are maintained in
[native development](../docs/engineering/native-development.md) and the
[native distribution contract](../docs/architecture/native-distribution.md).
