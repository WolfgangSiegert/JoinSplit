# Group lifecycle contract

This document is the canonical JS-025 contract for Group hard deletion,
archiving and reactivation.

## Durable invariants

- A Group starts in `active` status.
- `hasFinancialHistory` becomes `true` in the same server and local transaction
  that creates the first Expense or Settlement. It never becomes `false` again,
  even after all financial records are deleted.
- Only an active, owned Group with `hasFinancialHistory === false` can be hard
  deleted.
- A Group with financial history is archived instead of deleted.
- An archived Group remains readable, including Statement Snapshot generation,
  but rejects every Participant, Expense and Settlement mutation.
- Reactivation is the only Group mutation allowed while archived.

Open balances and pending client mutations never block archiving. The client
must disclose both before confirmation. They are warnings, not server
preconditions.

## HTTP contract

```text
PATCH  /api/groups/{group}
DELETE /api/groups/{group}
```

`PATCH` accepts exactly one of these bodies:

```json
{ "status": "archived" }
```

```json
{ "status": "active" }
```

Repeating the desired status is an idempotent success. A successful response is
`200` and contains the Group ID, canonical status and financial-history flag.

`DELETE` returns `204` only for an active, owned Group without financial
history. Financial history or an archived status returns `409`. Unknown and
non-owned Groups return `404`; invalid credentials return `401`; invalid request
shapes return `422`.

Lifecycle actions lock the owned Group row inside a database transaction. This
serializes them with Expense and Settlement creation, which lock the same row.
There is no automatic archive fallback for a rejected hard delete.

After a successful hard delete the server no longer has ownership information.
Therefore a retry may return `404` rather than `204`. Only the client operation
that already owns a durable pending `DeleteGroup` mutation may reconcile that
`404` as an already-applied delete. No server tombstone or general idempotency
framework is introduced for this slice.

## Local-first lifecycle

The outbox adds three immutable mutations:

```text
ArchiveGroup    { status: "archived" }
ReactivateGroup { status: "active" }
DeleteGroup     {}
```

They share the existing per-Group FIFO with every Participant, Expense and
Settlement mutation. Archive and reactivate change the local Group status in
the same IndexedDB transaction that appends their mutation. Pinia changes only
after that transaction commits.

This ordering permits, for example:

```text
CreateExpense -> ArchiveGroup -> ReactivateGroup -> CreateExpense
```

The server observes exactly that order even when all operations were performed
offline.

## Hard-delete tombstone

Hard delete has one additional operational precondition: the Group must have no
older pending mutation. This does not change the financial-history rule. It
prevents a deletion from becoming permanently hidden behind an earlier failed
outbox entry.

Confirming deletion appends `DeleteGroup` but retains the otherwise empty Group
aggregate durably until the server acknowledges it. Normal Group views treat
the aggregate as logically deleted immediately; a dedicated pending-deletion
status keeps offline, failed and retry states observable.

After `204`, or `404` reconciled specifically for that pending deletion, one
IndexedDB transaction removes:

- the `DeleteGroup` mutation,
- the Group,
- its Participants.

The delete precondition and durable-state validation guarantee that no Expense
or Settlement records exist for this aggregate.

Only after this commit is the aggregate purged from Pinia. If local cleanup
fails after the server response, the exact tombstone and mutation remain and a
retry performs the same request and cleanup again. A pending deletion cannot be
undone because the server may already have applied it.

No IndexedDB schema upgrade is required: the existing `groups` and
`pendingMutations` stores contain the new record variants.

## User-interface boundary

- Active Groups are shown by default; archived Groups are available through an
  explicit disclosure and are listed separately.
- A never-financial Group offers permanent deletion.
- A Group with financial history offers archiving.
- Archived Group views show a read-only state and a reactivation action.
- Pending or failed hard deletions are not shown as ordinary Groups, but remain
  visible as deletion status entries until durable cleanup succeeds.
