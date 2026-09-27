# Navigation and Reusable People Contract

## Status and purpose

This is the accepted JS-057 decision package for **M6.5 – Navigation &
People**. It defines the product and architecture boundary for JS-058 through
JS-063. It does not implement UI, persistence, API or database changes.

M6.5 is completed before M7 Native starts. Native work must consume the same
navigation and identity model rather than inventing a platform-specific one.

## Goals

- keep the public product explanation permanently reachable,
- expose the most important creation and Account transitions globally,
- allow a reusable Person to exist without a Group,
- add that Person to multiple Groups without sharing financial identity across
  Groups,
- preserve all existing local-first, Account, history and synchronization
  guarantees.

## Global navigation contract

### Permanent Landing page

`/` remains the Landing page whether the local workspace contains zero, one or
many Groups. It always contains:

- the product promise and overview graphic,
- the short usage guide,
- a stable action or link to the Group selector,
- a Group selector section with the fragment target `#gruppen`.

The brand link always returns to `/`. Existing active, archived and
pending-deletion Group states remain available from the Group selector. The
Landing content must not disappear after the first Group is created.

### Global header actions

The application header provides these actions on every primary route:

- **New Group** → `/groups/new`,
- **People** → `/people`,
- **Sign in** for a local-only or anonymous workspace → `/account`,
- **Account** for an authenticated workspace → `/account`.

The Account page continues to provide the login/register choice when no
Account is active. When an Account is active it continues to provide Account
state, conflict handling, logout and deletion. Password recovery, email
verification, email change, password change and session/device management are
not implied by the global header action.

At narrow widths the actions may use a compact accessible menu. New Group,
People and Account access must not disappear behind an unlabeled icon or a
desktop-only breakpoint. The theme control remains available but is not more
important than the primary product actions.

After successful Group creation the existing behavior remains: the newly
created Group context opens immediately.

## Identity concepts

JoinSplit distinguishes four concepts:

```text
Account
  optional authenticated owner of durable multi-device data

Access Identity
  authorized application/device access

Person
  reusable human identity in one local or Account workspace

Participant
  financial membership in exactly one Group
```

No relation is implicit:

- an Account is not automatically a Person,
- an Account or Access Identity is not automatically a Participant,
- a Person is not financially involved until a Participant membership is
  created in a Group.

## Person contract

A Person has:

- a stable UUID,
- a normalized display name,
- an active or inactive lifecycle state.

M6.5 deliberately does not add email address, phone number, postal address,
avatar upload, device-address-book identifiers or access permissions to a
Person. Display names are not identity keys. Duplicate normalized display
names require an explicit warning and confirmation but remain allowed.

A Person may be created, renamed and deactivated without any Group. Hard
deletion is allowed only while no Participant references the Person and no
pending mutation depends on it. Otherwise the Person is deactivated.

Deactivating a Person does not silently deactivate existing Participants.
Those Group memberships and their financial histories remain governed by the
existing Participant lifecycle.

## Person and Participant relationship

A Participant gains an optional `personId` association:

```text
Person 1 ── 0..n Participant
Participant 0..1 ── 1 Person
Participant n ── 1 Group
```

The following rules are binding:

1. A Person may have at most one linked Participant in the same Group.
2. Adding a Person to a Group creates a new Group-scoped Participant with its
   own UUID and stable Group order.
3. The new Participant copies the Person display name at creation time.
4. Renaming a Person never silently rewrites a Participant name or historical
   financial display.
5. Renaming a Participant never renames the linked Person.
6. An explicit unlink removes only the association. It deletes neither object
   and changes no Expense, ExpenseShare, Settlement, Balance or Snapshot.
7. Existing Participants remain valid with no `personId`.
8. Linking an existing Participant to a Person is an explicit user action and
   never inferred from equal display names.

Expenses, ExpenseShares, Settlements, Balances and Statement Snapshots continue
to reference Participant IDs. No financial algorithm operates on Person IDs.

## Local-first persistence

People are durable local application data in IndexedDB and Pinia runtime
state. JS-060 introduces an explicit schema upgrade and a `people` store. The
upgrade must preserve every existing Group, Participant, Expense,
ExpenseShare, Settlement, setting, Account record and pending mutation.

Local Person writes use the existing success boundary:

```text
validate and prepare
→ atomic IndexedDB commit
→ Pinia update
→ visible local success
```

The application never reports a successful Person or membership mutation
before its local transaction commits. Reset and protected Account logout remove
People under the same privacy and pending-mutation rules as other durable
workspace data.

Existing Participants are not automatically converted into People during the
schema upgrade. This prevents name-based identity guesses and destructive
migration behavior.

## Anonymous and Account behavior

### Without an Account

The People directory is local-only. Existing anonymous server synchronization
continues to synchronize Group Participants, not a global People directory.
A local Participant may retain its `personId` association in IndexedDB, but the
anonymous API must not treat that identifier as a server-authorized global
identity.

This boundary is visible in the UI: People are durable on the current device
but become multi-device data only after Account adoption.

### Account adoption and hydration

When an Account adopts the workspace:

- stable local Person IDs are retained,
- People are imported idempotently,
- Participant-to-Person associations are imported after their Person and Group
  ownership is authorized,
- retry uses stable adoption/import/mutation identifiers,
- equal display names never cause an automatic merge.

An authenticated Account workspace read includes authorized People and the
optional Person association of each Participant. Hydration commits the
validated Account snapshot atomically with the existing Group data.

Person mutations use revision preconditions and explicit conflict responses.
Group membership-link mutations remain part of the relevant Group revision
boundary. M6.5 does not introduce last-write-wins, field-level merge or a CRDT.

Logout and Account deletion follow the existing M5 privacy boundary. Account
People, their local associations, Account pending mutations and Account
metadata are removed from the device only after the existing pending-mutation
checks or an explicit discard decision.

No Account bearer token, password, session identifier or password digest is
stored in IndexedDB or localStorage.

## Duplicate and lifecycle behavior

- Duplicate Person names: warn and require explicit confirmation.
- Duplicate Participant names in one Group: preserve the existing warning.
- Same Person twice in one Group: reject; confirmation cannot override it.
- Same Person in different Groups: allowed and creates distinct Participants.
- Inactive Person: unavailable for new Group membership, existing Participants
  remain unchanged.
- Inactive Participant: existing financial and Settlement rules remain
  unchanged even if its Person is active.
- Archived Group: Person association changes require Group reactivation.

## Account settings boundary

M6.5 makes the existing Account management globally reachable. It does not
claim a complete production Account-settings suite. The implemented Account
surface currently covers registration, login, local-data adoption, workspace
status, conflict recovery, protected logout and Account deletion.

The following remain explicit non-goals for M6.5:

- password reset or recovery,
- password or email change,
- email verification,
- a device/session list and remote session revocation,
- OAuth, social login or passkeys.

## Accessibility and responsive behavior

- Every global action has an accessible name and visible focus.
- Essential actions remain available at 320 CSS pixels.
- Menus support keyboard operation, Escape and focus return.
- Anchored navigation moves to a labelled Group section without obscuring the
  heading behind the sticky header.
- Duplicate, inactive, offline and conflict states are conveyed with text and
  not by icon or color alone.
- Destructive Person or Account actions name the affected object and require
  confirmation.

## Non-goals

- automatic Participant creation for every existing name,
- name-based identity merging,
- device-address-book import,
- invitations, collaboration or Participant login,
- Person contact profiles,
- automatic propagation of names across Groups,
- changes to financial algorithms,
- M7 Capacitor or native-platform work.

## Downstream task boundaries

| Task | Responsibility |
| --- | --- |
| JS-058 | Permanent Landing and anchored Group selector |
| JS-059 | Responsive global header and Account-state actions |
| JS-060 | Local Person domain, IndexedDB upgrade and People UI |
| JS-061 | Participant association, Group assignment and idempotent Group sync |
| JS-062 | Account adoption, People sync, revisions and device hydration |
| JS-063 | Integration, accessibility, migration and regression evidence |

## JS-057 acceptance

JS-057 is complete when this contract is human-approved and the downstream
tasks need no further product decision about navigation, identity, history,
duplicates, persistence, adoption, conflicts or Account cleanup.
