# M6 PWA Evidence

## Status

JS-047 local automation passed on 2026-09-26. The run used Playwright Chromium
153.0.8010.12 on macOS arm64 against a fresh production Nuxt build. GitHub CI,
production and manual installation rows are completed only after their
respective integration and JS-048 deployment gates.

## Automated candidate evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Manifest and icon artifacts | PASS locally | `frontend/tests/pwa-assets.spec.ts` |
| Service Worker scope and control | PASS locally | `frontend/tests/pwa-assets.spec.ts` |
| Offline relaunch and API cache exclusion | PASS locally | `frontend/tests/pwa-offline.spec.ts` |
| Offline mutation, reconnect, exactly-once request | PASS locally | `frontend/tests/pwa-offline.spec.ts` |
| Waiting update does not reload | PASS locally | `frontend/tests/pwa-update-lifecycle.spec.ts` |
| Explicit update preserves IndexedDB pending work | PASS locally | `frontend/tests/pwa-update-lifecycle.spec.ts` |
| Install fallback, accessibility and 320 px reflow | PASS locally | `frontend/tests/pwa-experience.spec.ts` |
| Full application regression | PASS locally; CI PENDING | 254 Vitest tests and 62 Playwright tests passed |

## Manual installation evidence

| Platform | Exact device / OS / browser | Commit and deploy | Result | Notes |
| --- | --- | --- | --- | --- |
| Desktop installed PWA | PENDING | PENDING | PENDING | Run after JS-048 deploy |
| Mobile installed PWA | PENDING | PENDING | PENDING | Real device preferred; label emulation |

## Production lifecycle evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Canonical manifest and Service Worker headers | PENDING | JS-048 production smoke |
| Canonical installability and root scope | PENDING | JS-048 production smoke |
| Production offline relaunch with fictional data | PENDING | JS-048 production smoke |
| API and Account data absent from Cache Storage | PENDING | JS-048 production smoke |
| Update from deployed version to candidate | PENDING | JS-048 controlled release smoke |

No `PENDING` row may be reported as passed by inference from local automation.
