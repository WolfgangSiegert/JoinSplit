# Expense Slice Alignment — JS-017

## Status and scope

This document is the approved implementation contract for the JS-017 Expense
slice. It specializes the product flow, domain model, engineering principles
and local-persistence architecture without introducing a generic sync or
conflict framework.

JS-017 delivers a local-first Expense list, create form with visible Equal
Split preview, detail/edit flow and confirmed deletion. Balances, settlements,
other split methods or currencies, audit/version history, server reads and
rehydration, participant reactivation, PWA and native packaging remain outside
this slice.

## Domain representation

An Expense has these persisted fields:

- `id`: client-generated UUID v4
- `groupId`: UUID of its Group
- `description`: Unicode-trimmed text containing 1–200 Unicode code points
- `amountMinor`: positive integer cents, at most JavaScript
  `Number.MAX_SAFE_INTEGER` (`9007199254740991`); PostgreSQL stores it as
  `bigint`
- `incurredOn`: calendar date in `YYYY-MM-DD`; future dates are valid
- `payerParticipantId`: Participant UUID from the same Group
- `creatorAccessIdentityId`: authenticated owner, derived by the server
- `splitMethod`: the literal `equal`
- `shares`: explicit ExpenseShare values in stable Participant order

An ExpenseShare has no public UUID. Its identity is the pair
`(expenseId, participantId)`, and its `amountMinor` is a non-negative safe
integer. Expense and all of its shares are written atomically and shares remain
explicitly persisted.

The payer need not receive a share. New Expenses may reference only active
Participants. An edit may preserve or remove an inactive existing payer or
share Participant, but it may never newly introduce an inactive Participant.

Creating the first Expense irreversibly sets the Group's
`hasFinancialHistory` flag locally and server-side. Deleting every Expense does
not clear it. Archived Groups are read-only and reject every Expense mutation.

## Money input

The client parses money from strings only; it never converts through a binary
floating-point amount. It accepts an ungrouped whole number with an optional
one- or two-digit fraction, using either comma or dot as the decimal separator.
Examples: `10`, `10,5`, `10,50`, and `10.50`. Grouping separators, signs,
exponents, blank fractions and more than two decimals are invalid. The parsed
minor-unit value must be positive and no greater than `9007199254740991`.

## Equal Split

Selected Participants are de-duplicated and sorted by their persisted stable
Group order before calculation; request order has no meaning. For amount `A`
and `N` selected Participants, every Participant receives `floor(A / N)` and
the first `A mod N` entries receive one additional cent. Zero shares are valid.
The shared fixture is
[`equal-split-vectors.json`](fixtures/equal-split-vectors.json) and is consumed
by both PHP and TypeScript tests.

## Exact HTTP contract

All endpoints require the existing access-identity headers. A missing or
invalid identity is unauthorized. A Group not owned by that identity, an
Expense outside that Group, or an archived Group is not exposed as mutable.
There are deliberately no Expense `GET` endpoints in JS-017.

### Create

`POST /api/groups/{group}/expenses`

Request body (exact keys):

```json
{
  "expenseId": "00000000-0000-4000-8000-000000000001",
  "description": "Dinner",
  "amountMinor": 12000,
  "incurredOn": "2026-09-23",
  "payerParticipantId": "00000000-0000-4000-8000-000000000010",
  "participantIds": [
    "00000000-0000-4000-8000-000000000010",
    "00000000-0000-4000-8000-000000000011"
  ]
}
```

The server derives `groupId`, `creatorAccessIdentityId`, `splitMethod` and all
share amounts. A new resource returns `201`. Repeating the same client UUID and
same complete desired state as the same owner returns the same representation
with `200`; incompatible reuse returns `409`.

### Update

`PUT /api/groups/{group}/expenses/{expense}`

The request contains the complete desired mutable state (exact keys):

```json
{
  "description": "Dinner",
  "amountMinor": 12000,
  "incurredOn": "2026-09-23",
  "payerParticipantId": "00000000-0000-4000-8000-000000000010",
  "participantIds": [
    "00000000-0000-4000-8000-000000000010",
    "00000000-0000-4000-8000-000000000011"
  ]
}
```

Success returns `200`. Expense and replacement shares are committed in one
database transaction.

### Create and update response

The response uses this exact envelope and keys. `shares` are server-computed
and sorted by stable Participant order.

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000001",
    "groupId": "00000000-0000-4000-8000-000000000100",
    "description": "Dinner",
    "amountMinor": 12000,
    "incurredOn": "2026-09-23",
    "payerParticipantId": "00000000-0000-4000-8000-000000000010",
    "creatorAccessIdentityId": "00000000-0000-4000-8000-000000000200",
    "splitMethod": "equal",
    "shares": [
      {
        "participantId": "00000000-0000-4000-8000-000000000010",
        "amountMinor": 6000
      },
      {
        "participantId": "00000000-0000-4000-8000-000000000011",
        "amountMinor": 6000
      }
    ]
  }
}
```

Validation failures return `422`; incompatible UUID reuse or lifecycle/domain
conflicts return `409`; missing or non-owned resources return `404`.

### Delete

`DELETE /api/groups/{group}/expenses/{expense}` returns `204`. Repeating a
delete for an already absent Expense in the same owned active Group also
returns `204`. Deletion removes its shares atomically but never resets
`hasFinancialHistory`.

## Local state and IndexedDB v3

Schema v3 adds `expenses` keyed by `id` and `expenseShares` keyed by
`[expenseId, participantId]`. Fresh creation and upgrades from both v1 and v2
must preserve all existing stores and records. The durable state validator
checks ownership, Group/Participant references, stable share order, unique
share identity, safe integer bounds and exact share sums.

Local create/update/delete transactions atomically write the Expense, its full
share set, the irreversible Group flag and the corresponding pending mutation.
Pinia changes only after IndexedDB commits.

The three new pending-union members are immutable full snapshots:

- `CreateExpense`: payload `{ expense: Expense }`
- `UpdateExpense`: payload `{ expense: Expense }`
- `DeleteExpense`: payload `{ expense: Expense }`, containing the deleted
  tombstone snapshot

The API mapper sends the snapshot's complete desired fields and selected share
Participant IDs; it never reconstructs a retry from current runtime state.
Queue entries retain unique mutation IDs and global `createdOrder` values.
Within a Group, every mutation type shares one FIFO and no entries are compacted.

An acknowledgement removes only the acknowledged mutation. It must not replace
an Expense or its shares when a newer pending mutation for that Expense exists;
in practice the already-committed runtime snapshot remains untouched. Response
reconciliation compares the server representation with the acknowledged
snapshot, including computed shares.

The relevant queue histories include:

- `CreateExpense → UpdateExpense → DeleteExpense`
- `AddParticipant → CreateExpense → DeleteExpense → DeleteParticipant`

Consequently a queued Expense deletion can remove the local financial
reference before Participant deletion is queued, while same-Group FIFO ensures
the server observes the deletion first.

## Participant and draft behavior

Participant hard deletion is blocked whenever the Participant is the payer of
an Expense or has an ExpenseShare. The same rule is applied in Laravel and in
local eligibility checks.

The create form defaults the date to the client's local calendar date and
initially selects every active Participant for shares. When there is exactly
one active Participant it is visibly preselected as payer; with multiple active
Participants the payer starts unset and requires an explicit choice.

Adding a Participant from within an Expense draft preserves every existing
draft value and the user's focus context. The new Participant is selected for
the split but is never assigned as payer automatically. The preview and all
detail views name concrete Participants and expose every share before save.
Deletion names the Expense and requires explicit confirmation; focus returns
to the trigger when a confirmation dialog is cancelled.
