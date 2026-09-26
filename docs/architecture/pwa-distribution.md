# PWA Distribution Contract

## Status

This is the accepted JS-043 decision package for **M6 – PWA**. It defines the
smallest installable and offline-startable distribution layer that can be added
without changing JoinSplit's financial domain, Account model or synchronization
protocol. The human approval on 2026-09-26 authorizes JS-044 to introduce the
single dependency and boundaries specified here.

M6 starts after the deployed M5 Account and Multi-Device release. M6 does not
turn the beta showcase into a production-grade financial service and does not
change the zero-cost Render and Neon operating boundary.

## Goal

Make the existing web application installable and allow a previously loaded
JoinSplit app to start and expose its locally persisted workspace without a
network connection.

M6 must preserve these existing properties:

- accountless use remains local-first,
- Account sessions remain server-side and cookie-authenticated,
- domain data remains in IndexedDB rather than Cache Storage,
- pending mutations remain under the existing explicit queue and retry logic,
- Laravel remains the canonical application API when the network is available,
- the ordinary HTTPS website remains fully usable when PWA APIs are unavailable.

## Product boundary

### Included

- an installable web app manifest with the existing JoinSplit identity,
- branded install icons and standalone presentation,
- a Service Worker providing a bounded offline application shell,
- relaunch after at least one successful online load,
- continued local use of already persisted Groups while offline,
- an accessible install affordance where the browser exposes one,
- an explicit update-available flow that does not reload silently,
- recovery from a failed or outdated Service Worker installation,
- automated Chromium coverage plus a bounded manual browser/device check,
- accurate README, public-demo and operational claims after production release.

### Explicitly excluded

- first-ever use without a prior online load,
- caching API responses or Account workspace responses,
- Background Sync API or a second mutation queue,
- push notifications, badges, periodic sync or share-target integration,
- automatic conflict merge,
- guaranteed offline authentication or server-session renewal,
- iOS or Android app-store distribution,
- Capacitor or native platform projects,
- collaboration, invitations or new financial features,
- availability, backup or recovery SLA claims.

## Offline capability contract

The following three concerns remain separate:

1. **Application shell:** the Service Worker makes the code and static assets
   needed to render JoinSplit available after a successful online load.
2. **Domain data:** IndexedDB remains the only offline store for Groups,
   Participants, Expenses, Settlements, Account hydration and pending
   mutations.
3. **Synchronization:** the existing foreground queue talks to Laravel when the
   browser reports connectivity. M6 adds no Service Worker mutation replay.

The supported M6 promise is therefore:

> After JoinSplit has loaded successfully online and the Service Worker is in
> control, the installed app can be relaunched offline and work with the local
> workspace already stored on that device.

It is not a promise that an unseen route, a cleared browser profile, an expired
Account session or a first visit can be recovered offline. A route that has
never supplied a usable application document may show a small offline fallback
instead of fabricating data or a successful state.

For an Account workspace, offline display describes the last validated snapshot
in IndexedDB. It does not prove that the server session is still valid. Server
work resumes only after connectivity and normal session validation return.

## Cache and security contract

### May be cached

- revisioned Nuxt client assets,
- the generic application document or a dedicated generic offline fallback,
- the web app manifest,
- JoinSplit icons, fonts and other public presentation assets.

### Must never be cached by the Service Worker

- every `/api/**` response,
- `/ready`, operational or diagnostic responses,
- authenticated Account reads and mutations,
- CSRF responses, session material or authorization headers,
- Group, Participant, Expense, Settlement or Statement payloads,
- mutation requests or mutation responses.

Only `GET` and `HEAD` presentation requests may participate in PWA caching.
Requests carrying credentials are not a justification to cache personalized
responses. The Service Worker cache is an application-delivery cache, not a
data store or backup.

Cache names are versioned and obsolete caches are removed during activation.
Storage remains deliberately bounded. Hashed build assets may be cache-first;
navigation documents should prefer the network and fall back only to a known
safe cached document or generic offline page.

## Installation contract

The manifest uses the canonical HTTPS origin and includes at least:

- stable `id`, `start_url` and root `scope`,
- `name` and `short_name`,
- `display: standalone`,
- theme and background colors matching the current design,
- purpose-appropriate 192 px and 512 px PNG icons, including a maskable icon
  where visual verification confirms a safe zone.

Installation is progressive enhancement. JoinSplit may show an install action
only when the browser provides a supported install event. Platforms without
that event keep the normal web experience and may receive concise manual
instructions; the UI must not claim installation succeeded merely because a
button was pressed.

## Update and recovery contract

M6 uses an explicit **prompt** update strategy.

- A waiting Service Worker does not silently reload the application.
- The UI announces that a new version is available.
- Applying it is a deliberate user action.
- If pending mutations exist, the user sees their count and may synchronize,
  continue on the current version, or explicitly accept the local risk before
  reload.
- Activation cleans obsolete presentation caches but never deletes IndexedDB.
- A failed update leaves the current controlled version usable where the
  browser permits it.

This boundary avoids conflating an application-code update with logout, local
reset, Account conflict resolution or queue deletion.

## Tooling decision

### Proposed dependency

Use `@vite-pwa/nuxt` as a development dependency and its Workbox integration.

It solves the current, concrete need to generate and register a versioned
Service Worker, inject a manifest, manage precache revisions and expose the
update lifecycle in Nuxt. The older `@nuxtjs/pwa` module is not compatible with
the current Nuxt generation.

### Alternatives considered

- **Hand-written Service Worker:** avoids a dependency but transfers manifest
  injection, revisioning, cache cleanup and update lifecycle maintenance into
  project code. That is more custom infrastructure than this showcase needs.
- **Manifest without Service Worker:** provides some installation metadata but
  does not meet the approved offline-start goal.
- **PWA asset generator:** not initially required. The existing vector source
  can produce the small fixed icon set without adding a second PWA dependency.

The module must be pinned through `pnpm-lock.yaml`, configured explicitly and
kept out of runtime domain code. Workbox Background Sync is not enabled.

## Verification gate

M6 is complete only when all of the following are evidenced:

- manifest fields, icon sizes and canonical scope are validated,
- the production build emits and registers the intended Service Worker,
- `/api/**` and Account responses are absent from Cache Storage,
- a controlled page can relaunch offline after one successful online load,
- local IndexedDB data remains available after that relaunch,
- an offline mutation remains in the existing durable queue and reconciles
  exactly once after reconnect,
- an available update never causes an unprompted reload,
- applying an update preserves IndexedDB and handles pending mutations as
  specified,
- unsupported-install browsers retain the full website workflow,
- accessibility and 320 px reflow checks cover new install/update UI,
- Render deployment, manifest, Service Worker scope and production offline
  behavior are verified with fictional data.

The beta showcase may retain a reduced real-device matrix, but Chromium desktop
installation and offline relaunch must be checked automatically. At least one
mobile installation path should be checked manually before making a broad
public PWA claim. Exact browser and OS versions remain part of the evidence.

## M6 work breakdown

| Item | Goal | Area | Execution |
| --- | --- | --- | --- |
| JS-043 | Accept this PWA distribution and caching contract | Architecture | Human + ChatGPT |
| JS-044 | Integrate manifest, branded assets and minimal PWA tooling | Frontend | Human + Codex |
| JS-045 | Implement the offline app-shell and strict API cache boundary | Frontend | Human + Codex |
| JS-046 | Implement accessible install, update and recovery UX | Frontend | Human + Codex |
| JS-047 | Verify installability, offline lifecycle and data safety | QA | Human + Codex |
| JS-048 | Deploy M6 and align public and operational claims | DevEx | Human + ChatGPT |

M7 Native remains a separate milestone. M6 must not introduce Capacitor merely
because its manifest and icons may later be reused.
