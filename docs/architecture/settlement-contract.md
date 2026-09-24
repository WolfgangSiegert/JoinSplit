# Settlement Contract — JS-020

## Status and scope

This document is the approved implementation contract for Settlement CRUD and
its effect on financial state. It specializes the domain model and local
persistence architecture for JS-021 without introducing accounts, payment
processing, server reads, conflict merging or a generic sync framework.

A Settlement records a payment that has already happened outside JoinSplit. A
Settlement Proposal remains a derived suggestion and is never persisted as a
Settlement automatically.

## Domain representation

```ts
interface Settlement {
  readonly id: string
  readonly groupId: string
  readonly senderParticipantId: string
  readonly receiverParticipantId: string
  readonly amountMinor: bigint
  readonly occurredOn: string
  readonly creatorAccessIdentityId: string
}

type DurableSettlementSnapshot = Omit<Settlement, 'amountMinor'> & {
  readonly amountMinor: string
}
```

`Settlement` is the runtime Domain type. `DurableSettlementSnapshot` is the
full IndexedDB/outbox snapshot and the representation returned inside the HTTP
response envelope. Create and update request mappers select and rename its
fields according to the exact bodies below. Its `amountMinor` string is subject
to the canonical validation defined below. The two types must not be used
interchangeably.

- `id` is a client-generated UUID v4.
- Sender and receiver are different Participants in the same Group.
- `amountMinor` is a positive integer in euro cents, at most
  `9223372036854775807` (the maximum signed 64-bit integer).
- `occurredOn` is a valid calendar date in `YYYY-MM-DD`; future dates are
  valid.
- The server derives `groupId` and `creatorAccessIdentityId` from the route and
  verified Access Identity. An update preserves both.
- JS-021 does not add a Settlement note.

Creating the first Settlement irreversibly sets the Group's
`hasFinancialHistory` flag locally and server-side. Deleting every Settlement
does not clear it. A Participant referenced by a Settlement is no longer
eligible for hard deletion. Archived Groups reject create, update and delete.

## Financial-state effect

For Participant `p`, a Settlement affects the derived Balance as follows:

```text
Balance(p) = paid Expenses
             - assigned ExpenseShares
             + Settlements sent by p
             - Settlements received by p
```

Create and update validation use the current balances before applying the
proposed payment. When updating, the existing Settlement is removed from the
balance calculation first. This prevents the record being edited from
validating against its own effect. Delete reverses the stored Settlement and
does not apply the create/update direction or maximum-amount rules.

All financial arithmetic is exact in minor units. TypeScript runtime Domain
values and calculations use `bigint`. PHP uses checked signed 64-bit integer
arithmetic; PostgreSQL uses `bigint`. Implementations reject an input or
operation that would exceed the signed 64-bit range instead of rounding,
wrapping or converting through floating point.

### Active Participants

If both Participants are active, any positive same-Group payment may be
recorded because the Settlement represents an actual payment, not an enforced
Proposal. This includes partial payments, a payment in the opposite direction
to current balances and a payment that crosses either Participant through
zero.

For a positive valid `amountMinor`, a payment is within both direct open sides
exactly when:

```text
senderBalance <= -amountMinor
and
amountMinor <= receiverBalance
```

Negating the positive Settlement amount is safe because it is at most
`INT64_MAX`; implementations must not negate `senderBalance`, because the
positive counterpart of `INT64_MIN` is not representable as a signed 64-bit
integer. Before saving, the UI requires explicit confirmation when sender and
receiver have the wrong direction or either comparison above is false. These
warnings do not make an active-to-active Settlement invalid. Confirmation is a
local UI guard and adds no field to the Domain object or API payload.

### Inactive Participants

If either Participant is inactive, a create or update is valid only when the
candidate Settlement satisfies both signed comparisons above:

- `senderBalance <= -amountMinor`, and
- `amountMinor <= receiverBalance`.

Therefore an inactive Participant cannot take part in a wrong-direction or
overpaying create or update. A zero Balance is not open. This rule is enforced
in both client domain validation and the server transaction, not only in the
UI. Deleting an existing Settlement from an active Group is allowed regardless
of either Participant's current status or Balance; deletion restores the
financial state from before that Settlement.

## Exact HTTP contract

Every endpoint uses the existing Access Identity headers:

- `X-Access-Identity-ID`
- `Authorization: Bearer <credential>`

There are deliberately no Settlement `GET` endpoints in JS-021.

Every request and response encodes `amountMinor` as the same canonical decimal
string used by durable client state. A JSON number is never accepted or
returned for this field.

### Create

`POST /api/groups/{group}/settlements`

Request body (exact keys):

```json
{
  "settlementId": "00000000-0000-4000-8000-000000000001",
  "senderParticipantId": "00000000-0000-4000-8000-000000000010",
  "receiverParticipantId": "00000000-0000-4000-8000-000000000011",
  "amountMinor": "2500",
  "occurredOn": "2026-09-24"
}
```

A newly created resource returns `201`. Repeating the same client UUID with
the same complete desired state as the same owner returns the existing
representation with `200`. Reusing the UUID for incompatible state returns
`409`.

### Update

`PUT /api/groups/{group}/settlements/{settlement}`

The request contains the complete desired mutable state (exact keys):

```json
{
  "senderParticipantId": "00000000-0000-4000-8000-000000000010",
  "receiverParticipantId": "00000000-0000-4000-8000-000000000011",
  "amountMinor": "2500",
  "occurredOn": "2026-09-24"
}
```

Success returns `200`. Repeating the same complete desired state is
idempotent. Validation calculates pre-payment balances with the stored version
of this Settlement excluded.

### Create and update response

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000001",
    "groupId": "00000000-0000-4000-8000-000000000100",
    "senderParticipantId": "00000000-0000-4000-8000-000000000010",
    "receiverParticipantId": "00000000-0000-4000-8000-000000000011",
    "amountMinor": "2500",
    "occurredOn": "2026-09-24",
    "creatorAccessIdentityId": "00000000-0000-4000-8000-000000000200"
  }
}
```

### Delete

`DELETE /api/groups/{group}/settlements/{settlement}` returns `204`. Repeating
a delete for an already absent Settlement in the same owned active Group also
returns `204`. Participant status and current Balance do not block deletion.
Deletion never resets `hasFinancialHistory`.

### Error semantics

- Invalid request fields return `422`. For `amountMinor`, invalid includes a
  JSON number, zero, a sign, whitespace, a leading zero, a decimal point, an
  exponent, non-digits or a value greater than `9223372036854775807`.
- Incompatible UUID reuse, lifecycle conflicts and a violated
  inactive-Participant balance rule return `409`. A field-level-valid amount
  that would make checked financial arithmetic overflow also returns `409`.
- Missing or non-owned Groups and Settlements are not exposed and return
  `404`.
- Missing or invalid Access Identity credentials are unauthorized.

Every server-side create, update and delete validates ownership and Group
status within the database transaction that writes the Settlement. Create and
update additionally validate Participant membership, Participant status and
Balances. Delete targets the already stored Settlement and does not reapply
create/update eligibility rules.

## Local state and IndexedDB v4

Schema v4 adds `settlements`, keyed by `id`. Fresh database creation and the
v3 to v4 upgrade preserve every existing store and record.

IndexedDB stores `DurableSettlementSnapshot` records. Valid `amountMinor`
values match `^[1-9][0-9]{0,18}$` and must be no greater than
`9223372036854775807`. Persistence maps `Settlement.amountMinor` directly with
`toString(10)`; rehydration validates first and then parses the string directly
with `BigInt(value)`. No money library or other dependency is introduced.

The durable-state validator checks UUIDs, ownership, same-Group Participant
references, distinct sender and receiver, calendar dates and the canonical
signed-64-compatible amount string.

Rehydration loads Settlements after Expenses and ExpenseShares and before
hydrating Pinia. A failure keeps the application lifecycle in `failed`; it does
not silently discard local data.

The existing durable settings record gains
`settlementProposalStrategy: 'deterministic' | 'minimum-transfer'`. Its initial
value is `deterministic`. The preference is global to this local App context,
device-local, and creates neither an API request nor a Pending Mutation.

Local create, update and delete each use one IndexedDB transaction for:

- the Settlement record change,
- the irreversible Group financial-history flag when creating, and
- the corresponding Pending Mutation.

Pinia changes only after the transaction commits. Participant hard-delete
eligibility considers persisted Settlement references.

## Pending Mutations and synchronization

The existing discriminated union gains three members:

- `CreateSettlement`: payload `{ settlement: DurableSettlementSnapshot }`
- `UpdateSettlement`: payload `{ settlement: DurableSettlementSnapshot }`
- `DeleteSettlement`: payload `{ settlement: DurableSettlementSnapshot }`,
  containing the deleted tombstone snapshot

Pinia keeps Domain Settlements as runtime `Settlement` values with `bigint`,
but its Pending Mutation queue keeps the three Settlement payloads as
`DurableSettlementSnapshot`. Each local operation serializes its validated or
deleted Domain Settlement once before the IndexedDB transaction. Create and
update write that immutable snapshot to both the Settlement store and Pending
Mutation store. Delete removes the Settlement-store record and writes that
same snapshot to the Pending Mutation store as its tombstone. Pinia is updated
only after that transaction commits.

During rehydration, Settlement-store snapshots are validated and mapped to
runtime `Settlement` values, while Pending Mutation snapshots remain durable
strings in the runtime queue. The sync mapper sends their `amountMinor` string
unchanged to the API. A successful API response is validated as a
`DurableSettlementSnapshot` and compared field-for-field with the acknowledged
durable payload. It is mapped to `Settlement` only if response reconciliation
must update Domain state and no newer mutation prevents that update. Thus the
durable payload remains the canonical retry input and is never reconstructed
from current Domain state. The credential remains separate and must not occur
in either representation or a mutation.

Settlement mutations share the existing per-Group FIFO with every Group,
Participant and Expense mutation. They receive independent mutation UUIDs and
global `createdOrder` values. Entries are not squashed or reordered.

An acknowledgement removes only the acknowledged mutation. It must not
replace a local Settlement if a newer pending mutation for the same Settlement
exists. Create synchronization accepts `201` and idempotent `200`; update
accepts `200`; delete accepts idempotent `204`. Domain rejection keeps the
local mutation available; the existing transient sync-error state exposes the
failure for explicit user handling.

At minimum, tests cover these queue histories:

- `CreateSettlement -> UpdateSettlement -> DeleteSettlement`
- `CreateExpense -> CreateSettlement`
- `DeactivateParticipant -> CreateSettlement`
- `DeleteSettlement -> DeleteParticipant`

## Runtime Statement Snapshot boundary

A Statement Snapshot is materialized at runtime as immutable text. JS-020 does
not add a Snapshot store, API resource or history. The generated value includes
its `generatedAt` instant and a warning when the represented Group has Pending
Mutations. Once generated, its content does not change with later runtime
state. Copying or sharing the text has no Domain or sync side effect.

## Required cross-runtime scenarios

PHP and TypeScript tests use the same language-neutral
[`settlement-vectors.json`](fixtures/settlement-vectors.json) fixture for
financial state and Settlement validation. HTTP requests, responses, durable
IndexedDB values and all monetary values in that fixture use canonical base-10
integer strings so neither runtime parses them through binary floating point.
The vectors cover at least:

- partial and full payment,
- active-to-active wrong direction and overpayment warnings,
- rejection of wrong direction and overpayment when either Participant is
  inactive,
- update validation after excluding the existing Settlement,
- delete restoring the pre-Settlement balances even when a Participant has
  since become inactive,
- archived-Group rejection,
- create retry with the same and incompatible UUID payloads,
- same-Group FIFO across Expense, Participant and Settlement mutations, and
- the maximum positive signed-64-bit Settlement amount, rejection of the first
  value above it and rejection when a valid amount would overflow the resulting
  financial state, and
- an `INT64_MIN` Debtor Balance settled against multiple Creditors without
  absolute-value conversion.

## Non-goals

- payment initiation or bank integration
- counterparty confirmation or approval status
- receipts, notes, audit log or version history
- Settlement server reads
- persisted Statement Snapshots or share links
- generic repositories, sync engines or conflict-merge UI
- multi-currency conversion
