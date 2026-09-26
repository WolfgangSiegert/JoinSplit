# M4 Release Evidence

## Status

Release decision: **BLOCKED**

This document records evidence only. Empty or `BLOCKED` fields are not
optimistic placeholders and must not be treated as completed checks.

Authoritative contracts:

- [`../product/portfolio-demo.md`](../product/portfolio-demo.md)
- [`production-operations.md`](production-operations.md)
- [`deployment-runbook.md`](deployment-runbook.md)
- [`m4-production-qa.md`](m4-production-qa.md)

Release operator: Wolfgang Siegert (confirmed through the supervised deployment
and smoke-test flow)

Incident operator: not yet explicitly confirmed

Private alert destination: not recorded in the repository; configuration not
yet verified

## 1. Immutable release identity

| Field | Value | Evidence/status |
| --- | --- | --- |
| Git commit | `5f1db912b12d06888ed95ca15df329063d0a678a` | local `main` and `origin/main` identical when recorded |
| Commit subject | `feat: add branded JoinSplit app icon` | verified from Git |
| CI run | [GitHub Actions 36229322313](https://github.com/WolfgangSiegert/JoinSplit/actions/runs/36229322313) | completed successfully for the recorded commit |
| Render service | `srv-darf6v7avr4c73ee3k40` | Frankfurt, Free and Blueprint-managed; final dated account check pending |
| Render deploy | `dep-daro0n8jo6nc738oi78g` | live deploy observed; duration 1m17s |
| Neon project | `joinsplit-production` | AWS Frankfurt and Free reported; final dated account check pending |
| Automatic deploy | Off | observed in Render; final release check pending |

## 2. Deployment and migration

| Check | Result | Required evidence |
| --- | --- | --- |
| Production configuration validation | PASS | Render log: `Production configuration is valid.` |
| Migration command | PASS | Render log reports no pending migrations for the recorded deploy |
| Expected highest migration | `2026_09_25_000001_add_last_mutated_at_to_access_identities` | compare with production migration state |
| Startup retention cleanup | PASS | aggregate-only Render log reports `identities=0 groups=0` |
| Secrets absent from output | PASS for reviewed deploy excerpt | no credential values observed; a broader runtime-log review remains an operations gate |
| Destructive commands absent | PASS for reviewed deploy | no test seeder, `migrate:fresh` or rollback observed |

Expected startup order is production-configuration validation, migrations via
the direct Neon endpoint, retention cleanup, then Apache, Nuxt and the Laravel
scheduler.

## 3. Domain, TLS and routing

| Check | Expected | Result |
| --- | --- | --- |
| Canonical DNS | `joinsplit.tiny-bits.org` CNAME to `joinsplit.onrender.com` | PASS at `2026-09-26T07:38Z` via Cloudflare public DNS |
| Render domain verification | verified | PASS observed in Render on 2026-09-26 |
| TLS certificate | valid hostname and trusted chain | PASS on 2026-09-26 through successful canonical HTTPS requests |
| HTTP to HTTPS | canonical HTTPS | PASS on 2026-09-26: HTTP 301 to `https://joinsplit.tiny-bits.org/` |
| Render hostname | redirects to canonical origin | PASS at `2026-09-26T07:38Z`: HTTP 308 via `curl` |
| `/` | application shell | PASS on 2026-09-26: HTTP 200 on canonical origin |
| `/up` | HTTP 200 liveness response | PASS at `2026-09-26T07:38Z` on Render hostname |
| `/ready` | HTTP 200 with minimal readiness response | PASS on 2026-09-26 on canonical origin |
| Separate public Laravel origin | none | PASS in the reviewed deployment configuration |

## 4. Bounded production smoke

Use only the fictional data and sequence from
[`m4-production-qa.md`](m4-production-qa.md). Do not record credentials,
payloads, real names or real financial data in this document.

| Step | Expected | Result/defect |
| --- | --- | --- |
| Create Group and Participants | accepted locally and synchronized | PASS: `QA-Hüttentour`, `Ava Test`, `Ben Probe`, `Cleo Muster`; duplicate-name override required |
| Create and edit Expense | deterministic shares and synchronized state | PASS: 10.01 EUR split 3.34/3.34/3.33; edited 12.01 EUR split 4.01/4.00/4.00 |
| Balance and proposal | exact expected values | PASS: +8.00/-4.00/-4.00 and two deterministic 4.00 EUR transfers |
| Record and remove Settlement | balances update deterministically | PASS: create, edit and delete verified; direction and overpayment require explicit override |
| Statement Snapshot | static output without financial mutation | PASS: Cleo statement showed -4.00 EUR, timestamp and expected details; copy confirmation visible |
| Reload | local state remains available | PASS after full page reload |
| Archive/reactivate | read-only and writable states enforced | PASS across reload |
| Local Reset | accurate warning without server-deletion claim | PASS: cancel preserved state and restored focus; confirm produced empty local state and a new identity |

The reference run used only the fictional names and amounts prescribed by the
QA protocol. Expense and Settlement records were removed before reset. The
synchronized QA Group and Participants remain subject to normal retention
cleanup because Local Reset intentionally does not delete server copies.

Residual smoke observations:

- validation errors are programmatically associated and focus moves correctly,
  but Expense errors remain visible while values are corrected and clear only
  on the next submit;
- the available supervised browser did not expose a network toggle, so the
  offline/reconnect check remains open;
- the service was already awake, so this run is not cold-start evidence.

## 5. M4 browser QA matrix

Record exact versions and devices at test time. `Current` is not a frozen
version number.

| Browser/device | Exact version/OS | Core flow | Keyboard/reflow/accessibility | Result/defects |
| --- | --- | --- | --- | --- |
| Supervised desktop browser | exact engine/version unavailable, 2026-09-26 | full reference flow except offline toggle | validation association, modal focus return and reload checked | PARTIAL PASS; not a substitute for the named browser rows |
| Chrome desktop | pending | pending | pending | BLOCKED |
| Edge desktop | pending | pending | pending | BLOCKED |
| Firefox desktop | pending | pending | pending | BLOCKED |
| Safari desktop | pending | pending | pending | BLOCKED |
| Safari on current iOS | pending | pending | pending | BLOCKED |
| Chrome on current Android | pending | pending | pending | BLOCKED |

## 6. Operations and free-tier gates

The zero-cost showcase intentionally uses a mixed automatic and manual
operations boundary. It does not claim continuous availability monitoring or
an SLA.

| Gate | Required evidence | Result |
| --- | --- | --- |
| Exactly one Render service | Free, Frankfurt, no paid upgrade | BLOCKED: dated account check pending |
| Exactly one Neon project | Free, AWS Frankfurt, no paid upgrade | BLOCKED: dated account check pending |
| Cost controls | payment method and provider behavior reviewed | BLOCKED |
| Runtime-log retention | Render workspace retains data-bearing logs no longer than seven days | BLOCKED |
| Log-content review | no secrets, identifiers, names or financial payloads | BLOCKED |
| Render automatic checks | `/up`, failed deploy, unhealthy-service and Free-limit notifications configured | BLOCKED |
| Manual release checks | canonical HTTPS, `/ready`, domain/TLS and provider dashboards | BLOCKED |
| Manual metrics review | 5xx/429, Neon capacity and connections | BLOCKED |
| Cleanup evidence | startup cleanup success and awake-time scheduler log review | BLOCKED |
| Alert destination | named incident operator can receive configured notifications | BLOCKED |

The selected Render and Neon Free tiers do not together provide evidence for
configurable 5xx/429 threshold alerts, a separate `/ready` monitor, daily
cleanup alerts or Neon capacity and connection alerts. These remain documented
manual checks. Do not intentionally break a production deployment merely to
manufacture a test alert.

## 7. Public claims and publication

| Check | Result |
| --- | --- |
| README remains a release-candidate statement until approval | PASS |
| Portfolio entry links only to canonical HTTPS origin | PASS on 2026-09-26; GitHub source link also works |
| Free-tier and cold-start limitation disclosed | PASS in the production disclosure copy; cold-start measurement remains open |
| Retention, deletion and recovery boundary disclosed | PASS in the production disclosure and Local Reset copy |
| No unsupported offline, anonymous, backup, collaboration, PWA or WCAG claim | PASS for the reviewed production and portfolio copy |

## 8. Open blockers and release decision

| Blocker | Owner | Resolution/evidence |
| --- | --- | --- |
| Browser matrix not complete | release operator | complete the named desktop and mobile rows in section 5 |
| Offline/reconnect production check not run | release operator | run in a browser with network controls and record queue reconciliation |
| Cold-start evidence not captured | release operator | measure the first response after genuine Render inactivity |
| Operators and alert destination not confirmed | human owner | explicit confirmation and dated provider check |
| Free-tier, logs and notification settings not fully evidenced | human owner | completed section 6 |
| Portfolio App icon not displayed | portfolio project | separate follow-up to the completed JS-031 presentation scope |

Change the decision to **APPROVED** only after every release prerequisite has
evidence. Otherwise it remains **BLOCKED**.
