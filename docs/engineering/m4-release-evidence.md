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

Release operator: not yet explicitly confirmed  
Incident operator: not yet explicitly confirmed  
Private alert destination: not recorded in the repository; configuration not
yet verified

## 1. Immutable release identity

| Field | Value | Evidence/status |
| --- | --- | --- |
| Git commit | `ea04503d4f714a20e8a6f39ac0bb33d798e1f97f` | local `main` and `origin/main` identical when recorded |
| Commit subject | `fix: route database migrations through direct endpoint` | verified from Git |
| CI run | [GitHub Actions 36223189347](https://github.com/WolfgangSiegert/JoinSplit/actions/runs/36223189347) | completed successfully for the recorded commit |
| Render service | `srv-darf6v7avr4c73ee3k40` | Frankfurt, Free and Blueprint-managed; final dated account check pending |
| Render deploy | `dep-darmir97lnhs73e0i9g0` | live deploy reported; final log evidence pending |
| Neon project | `joinsplit-production` | AWS Frankfurt and Free reported; final dated account check pending |
| Automatic deploy | Off | observed in Render; final release check pending |

## 2. Deployment and migration

| Check | Result | Required evidence |
| --- | --- | --- |
| Production configuration validation | PASS reported | non-secret final Render log excerpt |
| Migration command | PASS reported | final log including highest applied migration |
| Expected highest migration | `2026_09_25_000001_add_last_mutated_at_to_access_identities` | compare with production migration state |
| Startup retention cleanup | BLOCKED | aggregate-only successful log evidence |
| Secrets absent from output | BLOCKED | operator review of deployment and runtime logs |
| Destructive commands absent | BLOCKED | verify no test seeder, `migrate:fresh` or rollback ran |

Expected startup order is production-configuration validation, migrations via
the direct Neon endpoint, retention cleanup, then Apache, Nuxt and the Laravel
scheduler.

## 3. Domain, TLS and routing

| Check | Expected | Result |
| --- | --- | --- |
| Canonical DNS | `joinsplit.tiny-bits.org` CNAME to `joinsplit.onrender.com` | PASS at `2026-09-26T07:38Z` via Cloudflare public DNS |
| Render domain verification | verified | PASS observed in Render on 2026-09-26 |
| TLS certificate | valid hostname and trusted chain | BLOCKED: issuance pending when last checked |
| HTTP to HTTPS | canonical HTTPS | BLOCKED |
| Render hostname | redirects to canonical origin | PASS at `2026-09-26T07:38Z`: HTTP 308 via `curl` |
| `/` | application shell | BLOCKED on canonical TLS |
| `/up` | HTTP 200 liveness response | PASS at `2026-09-26T07:38Z` on Render hostname; canonical check pending |
| `/ready` | HTTP 200 with minimal readiness response | PASS at `2026-09-26T07:38Z` on Render hostname; canonical check pending |
| Separate public Laravel origin | none | BLOCKED: final review pending |

## 4. Bounded production smoke

Use only the fictional data and sequence from
[`m4-production-qa.md`](m4-production-qa.md). Do not record credentials,
payloads, real names or real financial data in this document.

| Step | Expected | Result/defect |
| --- | --- | --- |
| Create Group and Participants | accepted locally and synchronized | BLOCKED |
| Create and edit Expense | deterministic shares and synchronized state | BLOCKED |
| Balance and proposal | exact expected values | BLOCKED |
| Record and remove Settlement | balances update deterministically | BLOCKED |
| Statement Snapshot | static output without financial mutation | BLOCKED |
| Reload | local state remains available | BLOCKED |
| Archive/reactivate | read-only and writable states enforced | BLOCKED |
| Local Reset | accurate warning without server-deletion claim | BLOCKED |

## 5. M4 browser QA matrix

Record exact versions and devices at test time. `Current` is not a frozen
version number.

| Browser/device | Exact version/OS | Core flow | Keyboard/reflow/accessibility | Result/defects |
| --- | --- | --- | --- | --- |
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
| Portfolio entry links only to canonical HTTPS origin | BLOCKED |
| Free-tier and cold-start limitation disclosed | BLOCKED: final copy review pending |
| Retention, deletion and recovery boundary disclosed | BLOCKED: final copy review pending |
| No unsupported offline, anonymous, backup, collaboration, PWA or WCAG claim | BLOCKED: final copy review pending |

## 8. Open blockers and release decision

| Blocker | Owner | Resolution/evidence |
| --- | --- | --- |
| TLS certificate pending | Render / release operator | valid canonical HTTPS result |
| Deployed UI still promises obsolete 24-hour and 38-day deletion limits | implementation owner | local correction and focused test PASS; commit, deploy and production copy review pending |
| Canonical production smoke not run | release operator | completed section 4 |
| Browser matrix not run | release operator | completed section 5 |
| Operators and alert destination not confirmed | human owner | explicit confirmation and dated provider check |
| Free-tier, logs and notification settings not fully evidenced | human owner | completed section 6 |
| Portfolio entry not published | portfolio project | canonical link live after approval |

Change the decision to **APPROVED** only after every release prerequisite has
evidence. Otherwise it remains **BLOCKED**.
