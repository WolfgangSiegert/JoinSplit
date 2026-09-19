# JoinSplit

JoinSplit helps small groups keep shared expenses, cost allocation, balances,
and settlements understandable without requiring accounting software or an
account before getting started.

## Current status

The M1 Walking Skeleton is complete. Create Group works local-first, with an
anonymous Access Identity and synchronization through Nuxt, Laravel, and
PostgreSQL. Offline creation, failure handling, and retry paths are covered.

M1 client state is still memory-only and is lost on reload. The complete MVP is
not finished: participant management, shared expenses, balances, settlement
proposals, settlements, and Statement Snapshots are product direction rather
than completed features.

## Product direction

The intended MVP supports Participants, shared Expenses with Equal Split,
Balances, settlement proposals, recorded settlements, and a shareable Statement
Snapshot. The full single-owner workflow is intended to work Offline First.
These capabilities describe the planned MVP, not the current implementation.

See the [product vision](docs/product/vision.md) and
[MVP scope](docs/product/mvp.md) for the canonical product direction.

## Stack

- **Frontend:** Nuxt 4, Vue 3, TypeScript, Pinia, Tailwind CSS 4, Nuxt UI
- **Backend:** Laravel, PHP, PostgreSQL, Pest
- **Quality:** Vitest, Playwright, axe-core, with WCAG 2.2 AA as the accessibility target

## Architecture

- Laravel is the canonical application API.
- The workflow is anonymous-first and local-first.
- Pending Mutations synchronize local changes to the server.
- A Participant is not an Access Identity.
- Business logic belongs in neither controllers nor components.
- M1 keeps client identity, domain state, settings, and pending operations only in memory.

The durable details live in the
[domain model](docs/architecture/domain-model.md),
[anonymous-access design](docs/architecture/anonymous-access.md), and
[engineering principles](docs/engineering/principles.md).

## Local development

The frontend and backend have separate dependency and development commands and
use distinct local development and test databases. Follow the verified
[local development guide](docs/engineering/local-development.md) for setup.

## Tests

Run the existing checks from their respective application directories:

```sh
cd frontend
pnpm test:unit
pnpm typecheck
pnpm build
pnpm test:e2e

cd ../backend
composer test
```

Playwright expects a completed frontend build, its Chromium browser install,
and the isolated PostgreSQL test setup documented in the local development
guide.

## Project documentation

- [Product vision](docs/product/vision.md)
- [MVP scope](docs/product/mvp.md)
- [MVP UX flow](docs/product/ux-flow.md)
- [Domain model](docs/architecture/domain-model.md)
- [Local development](docs/engineering/local-development.md)

## AI-assisted development

AI-assisted development is part of this project's learning and showcase
workflow. Responsibilities, review expectations, and safeguards are documented
in the [AI development workflow](docs/ai/workflow.md).

## License

JoinSplit is licensed under the [MIT License](LICENSE).
