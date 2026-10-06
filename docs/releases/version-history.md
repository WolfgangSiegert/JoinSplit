# JoinSplit version and milestone history

## How to read this history

The Git tag is the authoritative product version. When automated release
management was introduced on 2026-10-05, JoinSplit had one tagged release:
`v0.1.0-beta.1`. Later milestones had been implemented on `main` and parts of
them deployed to the evolving public beta, but they had not been given separate
version tags. They are recorded below as development milestones, not
retrospectively invented releases.

Future entries should distinguish three states:

- **Released:** an immutable `vMAJOR.MINOR.PATCH` Git tag and GitHub Release
  exist.
- **Deployed milestone:** production evidence exists, but no separate product
  version was published.
- **Development milestone:** implementation exists in Git; deployment must not
  be inferred from Git history alone.

## Release baseline before automation

| Version | Date | Commit | Status | Summary |
| --- | --- | --- | --- | --- |
| `v0.1.0-beta.1` | 2026-09-26 | `da85d24` | Released | First public local-first beta showcase with groups, participants, expenses, balances, settlements and synchronized server aggregates. |

Future canonical versions and their generated notes are maintained in
`CHANGELOG.md` and GitHub Releases. This document preserves retrospective
milestone context and is deliberately not a second release ledger. The
commit-derived scope of all work before automation is recorded in
[`pre-automation-changelog.md`](pre-automation-changelog.md).

## Retrospective development milestones

### Foundations — 2026-09-08 to 2026-09-09

Boundary commits: `a10c7d3` through `050757c` (inclusive).

- Established repository, engineering and product foundations.
- Recorded the anonymous-access architecture.
- Bootstrapped the Nuxt/Laravel/PostgreSQL toolchain.

Status: development foundation, not a product release.

### M1: Walking skeleton and group synchronization — 2026-09-16 to 2026-09-19

Boundary commits: `c20350d` through `430c71c` (inclusive).

- Defined the first UX flow and wireframes.
- Implemented local-first group creation.
- Added the Laravel create-group slice and client synchronization.
- Prepared the public repository structure.

Status: development milestone, not a tagged release.

### M2: Persistent core expense workflows — 2026-09-23 to 2026-09-24

Boundary commits: `2e3d6c9` through `ae66c45` (inclusive).

- Added IndexedDB-backed application persistence.
- Implemented participant management.
- Implemented expense CRUD, equal splitting and balance calculation.
- Hardened the core flows with automated tests.

Status: development milestone, not a tagged release.

### M3: Settlements and lifecycle — 2026-09-24

Boundary commits: `ff6bf14` through `e9f6f56` (inclusive).

- Defined settlement contracts and deterministic algorithms.
- Added settlement payment management and two proposal strategies.
- Added statement snapshots and group archive/reactivation behavior.
- Hardened settlement workflows and financial invariants.

Status: development milestone, not a tagged release.

### M4: Public beta showcase — 2026-09-25 to 2026-09-26

Boundary commits: `0561448` through `da85d24` (inclusive).

- Defined the public portfolio and data-safety boundary.
- Prepared and verified the combined Render/Neon deployment.
- Added the public-use disclosures, visual redesign, branded icon, landing
  experience and beta labelling.
- Minimized production access logging and recorded release/smoke evidence.
- Published `v0.1.0-beta.1` as the first immutable product version.

Status: tagged and published release. See
[`v0.1.0-beta.1.md`](v0.1.0-beta.1.md).

### M5: Optional accounts and multi-device access — 2026-09-26

Boundary commits: `fc804c5` through `b970498` (inclusive).

- Added account registration, authentication and session handling.
- Linked anonymous browser identities to accounts.
- Added adoption of existing local groups and multi-device access.
- Preserved the accountless-first product path.

Status: implemented after `v0.1.0-beta.1`; no separate version tag. The later
production documentation describes M5 as part of the evolving beta deployment.

### M6: Installable PWA — 2026-09-26

Boundary commits: `e9bab57` through `02d7584` (inclusive).

- Added the PWA manifest, identity and bounded offline application shell.
- Added install and explicit update UX with data-safety checks.
- Verified desktop and Android installation, offline/reconnect and update flows.

Status: deployed milestone with recorded evidence, but no separate version tag.
See [`../engineering/m6-pwa-evidence.md`](../engineering/m6-pwa-evidence.md).

### M6.5 and M7 foundation: navigation, people and native packaging — 2026-09-27

Boundary commits: `40026a6` through `e39f7b7` (inclusive).

- Added global navigation and the people workspace.
- Defined the native-distribution contract.
- Added deterministic native web output and Capacitor Android/iOS foundations.
- Added native account transport and Android lifecycle verification.
- Hardened account recovery and expense-share hydration.

Status: development milestones without separate product tags. The M6.5 evidence
records a local release candidate; the native work remains a packaging
foundation rather than a native-store release.

### Mobile-first product and settings refinement — 2026-09-27 to 2026-09-30

Boundary commits: `ef826b8` through `67e8f28` (inclusive).

- Reworked mobile navigation, list discovery and compact balance actions.
- Combined participant management with clearer balance visualization.
- Added synchronization/recovery safeguards and preserved local account adoption.
- Added persisted language and navigation preferences.
- Added Material and iOS-inspired skins, configurable group start views and
  responsive landing/settings improvements.
- Refined terminology and localization across the showcase.

Status: development history after the first tagged release; no separate version
tag was created for these increments.

### Developer operations and observability — 2026-10-01

Commit: `6399720`

- Added developer documentation and the privacy-preserving operational logging
  baseline.
- Added SemVer release-note automation and the documented human release gate.

Status: development history after the first tagged release.

### Anonymous aggregate showcase usage — 2026-10-05

Commit: `3dd8ba1`

- Added an aggregate daily app-load counter without visitor identifiers,
  cookies, account association or persistent browser markers.
- Added total, seven-day and daily figures to the public demo information view.
- Documented that reloads and automated calls can affect the approximate count.

Status: `main` development history when automated release management was
introduced; not included in a newly tagged release at that point.

## Continuing this history

Release Please maintains future version sections in `CHANGELOG.md`, updates the
version state, and creates tags and GitHub prereleases after an approved release
pull request is merged. This document does not duplicate that generated ledger.

Extend this file only when a development milestone needs retrospective context
that cannot be expressed by generated release notes. Add a focused release
record only when migration, deployment or manual QA evidence needs more detail
than the GitHub Release notes.

Do not assign version numbers retroactively to untagged milestones and do not
rewrite a published tag to make the chronology appear cleaner.
