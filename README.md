# JoinSplit

JoinSplit helps small groups keep shared expenses, cost allocation, balances,
and settlements understandable without requiring accounting software or an
account before getting started.

## Current status

The M2 Core milestone and the M3 Joining & Settlement feature work are complete.
JoinSplit currently supports:

- accountless local-first Group creation,
- durable browser state and pending-mutation recovery after reload,
- Participant add, rename, deactivate and eligible delete operations,
- Expense create, edit and delete with deterministic Equal Split,
- derived Participant balances and traceable balance details,
- recorded Settlement create, edit and delete with immediate balance updates,
- deterministic and exact minimum-transfer read-only Settlement Proposals,
- offline Participant Statement Snapshots with immutable text preview, copy and
  optional platform sharing,
- Group archive, reactivation and eligible hard-delete lifecycle,
- synchronization through the Laravel API to PostgreSQL.

The automated checks cover domain rules in TypeScript and PHP, API and database
behavior, IndexedDB upgrades, browser integration and automated accessibility
checks. Recorded Settlements, both Settlement Proposal strategies and runtime
Statement Snapshots are implemented.

## Product direction

M3 hardening covers the complete financial workflow across local persistence,
the Laravel API and PostgreSQL. Once the application has loaded, its
single-owner core workflow remains usable without an API connection and queues
changes for later synchronization. The current release has no Service Worker
and does not guarantee a first load or restart while offline.

M4 prepares a public portfolio demo rather than a production-ready financial
service. Its approved release and data-handling boundary is documented in the
[portfolio demo contract](docs/product/portfolio-demo.md). The corresponding
production operating requirements live in the
[production operations contract](docs/engineering/production-operations.md).
The planned canonical application URL is `https://joinsplit.tiny-bits.org`,
with a project entry on `https://tiny-bits.org`; these links are targets and do
not claim that the release is live yet.

See the [product vision](docs/product/vision.md) and
[MVP scope](docs/product/mvp.md) for the canonical product direction.

## Stack

- **Frontend:** Nuxt 4, Vue 3, TypeScript, Pinia, Tailwind CSS 4, Nuxt UI
- **Backend:** Laravel, PHP, PostgreSQL, Pest
- **Quality:** Vitest, Playwright, axe-core, with WCAG 2.2 AA as the accessibility target

## Architecture

- Laravel is the canonical application API.
- The workflow is accountless-first and local-first; this does not imply that
  submitted names or financial data are anonymous.
- Pending Mutations synchronize local changes to the server.
- A Participant is not an Access Identity.
- Business logic belongs in neither controllers nor components.
- Pinia holds runtime application state, while IndexedDB durably stores the
  local identity, Groups, Participants, Expenses, ExpenseShares, Settlements,
  settings and pending mutations.
- Equal Split and Balance Calculation are implemented independently in
  TypeScript and PHP against shared test vectors.

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
- [Portfolio demo contract](docs/product/portfolio-demo.md)
- [Domain model](docs/architecture/domain-model.md)
- [Local development](docs/engineering/local-development.md)
- [Production operations contract](docs/engineering/production-operations.md)

## AI-assisted development

AI-assisted development is part of this project's learning and showcase
workflow. Responsibilities, review expectations, and safeguards are documented
in the [AI development workflow](docs/ai/workflow.md).

## Repository

The source repository is public at
[WolfgangSiegert/JoinSplit](https://github.com/WolfgangSiegert/JoinSplit).
Commits, integration, pushes and pull requests still require explicit human
approval for the corresponding step.

## License

JoinSplit is licensed under the [MIT License](LICENSE).
