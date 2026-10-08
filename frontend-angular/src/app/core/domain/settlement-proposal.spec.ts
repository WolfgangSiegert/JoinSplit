import {
  proposeDeterministicSettlements,
  proposeMinimumTransferSettlements,
} from './settlement-proposal';

describe('settlement proposals', () => {
  const input = [
    {
      participantId: 'creditor',
      participantOrder: 0,
      status: 'active' as const,
      balanceAmountMinor: '600',
    },
    {
      participantId: 'debtor-a',
      participantOrder: 1,
      status: 'active' as const,
      balanceAmountMinor: '-300',
    },
    {
      participantId: 'debtor-b',
      participantOrder: 2,
      status: 'inactive' as const,
      balanceAmountMinor: '-300',
    },
  ];

  it('creates a deterministic direct proposal', () => {
    expect(proposeDeterministicSettlements(input)).toEqual({
      status: 'success',
      transfers: [
        { senderParticipantId: 'debtor-a', receiverParticipantId: 'creditor', amountMinor: '300' },
        { senderParticipantId: 'debtor-b', receiverParticipantId: 'creditor', amountMinor: '300' },
      ],
    });
  });

  it('keeps the exact strategy deterministic', () => {
    expect(proposeMinimumTransferSettlements(input)).toEqual(
      proposeMinimumTransferSettlements([...input].reverse()),
    );
  });
});
