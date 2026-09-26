# M6 PWA Evidence

## Status

JS-047 local automation passed on 2026-09-26. The run used Playwright Chromium
153.0.8010.12 on macOS arm64 against a fresh production Nuxt build. GitHub CI
run [36270897874](https://github.com/WolfgangSiegert/JoinSplit/actions/runs/36270897874)
passed for commit `8c09be3c10945d50a8306059d9fff2b0a73b8aec`.

JS-048 manually deployed that commit to the canonical origin through Render
deploy `dep-das32up7lnhs73fdev3g` on 2026-09-26. Render reported a successful
live deploy in 1m18s after production configuration validation, no pending
migrations and successful process startup. The desktop installation and
offline/reconnect path passed on macOS and Chrome as recorded below. Mobile
installation and a genuine production update transition remain open.

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
| Full application regression | PASS locally and in CI | 254 Vitest tests and 62 Playwright tests passed locally; CI run 36270897874 passed |

## Manual installation evidence

| Platform | Exact device / OS / browser | Commit and deploy | Result | Notes |
| --- | --- | --- | --- | --- |
| Desktop installed PWA | Mac running macOS 15.7.9; Chrome 153.0.8010.54 | `8c09be3`; `dep-das32up7lnhs73fdev3g` | PASS, human-reported | Installed app launched standalone with the production beta; fictional offline state and reconnect were exercised |
| Mobile installed PWA | PENDING | PENDING | PENDING | Real device preferred; label emulation |

## Production lifecycle evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Canonical manifest and Service Worker delivery | PASS | HTTPS 200; manifest served as `application/manifest+json`, Service Worker as JavaScript; deploy `dep-das32up7lnhs73fdev3g` |
| Canonical manifest identity and root scope | PASS | Production manifest declares stable `/` id, start URL and scope, standalone display and approved icon set |
| Production offline relaunch with fictional data | PASS, human-reported | Group `PWA Offline Test` with fictional Participants survived two offline launches; offline-added `Milo Test` synchronized after reconnect and remained present exactly once |
| API and Account data absent from Cache Storage | PASS for deployed routing policy; manual browser inspection PENDING | Deployed Service Worker routes `/api/**`, `/ready`, `/health` and `/up` through `NetworkOnly`; CI exercises Cache Storage behavior |
| Update from deployed version to candidate | PENDING | Deployment succeeded, but no suitable browser with a captured pre-deploy Service Worker state was available for a genuine production update observation |

No `PENDING` row may be reported as passed by inference from local automation.
