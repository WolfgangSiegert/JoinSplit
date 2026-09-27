# Native Distribution and Security Contract

## Status

This is the accepted JS-049 decision package for **M7 – Native**. It defines
the smallest secure boundary for iOS and Android development builds before
Capacitor or native platform projects are added. The human approval on
2026-09-27 authorizes JS-050 to add the separate native client build target
without installing Capacitor yet.

M7 packages the existing local-first JoinSplit product. It does not turn the
beta showcase into a production-grade financial service and does not include
store submission.

## Goal

Deliver installable iOS and Android development builds from the shared Nuxt
codebase while keeping the accountless financial core useful without a network
connection.

The native application must remain usable when Laravel, Render, Neon or the
public website are unavailable. Network-dependent synchronization and Account
features remain optional extensions of that local core.

## Product and App Review boundary

The native application's lasting local utility is:

- create and reopen Groups,
- create and manage reusable People and Group Participants,
- record, edit and delete Expenses,
- calculate equal splits and Balances deterministically,
- calculate Settlement proposals,
- record Settlements and inspect the resulting local state,
- retain that workspace in IndexedDB across ordinary relaunches and app
  updates.

This is the M7 answer to Apple's minimum-functionality risk. Apple currently
requires an app to provide features, content and UI beyond a repackaged
website. A bundled, accountless and offline-capable financial workflow is
materially stronger than a remote website wrapper, but it does **not**
guarantee App Review acceptance. Store acceptance remains a later external
review outcome, not an M7 acceptance criterion.

References:

- [Apple App Review Guidelines, section 4.2](https://developer.apple.com/app-store/review/guidelines/)
- [Android offline-first guidance](https://developer.android.com/topic/architecture/data-layer/offline-first)

## Distribution model

### Bundled application assets

Production and development-device builds package a deterministic client build
inside the native application. Capacitor `webDir` points to that generated
artifact, which contains an `index.html` and every required local asset.

The native build must not set `server.url`. Capacitor documents that option as
a live-reload mechanism rather than a production delivery model. The public
JoinSplit website is therefore not the native application's boot dependency.

The same Vue, TypeScript, Pinia, domain and IndexedDB code remains shared with
the web/PWA build. Platform wrappers do not acquire financial business logic.

### Stable application identity

- app name: `JoinSplit`
- iOS bundle identifier / Android application ID:
  `org.tinybits.joinsplit`
- native local hostname: `localhost`
- iOS local origin: `capacitor://localhost`
- Android local origin: `https://localhost`

The identifier and local origins are treated as persistent storage boundaries.
Changing them after users have local data can make the previous WebView storage
unreachable and therefore requires an explicit migration decision.

The application identifier uses a reverse-domain identifier without the
hyphen from `tiny-bits.org`, because native package identifiers cannot safely
reuse that punctuation.

## Native-compatible Nuxt build

JS-050 adds a separate native client target. It must:

- emit static client assets with a deterministic output directory,
- avoid runtime dependence on Nuxt server routes, SSR or the public site,
- retain history/navigation behavior inside the WebView,
- keep the API base as an explicit non-secret build configuration,
- keep the normal web and PWA build unchanged,
- exclude PWA registration, install prompts and Service Worker update UI from
  the native target,
- provide a restrictive Content Security Policy suitable for bundled content.

If a route cannot be made available from bundled assets without a server, it is
not part of the accepted native build until JS-050 resolves it explicitly. A
remote `server.url` is not an acceptable shortcut.

## Offline data and lifecycle contract

IndexedDB remains the native local store. Cache Storage and native key/value
preferences do not become duplicate domain stores.

The existing local success boundary remains binding:

```text
validate and prepare
→ atomic IndexedDB commit
→ Pinia update
→ visible success
```

Consequences:

- backgrounding or terminating the app after visible success must not lose the
  accepted local mutation,
- a cold airplane-mode launch opens the bundled shell and the last committed
  local workspace,
- pending mutations remain durable until the existing foreground sync can run,
- reconnecting may retry but must not duplicate domain records,
- application updates must preserve IndexedDB,
- uninstalling the application, clearing app data or changing the native
  storage origin may remove local data and is not a recovery promise.

The native application does not claim encrypted domain storage. For the beta
showcase, data is protected by the operating-system application sandbox and the
device's access controls. Production readiness would require a separate threat
and privacy assessment before stronger at-rest claims are made.

## Network and API boundary

- The only production API origin is `https://joinsplit.tiny-bits.org`.
- Cleartext HTTP is disabled outside explicitly temporary local development.
- API URLs and public configuration are not secrets.
- No secret, signing credential, database credential or Laravel key is bundled.
- Server-dependent failures are shown as offline/unavailable states and never
  block the accountless local core.
- The native wrapper does not add background synchronization in M7.

Capacitor's default external-navigation behavior is retained: external URLs
open outside the application WebView. `server.allowNavigation` remains empty in
release configuration. Universal links, custom URL schemes and inbound deep
links are deferred until a concrete product flow needs them.

## Account, session and CSRF contract

The web Account contract remains authoritative:

- Laravel owns the server session,
- the session identifier remains in a Secure, HttpOnly cookie,
- CSRF uses the existing bootstrap endpoint and request header,
- passwords and Account session material never enter IndexedDB or
  `localStorage`,
- logout invalidates the server session and then applies the existing protected
  local cleanup rules.

The local native origins differ from the HTTPS API origin. Ordinary WebView
third-party-cookie behavior is therefore not accepted as a reliable session
transport. JS-051 must use and verify Capacitor's native HTTP and native cookie
support, both supplied by `@capacitor/core`, behind a small platform-aware
transport boundary. It must not expose the HttpOnly session value to
application JavaScript.

The intended request sequence is:

```text
native HTTP cookie jar
→ GET /api/account/csrf
→ in-memory CSRF response value
→ authenticated mutation with X-CSRF-TOKEN
→ Secure HttpOnly Laravel session cookie handled outside IndexedDB/localStorage
```

JS-051 must prove on both iOS and Android that registration/login, current
session, workspace hydration, mutation, logout and expired-session behavior
work through this transport. Cookie handling must be scoped to the canonical
API URL. iOS configuration may use `WKAppBoundDomains` for the canonical domain
where required by WebKit.

No bearer-token fallback is authorized. If the cookie/session proof fails, the
native development build keeps the local core available and labels Account
features unavailable until the contract is revised by a new human decision.
This is an implementation risk, not permission to weaken session storage.

References:

- [Capacitor HTTP API](https://capacitorjs.com/docs/apis/http)
- [Capacitor Cookies API](https://capacitorjs.com/docs/apis/cookies)
- [Capacitor security guidance](https://capacitorjs.com/docs/guides/security)

## PWA and native update ownership

The PWA Service Worker is a web-distribution concern and is disabled in the
native build. It must not register, precache the native shell or display PWA
install/update prompts inside Capacitor.

Native application code and bundled assets update only through a newly built
native package. Domain data and pending mutations remain in IndexedDB across an
ordinary in-place app update. M7 introduces no live-update service and no
downloaded executable web bundle.

## Permissions and native surface

The initial native projects request no camera, contacts, location,
notifications, background execution or advertising permission. No speculative
plugin is installed.

Existing browser-standard sharing and file/image export may remain available
where the WebView supports them. A native Share or Filesystem plugin requires a
separate demonstrated gap and dependency decision; it is not required to start
M7.

Safe-area insets, system bars, viewport behavior, keyboard use, dark mode,
back navigation and foreground/background transitions are part of the native
UI verification even though they add no product feature.

## Supported development baseline

The initial implementation targets the current stable Capacitor 8 line rather
than the Capacitor 9 prerelease line.

- Node.js 24, already required by the repository,
- Capacitor 8 packages pinned together,
- Xcode 26 or newer,
- iOS deployment target 15.0 or newer,
- Android Studio 2025.2.1 or newer,
- Android minimum SDK 24,
- Android compile and target SDK 36.

These values reflect the current Capacitor 8 requirements and must be rechecked
against primary platform documentation when a store submission is actually
prepared. They are not evergreen promises.

Reference:

- [Capacitor 8 platform requirements](https://capacitorjs.com/docs/updating/8-0)

## Signing, cost and distribution limits

M7 produces development builds and evidence:

- Android may use local debug signing for emulator/device verification.
- iOS may use the available local Apple development team and provisioning for
  simulator/device verification.
- signing certificates, provisioning profiles, keystores and passwords are
  never committed.
- App Store Connect, TestFlight, Google Play Console, paid memberships,
  production signing and public store listings are not required for M7.

Apple store submission currently requires builds accepted by App Store
Connect's current Xcode/SDK rules. Those rules change over time and must be
checked again at submission. M7 completion therefore means distribution
readiness evidence, not publication.

Reference:

- [Apple App Store Connect build upload requirements](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)

## Evidence and rollback

Each downstream item records:

- exact toolchain and dependency versions,
- commands and generated artifact locations,
- simulator/device and OS versions,
- offline cold-start and local-workflow results,
- Account session results where in scope,
- permissions and network traffic observed,
- web/PWA regression results,
- known limitations and manual steps.

Native projects and configuration are versioned. Machine-local signing state,
build products, DerivedData, Gradle caches and secrets are ignored.

Rollback means removing the M7 build target, Capacitor configuration,
dependencies and generated platform projects while preserving the existing
web/PWA application and backend. Published native binaries cannot be recalled
by a Git rollback; that remains a later store-operations concern.

## Dependency decision for JS-052

The approved concrete problem is packaging the accepted Nuxt client as iOS and
Android applications with stable native identities and development builds.

Subject to JS-049 approval, JS-052 may add matching pinned Capacitor 8 packages:

- `@capacitor/core`,
- `@capacitor/cli`,
- `@capacitor/ios`,
- `@capacitor/android`.

Framework and browser APIs alone cannot generate, configure or build the native
containers. A remote WebView wrapper would violate the offline and App Review
boundary. Capacitor adds native project maintenance and platform-upgrade work;
that cost is accepted only for M7. No additional plugin is pre-approved.

## Verification gate

M7 cannot close until evidence shows:

- the native artifact boots from bundled assets with no public website,
- airplane-mode cold start exposes the accepted local financial core,
- IndexedDB data and pending mutations survive relaunch and an in-place update,
- reconnect retries without duplicates,
- PWA Service Worker and install/update UI are absent in native builds,
- no token, password, session identifier or secret appears in browser storage
  or the bundled application,
- the Account session path passes on both platforms or remains explicitly
  unavailable without weakening the contract,
- external links cannot silently replace the application WebView,
- no undeclared permission is requested,
- iOS and Android development builds use the same bundled web artifact,
- web and PWA build, offline and synchronization regressions remain green,
- signing material and machine-specific paths are absent from Git.

## M7 work breakdown

| Item | Responsibility |
| --- | --- |
| JS-049 | Approve this native distribution and security contract |
| JS-050 | Produce the deterministic native-compatible Nuxt artifact |
| JS-051 | Implement and prove the native API/session/CSRF boundary |
| JS-052 | Add the pinned Capacitor foundation and native projects |
| JS-053 | Verify lifecycle, persistence, safe areas and navigation |
| JS-054 | Produce and verify the Android development build |
| JS-055 | Produce and verify the iOS development build |
| JS-056 | Consolidate regression, security and distribution-readiness evidence |
