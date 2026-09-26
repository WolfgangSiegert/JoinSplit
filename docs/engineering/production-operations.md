# Production Operations Contract

## Status

This document defines the approved M4 target contract for a public JoinSplit
portfolio release on Render and Neon. It is not a description of the
repository's current production readiness.

The complementary product and public-claim boundary is defined in
[`../product/portfolio-demo.md`](../product/portfolio-demo.md).

The versioned deployment boundary, readiness endpoint and operational procedure
are implemented by JS-029. The committed Render Blueprint is a deliberately
blocked template, not deployment authorization; see
[deployment-runbook.md](deployment-runbook.md). Retention cleanup and its
operational verification remain required before public release.

The canonical application domain is `https://joinsplit.tiny-bits.org`. The
approved public operator is Wolfgang Siegert and the privacy contact is
`mailto:WoSiegert@hotmail.com`. A named incident operator and independently
verified private alert destination remain Production-Readiness follow-ups
rather than beta-showcase publication blockers.

## Release profile

JoinSplit is deployed to Render's Frankfurt region with Neon in AWS Frankfurt as a
limited public portfolio application. The release remains accountless-first and
single-owner, with an optional M5 Account and Multi-Device slice. It does not
add collaboration, PWA or Capacitor infrastructure.

Production consists of one free Render Docker web service containing Nuxt,
Laravel, Apache and the Laravel scheduler, plus one Neon Free PostgreSQL project
in AWS `eu-central-1`. Both applications share one container and browser HTTPS
origin solely to keep this low-traffic showcase at a USD 0 baseline.

This trades resource isolation, continuous availability and guaranteed cleanup
or restore schedules for cost. Provider limits or a configured payment method
can still cause suspension or overage charges. Upgrading requires a new human
decision.

Production, test and development data remain strictly separate. Production
credentials must never be available to CI test jobs, local tooling or browser
code.

## Canonical origin and routing

The canonical application origin is `https://joinsplit.tiny-bits.org`. It is
the only supported browser origin because the anonymous Access Identity, its
credential and local application state are bound to that origin in IndexedDB.
The portfolio at `https://tiny-bits.org` links to this origin; it does not host
a second copy of the application.

Apache preserves the complete request path and handles these routes inside the
combined container:

| Public path | Component |
| --- | --- |
| `/api/*` | Laravel |
| `/up` | Laravel |
| `/ready` | Laravel |
| all remaining paths | Nuxt |

The Render service hostname and every alternate hostname must redirect to
the canonical HTTPS domain, either at the platform edge or in application
middleware. HTTP redirects to HTTPS. Alternate hostnames must not serve a
second working copy of the application because that would create a separate
IndexedDB identity and data silo.

Nuxt calls the API through the same canonical origin. Cross-origin API access
is not part of this release. Laravel must not publish a wildcard CORS policy.
API responses and authenticated requests must not be cached by an intermediary.
The proxy must preserve `Authorization` and `X-Access-Identity-ID` and Laravel
must trust only proxy information supplied by Render and local Apache.

## Runtime and network configuration

Both application components use the versions already pinned by the repository:

- Node 24 and the pinned pnpm version for Nuxt,
- PHP 8.5 and Composer 2 for Laravel,
- PostgreSQL 18.

Nuxt and Laravel communicate only inside the container. Neon is reached through
its managed TLS endpoint; private database networking would require a paid plan
and is not justified for this showcase. Database connections
require certificate and hostname verification with `sslmode=verify-full` and
the operating-system CA bundle. The production guard accepts only a
`.neon.tech` host. Connection strings and CA configuration must never be
committed, printed or included in browser code.

## Environment and secrets

Render stores production secrets as encrypted runtime-only values. At a
minimum, Laravel requires:

- `APP_ENV=production`,
- `APP_DEBUG=false`,
- `APP_URL=https://joinsplit.tiny-bits.org`,
- one Laravel-generated production `APP_KEY` entered as a Render secret,
- the pooled Neon PostgreSQL connection URL,
- the direct Neon hostname used automatically for migrations,
- `DB_SSLMODE=verify-full`,
- the operating-system CA bundle path,
- a production log channel that writes to standard error.

Nuxt receives only public runtime configuration. Its API base must resolve to
the same canonical HTTPS origin. No credential, database value, `APP_KEY` or
provider token may be exposed through Nuxt public runtime configuration.

Production startup or deployment fails before receiving traffic when any of
the following is true:

- the canonical domain is absent,
- `APP_ENV` is not `production`,
- debug mode is enabled,
- `APP_URL` or the public API base uses HTTP, localhost or `127.0.0.1`,
- the frontend and backend origins differ,
- a required secret is missing,
- the database connection is public or cannot verify its TLS peer,
- the database schema is not at the expected migration level.

Secrets and complete connection strings must not appear in build, deployment,
application or health-check output.

## Deployment and human gate

Automatic deployment from source changes is disabled for the combined service
with `autoDeployTrigger: off`.

Every production deployment requires explicit approval from the named human
release operator. A green CI run or a push to `main` does not by itself grant
production deployment approval.

The release procedure is:

1. identify the approved commit and its successful full CI run,
2. build immutable Nuxt and Laravel deployment artifacts from that commit,
3. validate the production configuration without printing secret values,
4. confirm that Render still proposes the Free plan,
5. let the single-instance startup run idempotent migrations and cleanup,
6. deploy the combined service,
7. require successful liveness and readiness checks,
8. verify the canonical HTTPS redirect, the main application shell and a
   bounded API smoke test,
9. record the commit, Render deployment identifiers, migration result and
   operator.

Production release jobs must never run test seeders, `migrate:fresh` or another
destructive test command.

## Liveness and readiness

Laravel exposes two deliberately different checks:

- `/up` is a liveness check. It confirms that the Laravel process can answer a
  request and does not depend on PostgreSQL.
- `/ready` is a readiness check. It confirms that required configuration is
  valid, the expected schema is present and a minimal PostgreSQL query succeeds.

Both endpoints return only a small status response. They never expose
configuration, versions, hostnames, credentials, exception messages or SQL
details. The combined service routes public `/up` to Laravel and Render uses it
to decide whether to route traffic. Laravel readiness remains an external
operational check.

Nuxt additionally exposes the internal lightweight `/health` component check.
Render continuously checks public `/up`. The canonical application URL and
Laravel readiness are verified
manually at release and during operational review; no continuous external
availability monitor is promised for the zero-cost showcase. Health checks
never use a mutation endpoint.

## Migrations and rollback

The free service cannot use paid one-off release jobs. Its startup script runs
idempotent migrations before starting Apache and Nuxt. This is accepted only
for the single-instance showcase topology.

Production migrations must be compatible with the previous application
revision for the duration of a rollback. Destructive schema changes use an
expand-and-contract sequence across separate releases.

App rollback selects one of Render's retained successful deployments.
It restores application code and configuration but does not automatically
reverse database migrations or data. `migrate:rollback` is not part of the
normal deployment rollback procedure.

If migration, readiness or smoke verification fails, the new deployment does
not receive normal traffic. The operator restores the preceding application
deployment when it remains schema-compatible. Database restore is a separate
disaster-recovery operation and requires an explicit human decision.

## Application-data retention

The public portfolio release permits access to server-side application data for
at most 30 days after the latest successfully accepted authenticated mutation
for its owning Access Identity. The server updates the identity activity
timestamp in the same transaction that accepts the mutation or confirms its
idempotent retry. Whether the response reaches the browser does not affect that
timestamp. Merely opening or reading the local application does not contact the
server and does not renew server retention.

Cleanup runs on every service cold start and daily while the free service is
awake. It removes expired Access Identities and all owned data in a
transactionally safe cascade, is idempotent, and reports aggregate counts only.
Because Render suspends idle free services, physical deletion has no fixed
deadline while the showcase receives no traffic. The former 24-hour cleanup
guarantee is withdrawn and public wording must disclose this limitation.

### Expired client semantics

Expiration removes the server copy only. It cannot remotely delete IndexedDB
from the user's browser.

After the server copy becomes unavailable:

- the local browser data remains available until the user clears or deletes it,
- the old Access Identity credential does not recreate the deleted server
  Group implicitly,
- ordinary mutations for an identity that is no longer active receive a stable
  non-retryable result rather than triggering implicit registration,
- the UI explains that the server retention period ended, local data may still
  exist, and synchronization cannot resume for that Group,
- the client does not silently generate new IDs or upload the expired Group as
  a new Group.

The API uses generic `410 Gone` for an ordinary mutation whose syntactically
valid Access Identity is no longer present. The client interprets this result
as ended synchronization only when its local
state records a prior successful synchronization for that identity. Every
Group under that local identity becomes terminal local-only state. The
supported client sends registration only for a fresh identity that has never
synchronized and does not re-register an expired identity or synchronize newly
created Groups under it. Missing or malformed credentials and credential
mismatches use generic `401` responses instead. Public-facing presentation of
the terminal state remains part of the disclosure work.

After physical cleanup, the server has no retirement record and cannot
distinguish the old random identity ID from another unseen ID. M4 intentionally
adds no permanent revocation ledger. Non-re-registration is therefore enforced
by the supported client protocol, not promised as protection against modified
clients or direct API submissions. The explicit registration endpoint remains
rate-limited and ordinary mutation endpoints never register unknown identities.

The initial public-demo limits are deterministic fixed windows:

- identity registration: thirty requests per minute per source IP,
- Group creation: ten requests per minute per source IP and Access Identity,
- all other authenticated mutations: sixty requests per minute per source IP
  and Access Identity.

Exceeding a limit returns a generic `429` response and never logs credentials
or request bodies. Changing these limits requires measured operational evidence;
it is configuration tuning, not a product-scope expansion.

### Local reset

M4 provides no server-erasure endpoint. An explicit local reset removes the
current browser's IndexedDB data and credential only after warning about local
Groups and unsynchronized changes. It does not contact the server and must not
claim to delete synchronized server data. Those copies remain governed by the
automatic retention and backup boundaries.

After reset, the next application start creates a new Access Identity. The old
server copy is neither recoverable nor associated with the new identity.

## Backups, recovery and deletion horizon

Neon Free's short Instant Restore history is a best-effort infrastructure aid,
not a recovery commitment or user backup. No additional backup service is
introduced. There is no guaranteed RPO, RTO, 24-hour physical cleanup deadline,
or 38-day maximum technical deletion horizon in the free showcase profile.
Paid recovery and deterministic deletion infrastructure are deferred until a
real usage need justifies them. Deliberate Neon project destruction remains a
separate destructive human action.

Database backups do not contain browser IndexedDB and cannot recreate a lost
anonymous bearer credential. A server restore only restores access for a
browser that still possesses its matching credential.

## Logs and monitoring

Nuxt and Laravel write runtime logs to standard output or standard error for
Render collection. Data-bearing runtime, request, proxy, security and database
logs are retained for no more than seven days. The actual Render workspace
retention must be verified before release. Any configured
forwarding destination must enforce the same maximum and remain in an approved
EU region. Render build and deployment output and provider metadata must
contain neither user data nor secrets.

Logs must not contain:

- `Authorization` values,
- Access Identity credentials or credential digests,
- complete database connection strings,
- request bodies containing financial data,
- Group, Participant, Expense or Settlement names,
- secret environment values.

Operational logs may contain timestamps, severity, component, deployment
identifier, route template, response status, duration, generated correlation
identifier and aggregate cleanup or backup counts. Unexpected persistence
errors retain useful internal causality while client responses remain generic.

The zero-cost showcase uses a deliberately bounded mix of automatic provider
checks and dated manual operational reviews.

Render automation covers:

- `/up` liveness through the configured service health check,
- failed builds or deployments through failure notifications,
- a running service becoming unhealthy through failure notifications,
- migrations and startup cleanup indirectly because either failure aborts
  container startup,
- provider Free-limit notifications where Render exposes them,
- managed certificate issuance and renewal.

The release operator manually verifies and records:

- the canonical HTTPS origin, redirects, certificate and domain,
- `/ready`, including the Neon connection and expected schema,
- Render 5xx and 429 metrics,
- awake-time scheduler and cleanup logs,
- Neon storage, compute use and connection capacity,
- provider Free plans, payment-method implications and suspension risk.

Render Free does not provide a separately evidenced `/ready` monitor,
configurable 5xx or 429 threshold alerts, awake-time cleanup alerts, or Neon
capacity and connection alerts. The release therefore makes no claim of
continuous external availability monitoring, complete automatic alert
coverage, an SLA, RPO or RTO.

Available failure notifications should go to a named incident operator. Their
destination and settings must be inspected before a Production-Readiness
declaration. A non-destructive
provider test notification may be used when available, but production must not
be intentionally broken merely to manufacture a test alert. Evidence and open
gaps are recorded in [`m4-release-evidence.md`](m4-release-evidence.md).

## Required beta-showcase inputs

The following operational values are intentionally not inferred from the
public contact and must be supplied before production deployment:

- the named human release operator,
- confirmation that Render and Neon both show their Free plans,
- verified Render runtime-log retention,
- public wording that discloses free-tier availability, deletion and recovery
  limitations.

The incident operator, independently verified alert destination and manual
capacity/metrics review remain documented Production-Readiness follow-ups.
