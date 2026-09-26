# M4 Production QA

## Purpose

This document is the executable manual QA protocol for the M4 portfolio
release. Product boundaries remain authoritative in
[`../product/portfolio-demo.md`](../product/portfolio-demo.md); deployment and
operations remain governed by [`deployment-runbook.md`](deployment-runbook.md)
and [`production-operations.md`](production-operations.md).

Run the protocol only against the canonical
`https://joinsplit.tiny-bits.org` origin and use fictional data. Record results
in [`m4-release-evidence.md`](m4-release-evidence.md). A technical Render
hostname is not a substitute because production redirects to the canonical
origin and browser-local identity is origin-bound.

## Fixed test data

Use this stable creation order so equal-split remainder allocation is
deterministic:

| Entity | Value |
| --- | --- |
| Group | `QA-Hüttentour` |
| Currency | EUR |
| Participant 1 | `Ava Test` |
| Participant 2 | `Ben Probe` |
| Participant 3 | `Cleo Muster` |
| Expense | `Test-Unterkunft` |
| Initial amount | EUR 10.01 |
| Edited amount | EUR 12.01 |
| Payer | Ava Test |
| Consumers | all three Participants |

Expected initial shares are EUR 3.34, EUR 3.34 and EUR 3.33. Expected initial
balances are Ava +6.67, Ben -3.34 and Cleo -3.33.

After editing the amount to EUR 12.01, expected shares are EUR 4.01, EUR 4.00
and EUR 4.00. Expected balances are Ava +8.00, Ben -4.00 and Cleo -4.00. The
deterministic proposal is Ben to Ava EUR 4.00 and Cleo to Ava EUR 4.00.

## Reference happy path

Run the complete path once in current stable desktop Chrome. Execute steps 1
through 10, then the targeted negative and offline checks, restore the exact
post-Settlement baseline of Ava +4.00, Ben 0.00 and Cleo -4.00, and only then
continue with destructive steps 11 through 14.

1. Open the canonical domain. Confirm valid HTTPS, no certificate warning and
   no navigation to `onrender.com`. A free-tier cold start may delay the first
   response but must finish without an error or redirect loop.
2. Confirm the pre-input demo warning. It must require invented names and test
   amounts and must not imply real payment execution, durable backup or a
   production financial service. Open the detailed disclosure and confirm its
   operator, contact, browser-binding and offline limits. The retention copy
   must say that normal server access ends after 30 days, cleanup runs on cold
   start and while awake, and physical deletion has no fixed deadline. It must
   not promise deletion within 24 hours, a 38-day maximum or guaranteed backup
   recovery.
3. Create `QA-Hüttentour` in EUR with `Ava Test` as the owner's Participant.
   Confirm that no login is required and that the online synchronization state
   finishes without an error.
4. Add `Ben Probe` and `Cleo Muster` in that order. Confirm all three remain
   active and in stable order.
5. Create `Test-Unterkunft` for EUR 10.01, paid by Ava and shared by all three.
   Before saving, confirm the exact EUR 3.34 / 3.34 / 3.33 preview. Reload and
   confirm the Expense and Participant order persist.
6. Confirm balances Ava +6.67, Ben -3.34 and Cleo -3.33, with a zero total and
   understandable Participant breakdown.
7. Edit the Expense to EUR 12.01. Confirm exact shares EUR 4.01 / 4.00 / 4.00
   and balances +8.00 / -4.00 / -4.00. Reload and confirm persistence.
8. Confirm the simple deterministic proposal contains exactly two EUR 4.00
   transfers to Ava. Confirm the UI distinguishes proposals from recorded
   payments. Changing the proposal strategy must not mutate domain data.
9. Record a EUR 4.00 Settlement from Ben to Ava. Confirm balances Ava +4.00,
   Ben 0.00 and Cleo -4.00 and one remaining Cleo-to-Ava EUR 4.00 proposal.
10. Create a Statement Snapshot for Cleo. Confirm its static text contains the
    Group, Participant, time and -4.00 balance. Copy must work or provide a
    clear manual fallback. System sharing is required only where supported.
    Creating the snapshot must not create a financial mutation.
11. Edit the Settlement from EUR 4.00 to EUR 2.00. Confirm balances Ava +6.00,
    Ben -2.00 and Cleo -4.00. Then delete it after confirmation and confirm
    balances return to +8.00 / -4.00 / -4.00.
12. Delete the Expense after confirmation. Confirm an empty Expense state, all
    zero balances and no zero-value proposals.
13. Archive and reload the Group. Confirm it remains readable but immutable.
    Reactivate it and confirm write controls return.
14. Open Local Reset. Confirm the warning covers local and pending changes and
    does not claim to erase a server copy. Cancel once and confirm focus returns
    to the trigger. Then confirm the reset and verify empty local state and a
    new browser identity.

## Targeted negative and offline checks

Run all checks once in the Chrome reference run before steps 11 through 14.
Repeat only platform-specific offline and sharing behavior on mobile. Restore
the exact post-Settlement baseline before continuing the happy path.

- **Validation:** submit an empty Group name and empty Expense and Settlement
  forms. Input must remain, the message must be programmatically associated and
  focus must move to the first invalid field.
- **Duplicate name:** attempt a second `Ben Probe`. The UI must warn and require
  an explicit override rather than silently block or duplicate on a double
  click.
- **Direction and overpayment:** enter a Settlement against the balance
  direction and one above the open amount. Neither may be accepted silently.
- **Inactive Participant:** deactivate Cleo. Historical data and balances must
  remain visible, Cleo must be unavailable for new Expenses, and any allowed
  Settlement must only reduce the open balance in the correct direction.
- **Offline after first load:** load the application fully online, disable the
  network and create a bounded change. Offline and pending-sync states must be
  distinguishable. Reconnect and confirm the queue synchronizes once without
  duplication or loss. This does not test or promise first load while offline.
- **Cold start:** after service inactivity, record the first response time. A
  delay is acceptable; a permanent timeout, redirect loop or error page is not.
- **Reset cancel:** cancelling Local Reset must preserve all data and restore
  focus.

Do not manipulate production data or clocks to simulate the 30-day expiry or
the terminal local-only identity. Use the automated expiry tests and separate
operations evidence for those cases.

## Browser verification matrix

| Platform | Browser | Minimum scope |
| --- | --- | --- |
| Desktop | Chrome stable | full happy path and all negative checks |
| Desktop | Edge stable | core flow, reload and keyboard/focus |
| Desktop | Firefox stable | core flow, reload and copy fallback |
| macOS | Safari stable | core flow, IndexedDB and copy/share |
| Current iOS | Safari | core flow, touch, reload persistence and system share |
| Current Android | Chrome | core flow, touch, reload persistence and system share |

The core flow is steps 1 through 10. Steps 11 through 14 may remain confined to
the Chrome reference run when that reduced scope is recorded explicitly. Use a
real mobile device where practical; identify emulators as such.

For every matrix row record:

- date, time and tester,
- Git commit and Render deploy ID,
- exact browser, OS, device or viewport,
- cold-start state,
- happy-path, offline, copy/share and keyboard/focus results, using
  `N/A - covered by Chrome reference run` when the matrix scope does not
  require that check,
- horizontal overflow at 320 CSS pixels,
- console or network errors,
- evidence locations and defects.
