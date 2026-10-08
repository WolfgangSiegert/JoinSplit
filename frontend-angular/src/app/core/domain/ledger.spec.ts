import {
  assessSettlement,
  calculateBalances,
  calculateEqualShares,
  parseAmountMinor,
  participantHasFinancialReferences,
} from './ledger';
import { Expense, Participant, Settlement } from './models';
import equalSplitFixtures from '../../../../../docs/architecture/fixtures/equal-split-vectors.json';

const participants: Participant[] = [
  { id: 'a', groupId: 'g', name: 'Ada', status: 'active', order: 0 },
  { id: 'b', groupId: 'g', name: 'Bo', status: 'active', order: 1 },
  { id: 'c', groupId: 'g', name: 'Cy', status: 'active', order: 2 },
];

describe('ledger domain', () => {
  it('parses money without binary floating point', () => {
    expect(parseAmountMinor('10,05')).toBe(1005);
    expect(parseAmountMinor('0,00')).toBeNull();
  });

  it('distributes remainder cents by stable participant order', () => {
    expect(calculateEqualShares(1000, ['c', 'a', 'b'], participants)).toEqual([
      { participantId: 'a', amountMinor: 334 },
      { participantId: 'b', amountMinor: 333 },
      { participantId: 'c', amountMinor: 333 },
    ]);
  });

  it.each(equalSplitFixtures.vectors)('matches shared fixture: $name', (vector) => {
    const fixtureParticipants = equalSplitFixtures.participantOrder.map((id, order) => ({
      id,
      groupId: 'fixture',
      name: id,
      status: 'active' as const,
      order,
    }));
    expect(
      calculateEqualShares(vector.amountMinor, vector.selectedParticipantIds, fixtureParticipants),
    ).toEqual(vector.expectedShares);
  });

  it('derives zero-sum balances from expenses', () => {
    const expense: Expense = {
      id: 'e',
      groupId: 'g',
      description: 'Essen',
      amountMinor: 900,
      incurredOn: '2026-10-08',
      payerParticipantId: 'a',
      creatorAccessIdentityId: 'actor',
      splitMethod: 'equal',
      shares: calculateEqualShares(900, ['a', 'b', 'c'], participants),
    };
    const balances = calculateBalances('g', participants, [expense], []);
    expect(balances.map((item) => item.balanceAmountMinor)).toEqual([600n, -300n, -300n]);
    expect(balances.reduce((sum, item) => sum + item.balanceAmountMinor, 0n)).toBe(0n);
  });

  it('requires confirmation for active overpayments', () => {
    expect(
      assessSettlement(
        participants[1]!,
        participants[0]!,
        601n,
        new Map([
          ['a', 600n],
          ['b', -600n],
        ]),
      ),
    ).toEqual({ decision: 'confirm', confirmationReasons: ['exceeds_open_amount'] });
  });

  it('rejects wrong-direction payments involving inactive participants', () => {
    const inactive = { ...participants[1]!, status: 'inactive' as const };
    expect(
      assessSettlement(
        inactive,
        participants[0]!,
        100n,
        new Map([
          ['a', -600n],
          ['b', 600n],
        ]),
      ),
    ).toEqual({
      decision: 'reject',
      rejectionReason: 'inactive_participant_payment_must_reduce_open_balance',
    });
  });

  it('detects expense and settlement references before participant deletion', () => {
    const expense: Expense = {
      id: 'e',
      groupId: 'g',
      description: 'Essen',
      amountMinor: 300,
      incurredOn: '2026-10-08',
      payerParticipantId: 'a',
      creatorAccessIdentityId: 'actor',
      splitMethod: 'equal',
      shares: calculateEqualShares(300, ['a', 'b', 'c'], participants),
    };
    const settlement: Settlement = {
      id: 's',
      groupId: 'g',
      senderParticipantId: 'b',
      receiverParticipantId: 'a',
      amountMinor: 100n,
      occurredOn: '2026-10-08',
      creatorAccessIdentityId: 'actor',
    };
    expect(participantHasFinancialReferences('c', [expense], [])).toBe(true);
    expect(participantHasFinancialReferences('b', [], [settlement])).toBe(true);
    expect(participantHasFinancialReferences('c', [], [settlement])).toBe(false);
  });
});
