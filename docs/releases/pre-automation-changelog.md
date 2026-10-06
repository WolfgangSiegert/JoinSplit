# Retrospective changelog before Release Please

## Scope and evidence

This changelog reconstructs the committed JoinSplit work from the repository
history before Release Please became the release mechanism. It covers every
non-merge commit from `a10c7d3` through `3dd8ba1`, dated 2026-09-08 through
2026-10-05.

The reconstruction distinguishes released work from later development:

- `a10c7d3` through `da85d24` culminated in the tagged release
  `v0.1.0-beta.1`.
- `fc804c5` through `3dd8ba1` was added after that tag without another product
  version.

Commit history proves that work was committed. It does not by itself prove that
every later commit was deployed to production. Where deployment evidence exists,
the relevant evidence document is linked. No additional version numbers are
assigned retrospectively.

## `v0.1.0-beta.1` — first public beta showcase

Released on 2026-09-26 at commit `da85d24`.

### Product and domain foundation

- Established the JoinSplit product, engineering and anonymous-access
  foundations.
- Bootstrapped the Nuxt 4, Vue 3, TypeScript, Pinia, Tailwind CSS, Laravel,
  PostgreSQL, Pest and Playwright toolchain.
- Defined the initial mobile-first MVP flow and wireframes.
- Implemented browser-local group creation with anonymous identity and queued
  synchronization to the Laravel API.
- Added IndexedDB persistence for durable local application state.

### Participants, expenses and balances

- Added participant creation, renaming, activation, deactivation and guarded
  deletion behavior.
- Added expense creation, editing and deletion.
- Implemented deterministic equal splitting in smallest currency units,
  including fair remainder-cent distribution.
- Calculated and displayed participant balances from expenses and shares.
- Hardened the core workflows with frontend, backend and browser tests.

### Settlement and group lifecycle

- Defined the settlement domain contracts and algorithms.
- Added recorded settlement-payment management, separate from calculated
  proposals.
- Added deterministic greedy and exact minimum-transfer settlement proposals.
- Added participant statement snapshots for sharing and review.
- Added group archive, reactivation and guarded deletion behavior while
  preserving readable financial history.
- Hardened settlement invariants and lifecycle workflows.

### Public showcase and deployment

- Defined the public portfolio-demo boundary and fictional-data requirement.
- Added visible public-use, privacy and data-safety disclosures.
- Prepared the combined Render and Neon deployment boundary.
- Enforced effective Neon TLS and routed migrations through the direct database
  endpoint.
- Reduced production access logging.
- Added a branded application icon, introductory landing experience, clearer
  navigation cues and explicit beta labelling.
- Redesigned the visual language and settlement-proposal presentation.
- Preserved accessible back-navigation labels while integrating the redesigned
  frontend flows.
- Recorded production smoke checks and the reduced beta release gate.

### Known boundary at release

- Use was browser-local and anonymous; accounts and cross-device recovery were
  not part of this tagged version.
- The public instance was a showcase for fictional, non-sensitive data rather
  than a production financial service.
- Free hosting had no availability, durability or recovery SLA.

Evidence: [`v0.1.0-beta.1.md`](v0.1.0-beta.1.md) and
[`m4-release-evidence.md`](../engineering/m4-release-evidence.md).

## Development after `v0.1.0-beta.1`

Implemented from 2026-09-26 through 2026-10-05 in commits `fc804c5` through
`3dd8ba1`. This section is development history, not a separately tagged release.

### Optional accounts and multi-device synchronization

- Defined an account-adoption contract that kept accountless use as the primary
  starting point.
- Added account registration, login, session handling and authenticated
  workspace access.
- Linked existing anonymous browser identities to accounts.
- Added explicit adoption of existing local groups into an account.
- Added account workspace hydration on another device.
- Added synchronization and recovery safeguards for pending local changes.
- Separated account logout from deletion of the local data copy.
- Added an explicit JSON recovery export before destructive local deletion.
- Added pending-change counts, per-group synchronization details and clearer
  distinctions between offline, expired-session, validation, conflict and local
  persistence failures.
- Added reauthentication without deleting local state and made interrupted
  account adoption resumable.
- Added conflict inspection with an explicit choice between local and server
  group versions.
- Added password recovery/reset and authenticated password changing; changing a
  password invalidates other active sessions.
- Preserved expense-share ordering during account hydration.
- Fixed account adoption so local groups are retained and uploaded instead of
  being replaced by the server workspace.

### Installable PWA

- Added the web-app manifest and installable application identity.
- Added a deliberately bounded offline application-shell cache.
- Added installation prompts and explicit update activation with data-safety
  checks.
- Added automated PWA lifecycle, offline/reconnect and update verification.
- Recorded desktop and Android production smoke evidence.
- Clarified update behavior so a new service worker is activated only through
  the explicit user flow.

Evidence: [`m6-pwa-evidence.md`](../engineering/m6-pwa-evidence.md).

### Global navigation, people and native foundation

- Added mobile-first global application navigation and a people workspace.
- Defined the native distribution contract.
- Added deterministic native web build output.
- Added Capacitor-based Android and iOS project foundations.
- Added native account transport and hardened the native lifecycle boundary.
- Added Android account and lifecycle smoke verification, including resumable
  test behavior.

This was a packaging foundation, not evidence of an App Store or Play Store
release.

### Mobile-first product refinement

- Refined account recovery and the core group workflows.
- Added a dedicated mobile application navigation pattern.
- Improved mobile list discovery and integration coverage.
- Improved the landing page, balance presentation and desktop header.
- Added compact balance-page utilities and tested their action menu.
- Made group-specific settlement recording discoverable from the balance view.
- Added a configurable default name for the account holder in new groups and
  aligned the automatic-participant setting with that behavior.
- Combined group-participant management with a directional balance
  visualization showing who pays and who receives.
- Moved participant balances out of the expense overview and into the group
  participant view.
- Added compact participant creation, row-level rename and activation controls,
  full-width editing panels and mobile row expansion.
- Refined group settings, archive behavior, expense-list scrolling and search.
- Stabilized group-view metadata to avoid layout shifts.
- Improved the landing walkthrough and responsive settings controls.

### Preferences, localization and visual skins

- Added persisted language and group-navigation preferences.
- Added German and English application translations with system-language
  detection and English fallback.
- Persisted language choice locally or in account preferences when signed in.
- Refined terminology between the global people directory and participants in a
  group.
- Added configurable group-tab order and default group start view.
- Added distinct Material-inspired and iOS-inspired visual skins alongside the
  existing visual styles.
- Added authenticated initials in the application header and refined responsive
  settings controls.
- Improved the landing-page walkthrough with linked participant, expense, split
  and settlement examples.

### Developer operations, observability and aggregate usage

- Added focused developer documentation for local development, API usage,
  production operations and observability.
- Added a privacy-minimal operational logging baseline.
- Added SemVer and release-process documentation.
- Added an approximate aggregate daily showcase-load counter without visitor
  identifiers, cookies, account association or persistent browser markers.
- Added total, seven-day and daily aggregate figures to the public demo
  information view.
- Documented that reloads, automation and repeated requests can affect this
  approximate traffic count.

## Commit coverage

The following contiguous ranges are the traceability boundary for this
retrospective changelog:

| Period | Inclusive commits | State |
| --- | --- | --- |
| Foundations | `a10c7d3` through `050757c` | Development foundation |
| Group walking skeleton | `c20350d` through `430c71c` | Development milestone |
| Persistent expenses and balances | `2e3d6c9` through `ae66c45` | Development milestone |
| Settlements and lifecycle | `ff6bf14` through `e9f6f56` | Development milestone |
| Public beta preparation | `0561448` through `da85d24` | Included in `v0.1.0-beta.1` |
| Accounts and multi-device access | `fc804c5` through `b970498` | Untagged development |
| Installable PWA | `e9bab57` through `02d7584` | Deployed milestone, untagged |
| Navigation and native foundation | `40026a6` through `e39f7b7` | Untagged development |
| Product and settings refinement | `ef826b8` through `67e8f28` | Untagged development |
| Developer operations | `6399720` | Untagged development |
| Anonymous aggregate usage | `3dd8ba1` | Untagged development |

The detailed milestone interpretation is maintained in
[`version-history.md`](version-history.md). Future released changes are generated
from Conventional Commits in the root [`CHANGELOG.md`](../../CHANGELOG.md) and
GitHub Releases by Release Please.
