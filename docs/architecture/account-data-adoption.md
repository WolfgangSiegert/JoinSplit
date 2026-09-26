# Account and Data-Adoption Contract

## Status

This is the accepted JS-035 decision package for **M5 – Accounts & Multi-Device
Access**. It records the approved product direction and the binding lean
technical contract for JS-036 through JS-042.

JS-036 through JS-042 implement this contract in the repository. Commit
`b970498` passed CI and was deliberately deployed to the canonical production
origin on 2026-09-26. The public beta therefore includes the optional M5 Account
and Multi-Device slice while preserving accountless use.

## Goal

Add optional accounts and multi-device access without removing or degrading the
existing local-first, accountless workflow.

M5 must allow a person to:

- continue using JoinSplit without an account in IndexedDB,
- register or sign in with email and password,
- adopt every Group currently available in the browser,
- load Account Groups on another device and rehydrate them into IndexedDB,
- keep Access Identity, Account and Participant as separate concepts,
- detect concurrent device changes without silently merging or overwriting
  them.

## Approved product decisions

- Accountless use remains available indefinitely in IndexedDB.
- Anonymous server synchronization remains active and retains the M4
  browser-bound, temporary-copy boundary.
- Registration adopts all locally available Groups after explicit confirmation.
- Already synchronized Groups are linked to the Account through their existing
  Access Identity.
- Never-synchronized and expired-local-only Groups use an idempotent,
  authenticated import path.
- Accounts use email, password and a server-side Laravel session.
- The authentication cookie is `Secure`, `HttpOnly` and `SameSite`; no Account
  token is stored in IndexedDB or localStorage.
- An Account may control multiple Access Identities.
- An Account is not a Participant and does not implicitly create one.
- Adopted Account data is excluded from anonymous 30-day pruning.
- Logout checks pending mutations before removing Account data from the device.
- Multi-device conflicts use explicit revisions and do not trigger an automatic
  complex merge.
- Invitations, collaboration, PWA and native packaging remain outside M5.

## Current and target modes

| Mode | Local state | Server authorization | Server lifecycle |
| --- | --- | --- | --- |
| Accountless current mode | IndexedDB, including Access Identity credential | Access Identity ID plus bearer credential | temporary server copy; anonymous retention applies |
| Signed-in M5 mode | IndexedDB Account workspace; no Account token | Laravel session cookie and CSRF protection | Account retention contract; anonymous 30-day pruning does not apply |
| Signed-out after Account use | Account workspace removed; a fresh anonymous workspace may start | no Account session | Account data remains server-side until its separate deletion boundary |

The locally available accountless workflow must not require an Account route or
an available server. Account failures must not break creation and local use of a
fresh anonymous workspace.

## Conceptual identity model

### Account

An Account is a login and server-side authorization principal. It has:

- a stable UUID,
- one normalized unique email address,
- a framework-generated password digest,
- timestamps and lifecycle state.

Plaintext passwords are never logged or persisted. Password hashing uses
Laravel's supported framework facilities; M5 does not add an authentication
package merely to hash passwords.

### Access Identity

An Access Identity remains the actor lineage for locally created records and
Groups. It is either:

- unlinked and controlled by the existing anonymous credential, or
- linked to exactly one Account and authorized through that Account's session.

One Account can control several Access Identities, for example one adopted
browser identity and additional identities created by other signed-in devices.
An Access Identity cannot be moved from one Account to another.

After an Access Identity is linked, its anonymous bearer credential must no
longer provide independent access to Account data. This prevents a copied,
formerly temporary credential from becoming a permanent bypass around Account
authentication. The exact schema transition is a JS-036 implementation detail,
but the security outcome is binding.

### Group ownership

Existing Group ownership remains traceable to its `ownerAccessIdentityId`.
Account authorization covers Groups owned by any Access Identity linked to that
Account. Adoption does not create duplicate Groups or Participants and does not
make the Account a Participant.

### Participant

A Participant remains a Group-local financial person. M5 introduces no mapping
from Account to Participant, no invitation and no collaborative permission.

## Registration and sign-in

Registration requires:

- normalized email,
- password,
- password confirmation,
- an explicit adoption summary and confirmation.

The recommended initial password rule is 12 to 128 characters, with paste and
password-manager use allowed and no composition rules. Registration and login
are rate-limited and use generic authentication errors that do not disclose
whether an email exists.

Successful authentication rotates the Laravel session identifier. Authenticated
state is represented only by the server-side session and its cookie. CSRF
protection is required for every state-changing Account request. A CSRF value
is not an Account bearer token and must not be persisted in IndexedDB or
localStorage.

The same-origin Render deployment does not require Laravel Sanctum, Passport,
OAuth or an external identity provider for this contract. A database-backed
Laravel session is preferred because container-local session files do not
survive replacement of the free Render instance.

## Data-adoption classification

Registration takes one durable snapshot of the local adoption manifest. Every
local Group is classified independently:

1. **Already synchronized and active** — verify the current anonymous
   credential, link its Access Identity to the Account, and expose all Groups
   owned by it without recreating them.
2. **Never synchronized** — import the complete local aggregate through the
   authenticated Account session.
3. **Expired local-only** — import the complete local aggregate through the
   authenticated Account session as an explicit Account recovery operation.
4. **Already adopted by the same Account** — report success without changing
   data.
5. **Owned by another Account or conflicting server data** — reject without
   disclosing foreign data and without overwriting either copy.

The authenticated import in cases 2 and 3 is the deliberate M5 exception to
the M4 supported-client rule that an expired anonymous identity is never
automatically re-registered. Import is never automatic, never anonymous and
never triggered by an ordinary sync retry.

## Adoption atomicity and idempotency

Account creation and adoption are related but not one unbounded database
transaction. Creating an Account must not be rolled back because the browser
disconnects halfway through importing several Groups.

The browser persists:

- one stable `adoptionId` for the confirmed adoption attempt,
- one stable `importId` and immutable aggregate snapshot per imported Group,
- per-Group adoption status and server result.

Retries reuse these identifiers and snapshots.

For one Account and Group:

| Repeated operation | Required result |
| --- | --- |
| same adoption/import ID and identical snapshot | return the original success |
| same ID with a different snapshot | conflict; do not overwrite |
| Group already linked/imported to the same Account | success without duplication |
| Group or Access Identity belongs to another Account | generic conflict/denial; no takeover |
| one Group fails while others succeed | retain exact per-Group progress and resume only incomplete work |

The UI must not claim that all local data is adopted until every Group has a
confirmed result. A partial result is visible and retryable.

## Account read and device hydration

After login, the server returns the Account's Groups across all linked Access
Identities with their Participants, Expenses, Expense Shares, Settlements and
revision metadata. The client validates the response before replacing or
adding IndexedDB records.

Hydration is an explicit durable operation:

1. authenticate the Account session,
2. fetch a consistent Account snapshot or paginated snapshot contract,
3. validate IDs, relationships, amounts and revisions,
4. write each consistent hydration unit atomically to IndexedDB,
5. update Pinia only after the IndexedDB commit,
6. resume pending synchronization only after hydration is complete.

Server responses and transient loading/error state remain non-persisted.
Account tokens do not become part of Pinia, domain entities, pending mutations
or IndexedDB.

The hydrated Account workspace remains locally available under the same
offline-first expectations until explicit logout. Session expiry stops server
operations and requires re-authentication; it does not silently erase or
pretend to synchronize local data.

## Revision and conflict boundary

Every Group receives a monotonically increasing server revision. Every accepted
Group mutation atomically checks `expectedRevision` and advances the revision.
Idempotent replay of an already accepted mutation returns its recorded result
without advancing the revision again.

Hydration records the server revision in IndexedDB. New pending mutations bind
to the locally known base revision and remain ordered per Group.

When another device has already advanced the Group, the server returns a stable
conflict response containing only authorized revision metadata. The client:

- stops later mutations for that Group,
- marks the Group as conflicted,
- preserves the local state and pending mutations for inspection,
- does not retry automatically with a newer revision,
- does not perform field-level or last-write-wins merging.

The recommended lean M5 resolution is explicit server replacement: the user may
cancel and keep inspecting the local conflicted state, or confirm that the
local pending changes are discarded and the authorized server snapshot is
rehydrated. A manual merge UI, duplicate-Group recovery and automatic merge are
outside M5.

## Logout contract

Logout is a privacy and local-state boundary, not only a cookie operation.

If no pending Account mutations exist:

1. invalidate the current server session,
2. remove Account-derived Groups and related records from IndexedDB,
3. remove linked Access Identity credentials and Account adoption metadata from
   the device,
4. clear the Account runtime state,
5. leave non-Account presentation settings only where they contain no Account
   data,
6. start a fresh anonymous workspace on the next local operation.

If pending Account mutations exist, the UI reports their count and affected
Groups. It offers:

- stay signed in,
- synchronize and log out after confirmation,
- explicitly discard pending changes and remove all Account data locally.

Logout must never silently drop pending changes. It must also remain possible
while offline through the explicit discard path; server-session invalidation is
then best effort and the cookie is expired locally.

## Retention, deletion and recovery boundary

Linking or importing a Group into an Account removes it from anonymous
30-day pruning. This does not create an SLA, backup guarantee or restore
promise. Render/Neon free-tier availability and recovery limitations remain.

The approved Account retention and deletion boundary is:

- Account data persists until explicit Account deletion,
- self-service Account deletion is part of M5 before public rollout,
- deletion requires fresh password confirmation,
- the server invalidates all sessions and deletes the Account, linked Access
  Identities and owned Groups as one controlled cascade,
- the current device then performs the same local cleanup as logout,
- provider recovery remnants remain subject to the disclosed best-effort
  free-tier boundary rather than an immediate physical-erasure promise.

Without an approved deletion or expiry rule, M5 must not be publicly described
as having a complete Account data-lifecycle contract.

## Security boundaries

- `Secure`, `HttpOnly`, `SameSite=Lax` session cookie in production.
- Laravel session ID rotation on registration, login and privilege change.
- CSRF protection on every state-changing session-authenticated request.
- No Account bearer token, password or password digest in IndexedDB,
  localStorage, URLs, logs, domain payloads or pending mutations.
- Database-backed server sessions with explicit expiry and revocation.
- Generic login, registration, adoption and import errors where details could
  disclose another Account or Group.
- Rate limits for registration, login, adoption/import and Account reads.
- Existing Access Identity credentials remain separated from domain data and
  lose independent authorization after linking.
- Account reads and writes authorize through server relationships, never through
  client-supplied Account or owner IDs.
- Logging continues to exclude credentials, email addresses, names, financial
  payloads and session identifiers.

## Accepted detailed decisions

1. **Registration confirmation:** M5 uses an explicit in-app confirmation, not
   email verification. Email delivery infrastructure remains outside M5.
2. **Password recovery:** M5 has no reset flow and discloses that a forgotten
   password is not recoverable. This is a usability limitation, not a
   production-grade Account claim.
3. **Account deletion:** The self-service deletion contract above is required
   before public M5 rollout.
4. **Session lifetime:** There is no remember-me option. The server-side idle
   expiry is 12 hours. Expiry stops synchronization but does not silently erase
   the locally hydrated workspace.
5. **Conflict resolution:** M5 provides explicit discard-and-rehydrate only,
   with no automatic or manual field merge.

## M5 non-goals

- Participant invitations or collaborative Group access
- linking an Account automatically to a Participant
- OAuth, social login, passkeys or external identity providers
- Account tokens stored in browser persistence
- automatic conflict merge, last-write-wins or CRDTs
- shared real-time editing
- PWA, Service Worker, Background Sync or Capacitor
- SLA, durable backup or guaranteed restore
- migration of arbitrary external files or data formats

## JS-035 acceptance criteria

JS-035 is complete because:

- the five detailed decisions are explicitly accepted,
- current anonymous and target Account modes are clearly separated,
- identity linking and Account authorization preserve Account/Participant
  separation,
- active linking and never-synchronized/expired imports have deterministic,
  idempotent outcomes,
- partial adoption and retry behavior are defined,
- hydration and local atomicity are defined without storing Account tokens,
- Group revision and conflict behavior prevent silent overwrite,
- logout and Account deletion have explicit pending-data and local-cleanup
  semantics,
- anonymous versus Account retention claims are testable and non-contradictory,
- JS-036 through JS-042 can be implemented without making new product decisions.
