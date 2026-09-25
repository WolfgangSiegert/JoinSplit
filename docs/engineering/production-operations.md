# Production Operations Contract

## Status

This document defines the approved M4 target contract for a public JoinSplit
portfolio release on DigitalOcean. It is not a description of the repository's
current production readiness.

The complementary product and public-claim boundary is defined in
[`../product/portfolio-demo.md`](../product/portfolio-demo.md).

The versioned deployment boundary, readiness endpoint and operational procedure
are implemented by JS-029. The committed App Platform file is a deliberately
blocked template, not deployment authorization; see
[deployment-runbook.md](deployment-runbook.md). Retention cleanup and its
operational verification remain required before public release.

The canonical application domain is `https://joinsplit.tiny-bits.org`. The
approved public operator is Wolfgang Siegert and the privacy contact is
`mailto:WoSiegert@hotmail.com`. The named human release and incident operator
and the private alert destination remain separate required pre-release inputs.

## Release profile

JoinSplit is deployed to DigitalOcean's Frankfurt region (`fra` / FRA1) as a
limited public portfolio application. The release remains accountless-first and
single-owner. It does not add accounts, collaboration, PWA or Capacitor
infrastructure.

Production consists of:

- one Nuxt service using Node 24,
- one Laravel service using PHP 8.5,
- one DigitalOcean Managed PostgreSQL 18 Standard Edition database,
- one App Platform app with a single canonical HTTPS origin.

The initial infrastructure budget ceiling is USD 35 per month, excluding
domain registration, taxes and exceptional traffic overage. The actual memory
requirements of the built Nuxt and Laravel services must be measured before
provisioning. A configuration expected to exceed the ceiling requires a new
human decision; the platform must not silently select a larger plan.

Production, test and development data remain strictly separate. Production
credentials must never be available to CI test jobs, local tooling or browser
code.

## Canonical origin and routing

The canonical application origin is `https://joinsplit.tiny-bits.org`. It is
the only supported browser origin because the anonymous Access Identity, its
credential and local application state are bound to that origin in IndexedDB.
The portfolio at `https://tiny-bits.org` links to this origin; it does not host
a second copy of the application.

App Platform ingress preserves the complete request path and routes in this
order:

| Public path | Component |
| --- | --- |
| `/api/*` | Laravel |
| `/up` | Laravel |
| `/ready` | Laravel |
| all remaining paths | Nuxt |

The App Platform starter domain and every alternate hostname must redirect to
the canonical HTTPS domain, either at the platform edge or in application
middleware. HTTP redirects to HTTPS. Alternate hostnames must not serve a
second working copy of the application because that would create a separate
IndexedDB identity and data silo.

Nuxt calls the API through the same canonical origin. Cross-origin API access
is not part of this release. Laravel must not publish a wildcard CORS policy.
API responses and authenticated requests must not be cached by an intermediary.
The proxy must preserve `Authorization` and `X-Access-Identity-ID` and Laravel
must trust only the proxy information supplied by App Platform.

## Runtime and network configuration

Both application components use the versions already pinned by the repository:

- Node 24 and the pinned pnpm version for Nuxt,
- PHP 8.5 and Composer 2 for Laravel,
- PostgreSQL 18.

The App Platform app and database are attached to the same FRA1 VPC. Laravel
uses the managed database's private connection value, not its public hostname.
The database accepts only explicitly trusted application and operator sources.

Database connections require TLS certificate and hostname verification with
`sslmode=verify-full` and DigitalOcean Standard Edition's downloaded CA
certificate. DigitalOcean documents `verify-full` for both Standard and
Advanced Edition; Advanced Edition is not required by this release. The CA is
injected as a secret, materialized only in a private runtime location when a
file is required, and never committed, printed or included in an image.
Supporting the CA path in Laravel's PostgreSQL connection configuration is
required before release; the current local configuration alone does not satisfy
this contract. See DigitalOcean's
[PostgreSQL TLS guidance](https://docs.digitalocean.com/products/databases/postgresql/how-to/secure/).

## Environment and secrets

App Platform stores production secrets as encrypted runtime-only values. At a
minimum, Laravel requires:

- `APP_ENV=production`,
- `APP_DEBUG=false`,
- `APP_URL=https://joinsplit.tiny-bits.org`,
- a production-only `APP_KEY`,
- the private PostgreSQL connection values,
- `DB_SSLMODE=verify-full`,
- the managed PostgreSQL CA material or its private runtime path,
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

Automatic deployment from source changes is disabled for both services with
`deploy_on_push: false`.

Every production deployment requires explicit approval from the named human
release operator. A green CI run or a push to `main` does not by itself grant
production deployment approval.

The release procedure is:

1. identify the approved commit and its successful full CI run,
2. build immutable Nuxt and Laravel deployment artifacts from that commit,
3. validate the production configuration without printing secret values,
4. confirm that the latest scheduled backup completed successfully,
5. run `php artisan migrate --force` exactly once in the designated release
   job,
6. deploy both services without automatically routing production traffic to an
   unhealthy component,
7. require successful liveness and readiness checks,
8. verify the canonical HTTPS redirect, the main application shell and a
   bounded API smoke test,
9. record the commit, App Platform deployment identifier, migration result and
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
details. App Platform uses readiness to decide whether to route traffic and
liveness to decide whether to restart a component.

Nuxt has a separate lightweight component health check. External monitoring
checks the canonical application URL and Laravel readiness; it does not use a
mutation endpoint as a health check.

## Migrations and rollback

Only the designated release job runs migrations. Application instances do not
run migrations on ordinary startup.

Production migrations must be compatible with the previous application
revision for the duration of a rollback. Destructive schema changes use an
expand-and-contract sequence across separate releases.

App rollback selects one of App Platform's retained successful deployments.
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

At the 30-day deadline, normal API access to the identity and its data ends. A
scheduled cleanup job runs at least daily and, within the following 24 hours,
removes each expired Access Identity together with all owned Groups and their
Participants, Expenses, Expense Shares and Settlements in a transactionally
safe cascade. Cleanup is idempotent, reports counts without identifiers or
financial data, and alerts the operator when it fails.

This cleanup and its tests are required before public release. No current
timestamp field or job should be assumed to satisfy the policy until the
implementation task has explicitly defined and verified the activity marker.

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

DigitalOcean Managed PostgreSQL's built-in daily backup and seven-day recovery
window is the selected recovery mechanism for the initial portfolio release.
No additional long-term backup service is introduced. Before release, the
actual plan and provider configuration must be verified to satisfy this policy:

- normal API access to production application data ends after 30 days,
- physical cleanup completes within the following 24 hours,
- successful encrypted backups are retained for no more than seven additional
  days,
- application data is therefore unrecoverable no later than a conservative 38
  days after its last qualifying activity,
- backup storage and processing comply with the approved EU deployment and
  provider contract,
- backup access is restricted to the release operator and recovery process,
- deliberate Managed PostgreSQL cluster destruction also destroys its built-in
  backups and is therefore outside the stated RPO/RTO; it requires a separate
  destructive human confirmation and must never be an automated release step,
- the provider expires recovery copies within its verified seven-day window,
- backup or recovery failures visible to the project raise an alert.

The recovery objectives are:

- RPO: at most 24 hours,
- RTO: at most 24 hours.

A restore into an isolated, non-production database must succeed before public
release. Restore tests then run at least quarterly and after any material change
to backup, database or migration configuration. The result records the backup
age, restore duration, migration state and verification outcome without copying
production data into development environments.

Database backups do not contain browser IndexedDB and cannot recreate a lost
anonymous bearer credential. A server restore only restores access for a
browser that still possesses its matching credential.

## Logs and monitoring

Nuxt and Laravel write runtime logs to standard output or standard error for
App Platform collection. Data-bearing runtime, request, proxy, security and
database logs are retained for no more than seven days. Any configured
forwarding destination must enforce the same maximum and remain in an approved
EU region. DigitalOcean's separate build and deployment logs may remain for the
provider's fixed 90-day period; build and deployment output must therefore
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

Monitoring must cover:

- canonical HTTPS availability,
- Nuxt health,
- Laravel liveness and readiness,
- elevated 5xx and 429 rates,
- failed deployments and migrations,
- failed retention cleanup,
- backup age and backup failure,
- quarterly restore-test status,
- database capacity and connection exhaustion,
- certificate and domain failures.

Alerts go to the named operator. Monitoring must be verified with a controlled
test alert before public release.

## Required pre-release inputs

The following operational values are intentionally not inferred from the
public contact and must be supplied before production deployment:

- the named human release and incident operator,
- the operator's alert destination.
