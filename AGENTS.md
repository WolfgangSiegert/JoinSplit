# JoinSplit agent guide

## Read first

- Treat this repository and its `docs/` tree as the technical source of truth.
- Read only the documentation relevant to the current task:
  - `docs/product/` — product scope and requirements
  - `docs/engineering/` — engineering practices and delivery guidance
  - `docs/architecture/` — architecture decisions and system boundaries
  - `docs/ai/` — agent briefs, AI conventions, and handoffs

## Stack

- Frontend: Nuxt 4, Vue 3, TypeScript strict, Pinia, Tailwind CSS 4, Nuxt UI, pnpm.
- Backend: PHP, Laravel, PostgreSQL, Laravel MVC, Composer, Pest.
- Quality: Playwright, axe-core, with WCAG 2.2 AA as the primary accessibility conformance target.
  See `docs/engineering/principles.md` for the full Accessibility requirements.

## Guardrails

- Build web first and mobile first.
- Future PWA/native distribution may use Capacitor; do not install or configure it yet.
- Choose the smallest understandable solution. Add no unnecessary abstractions or dependencies.
- Keep business logic out of Laravel controllers.
- Keep business logic out of Vue components.
- Keep Nuxt framework-native rather than forcing MVC onto the frontend.
- Laravel remains the canonical application API.
- Avoid unnecessary dependency on Nuxt server-only functionality for core product behavior.
- Do not duplicate server state in Pinia without a concrete reason.
- The public source repository and its `origin` remote already exist. Do not
  create or replace repositories or remotes.
- Commits, integration, pushes and pull requests require explicit human approval
  for that specific step. Approval for one step does not imply approval for the
  next publishing step.
- Never force-push or rewrite published history unless the human explicitly
  authorizes that exact operation.
- Do not install Laravel, Nuxt, Capacitor, PWA tooling, or any dependencies until explicitly requested.
- Do not create speculative files or application code.

## Context efficiency

- Keep prompts task-focused.
- Read only task-relevant documentation.
- Do not restate the entire project context in every task.
- Put durable decisions in focused files under `docs/`.
- Keep this file short.

## Agent workflow

- Work only within the stated goal, scope, constraints, and acceptance criteria.
- Preserve existing user changes.
- Do not silently expand scope.
- Disclose assumptions, deviations, risks, and checks performed.
- Keep completion reports compact:
  - Outcome
  - Files changed
  - Checks
  - Decisions
  - Risks
