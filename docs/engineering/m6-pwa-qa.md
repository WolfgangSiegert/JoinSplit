# M6 PWA QA

## Purpose

This is the bounded acceptance protocol for JS-047. It verifies the PWA
distribution boundary without expanding the beta showcase into a full browser
or device certification. Use only fictional data.

The authoritative product and cache rules remain in
[`../architecture/pwa-distribution.md`](../architecture/pwa-distribution.md).

## Automated gate

The CI suite must verify all of the following against a production Nuxt build:

- manifest identity, scope, colors and declared icon purposes;
- actual PNG dimensions for 192 px, 512 px and maskable assets;
- a root-scoped active Service Worker;
- presentation-cache creation and absence of API, readiness and Account URLs;
- online load followed by controlled offline relaunch;
- an offline local mutation surviving reload and synchronizing exactly once;
- a real changed Service Worker reaching the waiting state without reloading;
- explicit update activation with pending-work confirmation;
- IndexedDB Group and pending-mutation preservation across activation;
- install-event progressive enhancement, unsupported fallback, 320 px reflow
  and automated accessibility checks;
- the complete accountless and Account regression suite.

The changed-worker test modifies only the ignored local build artifact during
the test and restores it in a `finally` block. It does not alter source files or
simulate success by directly toggling application state.

## Manual desktop installation

Run after JS-048 deploys the approved commit to
`https://joinsplit.tiny-bits.org`:

1. Record date, tester, Git commit, Render deploy, OS and exact browser version.
2. Open the canonical HTTPS origin in a fresh browser profile.
3. Confirm the browser recognizes JoinSplit as installable and shows the
   JoinSplit name and branded icon.
4. Install it through the browser-provided action.
5. Launch the installed app and confirm standalone presentation, root scope,
   normal navigation and the visible Beta label.
6. Create only fictional local data, close the installed app, disable the
   network, relaunch it and confirm the previously loaded workspace appears.
7. Reconnect and confirm one pending fictional mutation synchronizes once.
8. Uninstall the app or remove the temporary profile after recording results.

## Manual mobile installation

Run one path before making a broad public mobile-installation claim:

- **iOS/iPadOS Safari:** Share → Add to Home Screen → launch from Home Screen; or
- **Android Chrome:** browser menu/install prompt → Install app → launch from
  launcher.

Record the exact device, OS and browser version. Verify the branded icon,
standalone launch, touch navigation, one previously loaded offline relaunch and
return to online operation. A simulator or emulator must be labelled as such.

## Evidence boundary

Automated Chromium evidence can close the engineering portion of JS-047. The
desktop and mobile rows remain `PENDING` until a human performs them against
the deployed JS-048 candidate. Pending manual rows do not justify a public
mobile PWA claim.
