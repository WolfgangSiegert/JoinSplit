# JoinSplit Public Portfolio Demo Contract

## Status and Purpose

This document defines the product, data-handling and public-claim boundaries
for the M4 JoinSplit web portfolio release.

The release is a public portfolio demo. It demonstrates the existing
single-owner expense-sharing workflow and its engineering quality. It is not a
production financial service, a durable record-keeping system or a suitable
place for sensitive personal or financial information.

The canonical public application domain is
`https://joinsplit.tiny-bits.org`. The release is also presented from the
portfolio at `https://tiny-bits.org`. The approved responsible operator is
Wolfgang Siegert and the public privacy contact is
`mailto:WoSiegert@hotmail.com`.

The selected showcase infrastructure has a USD 0 monthly baseline within the
Render and Neon free-tier limits. Any paid upgrade or enabled overage requires
a new human decision.

The complementary deployment and operating boundary is defined in
[`../engineering/production-operations.md`](../engineering/production-operations.md).

## Implementation Status

This document defines the approved M4 target contract. It does not claim that
all described release behavior is already implemented or deployed.

The current application already provides the local single-owner workflow,
durable IndexedDB state and queued API synchronization described by the
repository's MVP and architecture documents. The public release is explicitly
labelled as a beta showcase. The following parts define its implemented and
verified release boundary:

- the Render Frankfurt and Neon AWS Frankfurt production deployment with one
  shared browser HTTPS origin,
- automatic active-data expiry after 30 days,
- explicit free-tier availability, deletion and recovery limitations,
- the expired local-only state and terminal synchronization behavior,
- the seven-day data-bearing operational-log limit and the provider metadata
  exception,
- disclosed cold-start and provider-suspension behavior,
- the reduced M4 showcase browser acceptance defined below,
- the canonical-domain deployment and portfolio entry.

The public test-data warning, detailed disclosure view and explicit local-reset
boundary are implemented by JS-030. The approved public operator is Wolfgang
Siegert and the privacy contact is `mailto:WoSiegert@hotmail.com`. Production
startup rejects missing or placeholder operator and privacy-contact
configuration.

Later sections use "must" for these release requirements. They describe the
required state before publication, not necessarily current behavior.

## Intended Audience

The primary audience is:

- technical recruiters and hiring managers,
- software engineers and architects,
- prospective clients evaluating product and engineering work.

Small-group organisers may explore the demo as a secondary audience, subject
to the test-data boundary below.

## Test-Data Boundary

The demo must tell users before their first data entry:

> This is a public portfolio demo. Use invented names and test amounts only.
> Do not use it for real settlements, sensitive personal data or durable
> record keeping.

The same warning must remain reachable from the application after onboarding.
It is a usage boundary, not a technical guarantee: JoinSplit cannot reliably
distinguish invented data from real data. The operational retention and
retention requirements in this document therefore apply to all submitted data.

## Single-Owner Usage Model

One person manages an entire Group from one browser installation.

A Participant is a person represented in the financial calculation. A
Participant is not a JoinSplit user and receives no application access. The
demo provides no invitations, shared live access, participant confirmation or
collaborative editing.

## Accountless Browser Identity

The demo requires no account or registration. The browser creates a random
Access Identity and a separate secret credential. Both are stored locally in
that browser.

"No account required" does not mean that submitted data is anonymous. Names,
expenses and settlements can be personal data even without registration.

There is no:

- credential recovery,
- account-based recovery,
- cross-browser or cross-device retrieval,
- server-side Group download or restore workflow.

Clearing browser storage, losing the device or losing the credential can make
the local state and access to a synchronized server copy permanently
unrecoverable. The server copy is not a user backup.

## Local and Server Data

The browser stores the Access Identity, credential, Groups, Participants,
Expenses, Expense Shares, Settlements, settings and pending mutations in
IndexedDB.

When a network connection is available, pending mutations are sent over HTTPS
to the Laravel API and persisted in PostgreSQL. The approved M4 deployment
uses one free Render Docker service in Frankfurt for Nuxt and Laravel and Neon
Free in AWS Frankfurt for PostgreSQL. Apache serves both applications from one
browser HTTPS origin inside the combined container. That deployment remains a
release prerequisite until implemented and verified.

The server is authoritative for accepted mutations while the corresponding
active server data exists. This authority does not make the portfolio demo a
durable storage service and does not override the expiry contract below.

## Offline Boundary

The locally available core workflow remains usable without an API connection
after the web application has loaded. Local changes are durably queued and can
be synchronized when the connection returns.

The M4 release does not include a Service Worker, PWA installation or an
offline application shell. It therefore does not guarantee that JoinSplit can
be opened for the first time, restarted or reloaded without a network
connection. Public descriptions must not shorten this boundary to an
unqualified claim that the web application "works fully offline".

## Active Server-Data Retention

Active server data becomes unavailable 30 days after the most recent
successfully accepted authenticated mutation for its owning Access Identity.

The server updates the identity activity timestamp atomically with accepting a
mutation or confirming its idempotent retry. Whether the response reaches the
browser does not change that server-side timestamp. Merely opening the
application, viewing local data or attempting a mutation that the server does
not accept does not extend retention.

Cleanup runs at container startup and daily while the free Render service is
awake. It deletes the Access Identity and all owned records as a cascade. An
idle free service is suspended, so physical deletion has no guaranteed deadline
until the service wakes again. Only invented test data is permitted partly
because this free showcase profile provides no fixed deletion horizon.

## Recovery Backups and Technical Deletion Limit

Neon Free's short restore history is best-effort provider functionality. It is
not a user backup and JoinSplit promises no RPO, RTO, or maximum technical
deletion date. Paid recovery guarantees are outside the initial showcase.

## Expired Local-Only State

Automatic server expiry does not delete the corresponding IndexedDB data.
Local Groups and their financial state remain available in the originating
browser.

Once server unavailability is established, the application must present every
Group of the affected Access Identity as local-only and explain that server
synchronization has ended. The client establishes this only for an identity
with a locally recorded prior successful synchronization when an ordinary
mutation receives the API's stable non-retryable response for a retired
identity.

The retired local identity remains terminal in the supported JoinSplit client.
The client records whether an identity has ever synchronized successfully;
only a never-synchronized fresh identity uses the registration path. The
supported client does not re-register an identity whose server copy is no
longer available or sync new Groups under it.

Starting a fresh synchronized demo session requires an explicit local reset
that warns about and removes the old local-only data, then creates a new Access
Identity. The application must not:

- retry the rejected mutation indefinitely,
- silently claim that the Group is synchronized,
- automatically reconstruct the deleted server aggregate,
- register the retired Access Identity again,
- discard the local financial state as a side effect of server expiry.

Recreating an expired server aggregate is outside M4.

After physical cleanup, the API cannot distinguish the old random identity ID
from another previously unseen ID without retaining a server-side retirement
record. M4 deliberately introduces no permanent revocation ledger. The
non-re-registration rule is therefore a supported-client guarantee, not a
security boundary against a modified client or direct API resubmission. Rate
limits and the test-data boundary still apply to such new submissions.

## Local Reset and Server Deletion Boundary

M4 does not provide immediate manual deletion of synchronized server data. A
local reset is deliberately limited to the current browser:

1. it warns that local Groups, credentials and unsynchronized changes will be
   permanently removed,
2. it explains that synchronized server copies are not deleted by the reset
   and remain subject to automatic retention,
3. it requires explicit confirmation,
4. it removes the IndexedDB data and credential,
5. the next application start creates a fresh Access Identity.

The reset must never claim that server data has been erased. Once the old
credential is removed, the server copy cannot be recovered or manually deleted
through JoinSplit. Server cleanup remains subject to the free-tier wake-up
limitation described above.

## Logs

Data-bearing application runtime, request, proxy, security and database logs
may be retained for no more than seven days. Render build and deployment logs
and provider metadata must contain neither user data nor secrets. The actual
workspace retention must be verified before release; a provider default that
exceeds this boundary blocks release unless data-bearing output is routed to a
compliant destination.

Logs must not contain:

- plaintext Access Identity credentials,
- Authorization headers,
- complete mutation payloads,
- Participant names or financial descriptions unless a narrowly scoped
  incident investigation requires them and the same seven-day limit is
  preserved.

Provider defaults must be verified against this contract before release.

## Availability and Recovery Boundary

Render suspends the free service after inactivity and the next request can take
about a minute to wake it. Monthly provider limits can suspend the application.
There is no availability SLA, RPO or RTO. The server copy and local browser
state are not supported backups. These limitations reinforce the rule that only
invented, non-sensitive test data may be used.

## M4 Showcase Browser Acceptance

The beta showcase release requires:

- one complete manual reference flow in a current desktop browser,
- automated Chromium, Firefox and WebKit coverage for the public shell,
- automated application integration tests in Chromium,
- automated accessibility checks and 320 CSS-pixel reflow verification,
- accurate disclosure of browser binding, offline and free-tier limitations.

The complete stable Chrome, Edge, Firefox and Safari desktop matrix plus current
iOS Safari and Android Chrome remains a Production-Readiness gate. It is
deliberately deferred while JoinSplit is a beta portfolio showcase and is not
an M4 publication blocker.

## Public Claim Boundaries

The public portfolio may accurately describe:

- the complete single-owner core workflow,
- local durable browser state,
- queued synchronization after connection recovery,
- deterministic financial domain logic,
- automated tests and the manual checks actually performed,
- the explicit retention, recovery and browser boundaries in this document.

It must not claim:

- production readiness for real financial records,
- anonymous processing merely because no account is required,
- durable backup or recovery,
- cross-device access,
- collaboration or Participant access,
- guaranteed offline application startup,
- PWA or native distribution,
- formal accessibility conformance without a corresponding audit.

## Explicit Non-Goals

M4 does not introduce:

- accounts or login,
- invitations or collaboration,
- multi-device synchronization,
- credential recovery,
- immediate manual deletion of synchronized server data,
- automatic reconstruction of expired server data,
- PWA or Service Worker functionality,
- Capacitor or native applications,
- payment execution,
- additional split methods,
- permanent financial record storage.

## Release Prerequisites

The public release is permitted only after all of the following are confirmed:

- the canonical `https://joinsplit.tiny-bits.org` domain and its HTTPS/DNS
  configuration,
- the JoinSplit entry on `https://tiny-bits.org`,
- the responsible operator and contact details,
- exactly one Render Free web service and one Neon Free project, with no paid
  upgrade or overage enabled,
- the Render Frankfurt and Neon AWS Frankfurt deployment with the shared
  browser HTTPS origin,
- startup and awake-time cleanup with its missing fixed deletion deadline
  disclosed publicly,
- the seven-day limit for data-bearing operational logs and the provider's
  data-free build/deployment log and metadata exception,
- the local-reset warning and server-retention boundary,
- the expired local-only user experience,
- the cold-start, suspension and no-recovery-guarantee disclosure,
- the reduced M4 showcase browser acceptance,
- a visible beta label in the application shell,
- public copy consistent with this contract.

The complete real-browser and real-device matrix, a manually forced
offline/reconnect cycle, cold-start timing and independently tested alert
delivery are deferred Production-Readiness evidence. They do not block this
beta showcase release.
