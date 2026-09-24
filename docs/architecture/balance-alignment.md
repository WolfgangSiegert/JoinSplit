# Balance Alignment

Status: accepted for JS-018; compatibility extension approved by JS-020

## Scope

JS-018 derives participant balances from the locally visible Expenses and
ExpenseShares of one Group:

```text
balance = paid expense amounts - own expense shares
```

The complete domain formula also includes sent and received Settlements. The
implemented JS-018 slice predates that model, so it neither includes nor
displays Settlement contributions. JS-021 extends the calculator and JS-022
consumes its results for Settlement Proposals.

Balances are derived values. They are not persisted, queued as mutations, or
served through a new HTTP endpoint. The implemented JS-018 slice remains on
IndexedDB schema version 3; JS-021 performs the separately specified schema
upgrade for Settlement records, not for Balance records.

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

### Implemented JS-018 state

Every persisted Expense and ExpenseShare amount is currently a positive or
non-negative JavaScript safe integer as defined by the Expense contract. The
JS-018 TypeScript calculator converts those values to `bigint` and does not
yet enforce a signed-64-bit boundary on its aggregates. The JS-018 PHP
calculator uses checked host-integer addition and therefore rejects an
aggregate outside the host PHP integer range.

This describes the code that exists; it is not the final cross-runtime
contract. In particular, the JS-018 implementations do not yet guarantee that
TypeScript and PHP accept and reject exactly the same aggregate range.

### JS-020 compatibility extension

JS-021 and JS-022 must align both runtimes on this common financial-state
domain:

- minimum signed amount: `-9223372036854775808`,
- maximum signed amount: `9223372036854775807`,
- TypeScript Domain values and calculations use `bigint`,
- PHP uses explicitly checked signed-64-bit integer arithmetic,
- floating-point arithmetic and conversion through `number` are forbidden.

The supported PHP runtime must provide 64-bit integers (`PHP_INT_SIZE === 8`);
an incompatible runtime fails explicitly instead of silently narrowing the
contract to its host range.

Every derived amount exposed by the Balance result, including paid, Share,
sent-Settlement, received-Settlement and final Balance amounts, must be inside
that domain. Each implementation rejects the same state when any exposed
aggregate or final Balance falls outside it. Existing per-Expense and
per-ExpenseShare limits remain unchanged; this extension does not claim that
the JS-018 persistence or HTTP representation has already been migrated.

Acceptance or rejection must not depend on the input collection order. An
implementation must not add mixed-sign contributions in the incidental order
in which Expenses or Settlements were supplied. It instead:

1. calculates each non-negative category subtotal with checked monotonic
   addition and rejects a subtotal above `9223372036854775807`,
2. derives `paid - shares` and `sent - received` with checked signed
   arithmetic, and
3. combines those two signed deltas with a checked addition.

This fixed grouping makes overflow behavior independent of Expense and
Settlement ordering without introducing arbitrary-precision PHP arithmetic.
TypeScript must apply the same explicit boundary checks even though `bigint`
itself can represent larger values. No implementation may wrap, round, clamp
or silently discard a contribution.

Whenever a derived financial-state amount crosses a JSON, fixture, API or
durable-state boundary, it uses a canonical base-10 decimal string rather than
a JSON number. Positive values have no `+` prefix, zero is `"0"`, and negative
values use one leading `-`; whitespace, decimal points, exponents and leading
zeroes are invalid. Runtime parsing converts directly between that string and
`bigint` or the checked PHP integer representation.

Signed display formatting must not convert an aggregate to `number`. No money
or arbitrary-precision dependency is introduced.

### Settlement Proposal input

JS-022 receives the final `balanceAmountMinor` values as canonical signed
decimal strings and parses them without floating point. The proposal layer
must independently validate the signed-64-bit boundary and the exact zero-sum
invariant rather than assuming its caller is valid. Its total and subset
checks use the order-independent, overflow-safe cancellation defined in
[`settlement-proposals.md`](settlement-proposals.md), including safe handling
of `-9223372036854775808` without negating or applying `abs` to that value.

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

The existing vectors verify the JS-018 behavior. JS-021 extends shared
coverage for Settlement contributions, signed-64-bit boundary enforcement,
order-independent results and identical cross-runtime overflow rejection. The
JS-020 documentation change does not by itself claim those implementation
tests already exist.
