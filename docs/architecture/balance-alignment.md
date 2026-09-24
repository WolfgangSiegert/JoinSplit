# Balance Alignment

Status: accepted for JS-018

## Scope

JS-018 derives participant balances from the locally visible Expenses and
ExpenseShares of one Group:

```text
balance = paid expense amounts - own expense shares
```

The complete domain formula also includes sent and received Settlements. No
Settlement model exists yet, so JS-018 neither invents one nor displays
settlement contributions. A later Settlement slice extends the calculator.

Balances are derived values. They are not persisted, queued as mutations, or
served through a new HTTP endpoint. IndexedDB remains at schema version 3.

## Result contract

The calculator returns one result per supplied Participant in stable
`Participant.order` order. Active, inactive, referenced, unreferenced, and
zero-balance Participants are all included.

Each result contains:

- `participantId`
- `paidAmountMinor`
- `shareAmountMinor`
- `balanceAmountMinor = paidAmountMinor - shareAmountMinor`

Positive means the Participant should receive money, negative means the
Participant should pay, and zero means the Participant is balanced. The sum
of all balances must be exactly zero.

## Exact arithmetic

Every persisted Expense and ExpenseShare amount remains a positive or
non-negative JavaScript safe integer as defined by the Expense contract.
Aggregates can exceed that range, so TypeScript accumulates and returns
`bigint`. Signed display formatting must not convert the aggregate to
`number`.

PHP uses checked integer arithmetic and rejects an aggregate that would exceed
`PHP_INT_MAX` or `PHP_INT_MIN`. This is an explicit platform boundary for the
current slice; no arbitrary-precision dependency is introduced. Expected
aggregate values in the shared JSON fixture are decimal strings.

If balances later cross an HTTP boundary, their minor-unit representation
must be specified as a decimal string rather than a JSON number.

## Validation

The calculators fail fast instead of silently ignoring inconsistent state:

- Participant IDs are unique and belong to the requested Group.
- Participant order values are unique.
- Expense IDs are unique and belong to the requested Group.
- payer and Share references resolve to supplied Participants.
- each Expense has at least one Share and no duplicate Share Participant.
- amounts are integers within the existing per-value limits.
- Expense amounts are positive, Share amounts are non-negative, and Share
  amounts sum exactly to the Expense amount.

Input collections are not mutated. Expense and Share ordering does not affect
the result.

## Presentation

The balance overview uses explicit text (`soll erhalten`, `soll zahlen`, or
`ausgeglichen`) and does not rely on color or a sign alone. Inactive
Participants are visibly labelled and remain part of the calculation.

The participant detail shows the current JS-018 composition:

- paid Expenses
- own ExpenseShares
- current balance
- relevant Expenses, including both contributions when a Participant paid and
  also owns a Share

No proposal or Settlement UI is part of JS-018. Archived Groups remain
readable and contain no mutation action.

## Shared verification

`fixtures/balance-vectors.json` is consumed by both TypeScript and PHP tests.
It covers zero state, equal splitting with remainder cents, a payer outside the
Shares, inactive and unreferenced Participants, multiple Expenses, and an
aggregate above JavaScript's safe-integer range.
