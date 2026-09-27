# Native development

## Current boundary

M7 packages the same local-first Nuxt client for iOS and Android with
Capacitor. The accepted architecture and security constraints are defined in
[`native-distribution.md`](../architecture/native-distribution.md).

JS-052 adds only these exactly pinned packages:

- `@capacitor/core` 8.5.2,
- `@capacitor/cli` 8.5.2,
- `@capacitor/ios` 8.5.2,
- `@capacitor/android` 8.5.2.

Capacitor is necessary to generate and maintain the native containers. No
additional plugin, platform permission or remote `server.url` is part of this
foundation. The cost is two generated platform projects plus future Capacitor,
Xcode and Android Gradle maintenance.

## Shared identity and artifact

Both platforms use:

- app identifier `org.tinybits.joinsplit`,
- display name `JoinSplit`,
- web directory `frontend/.output/public`,
- the deterministic `pnpm build:native` artifact,
- the existing JoinSplit maskable icon as their visual source.

The native target connects to `https://joinsplit.tiny-bits.org`, contains no
remote boot asset and does not register the PWA Service Worker or show PWA
installation/update UI.

## Native Account transport

Capacitor HTTP patches the shared application `fetch` boundary inside native
containers, and Capacitor Cookies supplies the native cookie store. Browser and
PWA builds continue to use the browser implementations. Laravel keeps the
Account session in its Secure, HttpOnly, SameSite=Lax cookie; no Account token
or session identifier is copied into IndexedDB or localStorage.

The API allows only these explicit client origins when an `Origin` header is
present:

- `https://joinsplit.tiny-bits.org` for Web/PWA,
- `capacitor://localhost` for iOS,
- `https://localhost` for Android.

There is no wildcard credential origin. Logout and Account deletion first
invalidate the Laravel session and then try to clear native cookies only for the
canonical API URL. A failure of this additional cookie cleanup does not block
local Account-data removal; the remaining cookie value refers to an already
invalid session. iOS declares `joinsplit.tiny-bits.org` as an app-bound domain.

## Lifecycle and layout boundary

JoinSplit keeps its existing IndexedDB database and foreground synchronization
queue in the native WebView. It does not add a second native store, background
sync engine or hidden replay worker. A terminated WebView rehydrates the same
durable state on the next bundled-app launch. While the WebView remains alive,
connectivity is refreshed on browser online/offline events and again when the
document becomes visible or receives a pageshow event. Existing foreground
watchers then retry pending mutations using their idempotency identifiers.

The viewport uses `viewport-fit=cover`. The persistent header and page shell
apply the platform safe-area insets without reducing their existing mobile
spacing. Native builds continue to suppress Service Worker registration and
PWA install/update UI.

These code boundaries do not prove native runtime behavior. Airplane-mode cold
start, termination/relaunch, in-place update, hardware back, keyboard/focus,
external-link escape and exact-once reconnect still require the JS-054 and
JS-055 platform checks.

## Commands

From `frontend/`, after selecting the repository's Node 24 runtime:

```sh
pnpm install --frozen-lockfile
pnpm native:assets
pnpm native:sync
pnpm native:open:ios
pnpm native:open:android
```

`native:sync` rebuilds and verifies the native Nuxt artifact, regenerates the
versioned icons and splash images, and synchronizes both platform projects.
`native:copy` is available when only the bundled web artifact changed.

The asset generator uses the already approved Playwright development tooling;
it does not add an image-generation dependency.

## Version-control boundary

Versioned files include:

- `frontend/capacitor.config.ts`,
- `frontend/ios/`, excluding copied web assets and generated build state,
- `frontend/android/`, excluding copied web assets, Gradle build state and
  machine-local SDK configuration,
- the deterministic native build and asset scripts.

Ignored files include `.output`, `dist`, copied platform web assets,
`android/local.properties`, Gradle caches and build products, Xcode
`DerivedData`, `xcuserdata`, Pods and platform output directories. Signing
certificates, provisioning profiles, keystores and passwords must never be
committed.

Android application backup is disabled because JoinSplit has no reviewed
native backup/restore contract for its local financial and session state. The
only declared Android permission in this foundation is internet access for the
canonical Laravel API.

## Verification limit

Successful `native:sync` proves deterministic generation and synchronization;
it does not prove that either native application compiles, launches, persists
data across lifecycle changes or transports Account sessions correctly. The
transport configuration and automated origin/session regressions are necessary
evidence, but registration/login, authenticated reads and mutations, logout,
deletion and expired-session behavior still require checks on both native
platforms before JS-051 can close.
