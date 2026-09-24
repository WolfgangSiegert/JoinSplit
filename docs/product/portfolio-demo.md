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
portfolio at `https://tiny-bits.org`. The responsible operator's contact
details must be confirmed before release; until they are available, the public
release is not complete.

The approved initial infrastructure budget ceiling is USD 35 per month,
excluding domain registration, taxes and exceptional traffic overage. Any
configuration expected to exceed that ceiling requires a new human decision.

The complementary deployment and operating boundary is defined in
[`../engineering/production-operations.md`](../engineering/production-operations.md).

## Implementation Status

This document defines the approved M4 target contract. It does not claim that
all described release behavior is already implemented or deployed.

The current application already provides the local single-owner workflow,
durable IndexedDB state and queued API synchronization described by the
repository's MVP and architecture documents. The following parts of this
contract remain requirements that must be implemented and verified before the
public release:

- the DigitalOcean Frankfurt production deployment and shared HTTPS origin,
- automatic active-data expiry after 30 days,
- the seven-day recovery-backup tail and conservative 38-day technical
  deletion limit,
- the expired local-only state and terminal synchronization behavior,
- the explicit local-reset boundary,
- the seven-day data-bearing operational-log limit and the provider metadata
  exception,
- the 24-hour RPO and RTO procedures,
- the M4 browser verification matrix,
- the public warning, operator contact, canonical domain and portfolio entry.

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
target is DigitalOcean's Frankfurt region, with the frontend and API served
from one shared HTTPS origin. That production deployment remains a release
prerequisite until it has been implemented and verified.

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

After expiry, normal API access to the identity and its data ends immediately.
A daily cleanup must delete the Access Identity and all of its owned Groups,
Participants, Expenses, Expense Shares and Settlements within the following 24
hours. The cleanup must be cascading and must not leave independently usable
financial records behind.

## Recovery Backups and Technical Deletion Limit

Recovery backups may retain purged records for no more than seven additional
days. They are used only for infrastructure recovery and are not available as
a user restore mechanism.

With daily cleanup, the conservative maximum technical retention period across
the active database and recovery backups is therefore 38 days after the last
successfully accepted mutation. Restoring a backup must reapply the active-data
expiry rule before the restored service is made available.

Public wording must distinguish the 30-day active-access period from the
38-day conservative maximum technical deletion boundary.

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
through JoinSplit. Normal API access still ends after 30 days and the
conservative technical deletion boundary remains 38 days after the last
successfully accepted mutation.

## Logs

Data-bearing application runtime, request, proxy, security and database logs
may be retained for no more than seven days. DigitalOcean retains separate
build and deployment logs and metadata for up to 90 days; those provider
records must contain neither user data nor secrets and are not application
runtime logs.

Logs must not contain:

- plaintext Access Identity credentials,
- Authorization headers,
- complete mutation payloads,
- Participant names or financial descriptions unless a narrowly scoped
  incident investigation requires them and the same seven-day limit is
  preserved.

Provider defaults must be verified against this contract before release.

## Availability and Recovery Objectives

The portfolio demo has:

- a recovery point objective (RPO) of 24 hours,
- a recovery time objective (RTO) of 24 hours.

Up to 24 hours of recently confirmed server mutations may therefore be lost
after an infrastructure recovery. Recovery may take up to 24 hours. The local
browser state is not a supported server-recovery source, because acknowledged
pending mutations are removed and no full aggregate re-upload exists.

These objectives are operational limits, not guarantees of uninterrupted
availability or lossless financial record keeping. They reinforce the rule
that only invented, non-sensitive test data may be used.

## M4 Browser Verification Matrix

The release candidate is verified against the stable browser versions current
at the time of M4 release:

- Chrome, Edge, Firefox and Safari on desktop,
- Safari on the current iOS release,
- Chrome on the current Android release.

This is the M4 verification matrix. It is not an unlimited long-term support
commitment for all future browser versions, operating systems or devices.

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
- a measured DigitalOcean configuration within the approved USD 35 monthly
  infrastructure ceiling,
- the DigitalOcean Frankfurt deployment and shared HTTPS origin,
- the 30-day active-data cleanup,
- the seven-day backup tail and conservative 38-day maximum technical deletion
  boundary,
- the seven-day limit for data-bearing operational logs and the provider's
  data-free build/deployment log and metadata exception,
- the local-reset warning and server-retention boundary,
- the expired local-only user experience,
- the 24-hour RPO and RTO procedures,
- the M4 browser verification matrix,
- public copy consistent with this contract.
