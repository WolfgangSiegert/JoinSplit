# M6.5 Navigation and People integration evidence

Status: local release candidate, 2026-09-27

This document records the JS-063 integration boundary. It is evidence for the
current showcase scope, not a production-readiness or backup/SLA claim.

## Integrated behavior

- `/` remains the permanent landing page and exposes the stable `#gruppen`
  selector anchor.
- The global header exposes New Group, People and Account actions in local and
  authenticated states.
- People remain durable local-first records and are synchronized only for an
  authenticated Account.
- Adding a Person to a Group creates a separate Participant with a stable ID.
- An existing Participant can be explicitly linked to or unlinked from a
  Person. Neither operation changes the Participant name or financial history.
- Anonymous associations remain local. Authenticated association changes use
  the Group revision and idempotency boundary.
- Hard Person deletion names the target, requires explicit confirmation and is
  blocked while a Participant or pending Person mutation references it.

## Migration and privacy boundary

IndexedDB schema v10 adds People and pending Person mutations without deriving
People from existing Participant names. Automated upgrades cover v1, v2 and v3
records through v10 and retain the existing Group, Participant, Expense,
ExpenseShare, Settlement and settings data.

Account logout and Account deletion continue to use the existing protected
local cleanup boundary. No Account credential or session token is stored in
IndexedDB or localStorage.

## Automated evidence

The following checks passed on 2026-09-27:

- backend: 150 Pest tests, 1100 assertions;
- frontend domain and integration: 264 Vitest tests;
- strict Nuxt/TypeScript application typecheck;
- separate test TypeScript typecheck;
- Nuxt production build including the PWA artifacts;
- Chromium E2E: 69 scenarios including Account lifecycle, schema upgrades,
  offline queues, Participant/Person association and the financial workflows;
- focused 320-CSS-pixel navigation and anchor test;
- automated axe WCAG 2.0/2.1 A/AA and WCAG 2.2 AA scan for that narrow landing
  state;
- `git diff --check`.

## Deliberate limits

- Equal display names never cause automatic identity matching.
- Renaming does not propagate between Person and Participant.
- People without an Account remain device-local.
- Collaboration, invitations, native packaging and production-grade recovery
  remain outside M6.5.
- Automated accessibility checks do not replace a later manual assistive-
  technology review if the showcase is promoted toward production readiness.
