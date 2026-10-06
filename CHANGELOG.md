# Changelog

JoinSplit uses GitHub Releases as its canonical published changelog. Release
Please maintains new version sections in this file from Conventional Commits.
A section is a released version only when a matching Git tag exists.

- [All GitHub releases](https://github.com/WolfgangSiegert/JoinSplit/releases)
- [Retrospective changelog before automation](docs/releases/pre-automation-changelog.md)
- [Detailed version and milestone history](docs/releases/version-history.md)
- [Current development history](https://github.com/WolfgangSiegert/JoinSplit/commits/main)

## v0.1.0-beta.1 — 2026-09-26

First public, clearly labelled beta showcase.

### Added

- Project foundations for Nuxt 4, Vue 3, TypeScript, Laravel, PostgreSQL, Pest,
  Playwright and automated accessibility checks.
- Local-first group creation with anonymous access identity and queued Laravel
  synchronization.
- IndexedDB persistence for groups, participants, expenses and pending changes.
- Participant management, expense CRUD, equal split and participant balances.
- Deterministic settlement proposals, minimum-transfer proposals, recorded
  settlement payments and statement snapshots.
- Group archive/reactivation, local reset and preservation of readable history.
- Mobile-first responsive interface, dark mode, accessible navigation, branded
  application icon and introductory landing experience.
- Public beta boundaries, data-safety disclosures, minimal production access
  logging and zero-cost Render/Neon deployment configuration.

### Fixed and hardened

- Hardened core expense, balance and settlement workflows with domain and browser
  tests.
- Enforced verified Neon TLS configuration and direct migration connectivity.
- Integrated the redesigned frontend flows and accessible back-navigation
  labels into the production candidate.

### Known beta boundary

- The release supported browser-local anonymous use only; it had no accounts or
  cross-device recovery.
- It was intended for fictional, non-sensitive showcase data, not real financial
  records or production-critical collaboration.
- Free hosting could introduce cold starts and provided no SLA.

See the [release record](docs/releases/v0.1.0-beta.1.md), the
[GitHub Release](https://github.com/WolfgangSiegert/JoinSplit/releases/tag/v0.1.0-beta.1)
and the [full retrospective history](docs/releases/version-history.md).
