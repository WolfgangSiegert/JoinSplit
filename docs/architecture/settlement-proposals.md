# Settlement Proposal Algorithms — JS-020

## Status and scope

This document is the approved cross-platform contract for deriving Settlement
Proposals from the current Participant Balances of one Group. It specializes
the domain model without changing balances or recording actual Settlements.

The same inputs must produce the same proposal in PHP and TypeScript. Both
implementations consume the shared
[`settlement-proposal-vectors.json`](fixtures/settlement-proposal-vectors.json)
fixture. No optimizer, arbitrary-precision, or other new dependency is needed.

## Input and output contract

Each input Participant contains:

- `participantId`: unique within the input Group and not empty or composed only
  of ASCII whitespace (`U+0009` through `U+000D`, or `U+0020`),
- `participantOrder`: unique stable Group order represented as a JSON-safe
  integer from `0` through `9007199254740991`, inclusive,
- `status`: `active` or `inactive`,
- `balanceAmountMinor`: signed minor-unit amount.

Positive balances are Creditors, negative balances are Debtors, and zero
balances are omitted from the proposal. Inactive Participants remain eligible:
their existing open balance must still be settled. Input collection order has
no meaning; `participantOrder` is canonical.

Each output transfer contains:

- `senderParticipantId`: a Debtor,
- `receiverParticipantId`: a Creditor,
- `amountMinor`: a strictly positive minor-unit amount.

Every proposal is sorted by sender order, then receiver order. It must settle
every non-zero input balance exactly, contain no self-payment, and neither
mutate nor persist its input. A proposal is a derived suggestion, not a
Settlement or a pending mutation.

Amounts in the shared JSON fixture are signed decimal strings. Both runtimes
apply the same numeric domain:

- every `balanceAmountMinor` is between `-9223372036854775808` and
  `9223372036854775807`, inclusive,
- every proposed `amountMinor` is between `1` and
  `9223372036854775807`, inclusive,
- every intermediate value remains within the same signed 64-bit range.

TypeScript parses and calculates with `bigint`. PHP uses checked integer
arithmetic. Both explicitly enforce the same signed-64-bit boundary rather
than relying on host behavior. Fixture values and any future HTTP values remain
decimal strings; they are never transported as JSON numbers.

Validation and calculation must never negate or call `abs` on
`-9223372036854775808`, whose positive magnitude is not representable as a
signed 64-bit integer. After validating and sorting by `participantOrder`, both
runtimes instead cancel negative and positive balances directly: add a
positive credit to a negative debt, or subtract the safely representable
smaller amount from the positive side. This keeps every intermediate signed
and in range, including the minimum value. The same cancellation operation is
used to test total balance and subset balance; raw same-sign totals are not
accumulated.

Sorting before validation makes the procedure independent of request-array
order. Cancellation order does not change whether the mathematical total is
zero, but using stable Participant order also makes operational behavior
canonical. The balance total must be exactly zero before either strategy runs.

## Shared validation

Each Participant input must be an object rather than an array or scalar. Both
strategies fail before producing a partial result when:

- Participant IDs or participant-order values are duplicated,
- an ID is blank, an order is invalid, or a status is unknown,
- a balance is not a valid base-10 integer,
- an individual balance lies outside the common signed 64-bit domain
  (`balance_out_of_supported_range`),
- the sum of all balances is not exactly zero.

An unavailable exact strategy is a supported result, not invalid input. It is
described separately below.

## Deterministic strategy

The default strategy is a stable two-pointer greedy algorithm:

1. Sort Debtors and Creditors independently by `participantOrder`.
2. Point to the first remaining Debtor and first remaining Creditor.
3. Let signed debt `d < 0`, credit `c > 0`, and safely compute `r = d + c`.
   Opposite signs guarantee that this addition cannot overflow.

   - If `r < 0`, transfer `c`, retain debt `r`, and advance the Creditor.
   - If `r = 0`, transfer `c` and advance both sides.
   - If `r > 0`, transfer `-d`, retain credit `r`, and advance the Debtor.
     In this branch `d` cannot be the signed-64-bit minimum, so negation is
     safe.
4. Repeat until both lists are exhausted.
5. Return the transfers in canonical output order.

This strategy is deterministic and easy to explain, but it does not promise a
globally minimal number of transfers. With `n` non-zero balances it produces at
most `n - 1` transfers. Its time after sorting is linear in the number of
Participants plus generated transfers.

## Exact minimum-transfer strategy

The exact strategy minimizes the number of direct Debtor-to-Creditor transfers
globally. It must not route money through a balanced intermediary and must not
use creditor-to-creditor or debtor-to-debtor transfers.

For `n` non-zero balances, any independently balanced block of `k` Participants
can be settled with `k - 1` transfers. Therefore minimizing transfers is
equivalent to partitioning all non-zero Participants into the maximum number
of disjoint zero-sum blocks. The minimum is:

```text
minimum transfer count = n - maximum zero-sum block count
```

The implementation uses solver-free bitmask/partition dynamic programming:

1. Sort non-zero Participants by `participantOrder` and assign bit positions.
2. Determine whether every subset mask is zero-sum with the same overflow-safe
   signed cancellation used by shared validation.
3. Use dynamic programming to find a partition of the full mask containing the
   greatest number of zero-sum subsets. Enumerate candidate submasks in a
   stable order and anchor each candidate on the first set bit to avoid
   equivalent block permutations.
4. Materialize each selected block with the deterministic two-pointer
   algorithm restricted to that block.
5. Canonically sort the combined transfers and apply the tie-break below.

This has exponential cost (approximately `O(3^n)` time and `O(2^n)` memory),
so the exact strategy is available only when at most **12 Participants have a
non-zero balance**. Zero-balance Participants do not count toward the cap. For
13 or more, the result is explicitly `unavailable` with reason
`non_zero_participant_limit`, actual count, and limit `12`. The UI disables the
exact option for that state. It must not silently substitute the deterministic
strategy.

## Deterministic tie-break

Multiple globally minimal proposals can exist. Compare complete proposals only
after sorting their transfers by sender order and then receiver order. Compare
the sorted transfer sequences lexicographically using, in order:

1. sender `participantOrder`,
2. receiver `participantOrder`,
3. larger `amountMinor` first.

The lexicographically first complete proposal wins. A shorter sequence can
only be compared after an identical prefix, although all exact candidates have
the same globally minimal transfer count. This final proposal-level comparison
is authoritative; subset enumeration order is only an implementation aid.

## Result shape

Implementations expose three distinct outcomes:

```text
success
→ canonical transfer list (possibly empty)

unavailable
→ only from a minimum-transfer invocation
→ reason = non_zero_participant_limit
→ nonZeroParticipantCount and limit

invalid
→ stable validation error code
```

The shared vectors cover empty/zero state, a single pair, multiple optimal
solutions, a case where greedy is not minimal, an indivisible zero-sum block,
an inactive Participant, successful amounts above JavaScript's safe-integer
range, safe handling of the signed-64-bit minimum, invalid total balance,
duplicate order, success at exactly 12 non-zero balances with and without
additional zero balances, and unavailability above the exact-strategy cap.
