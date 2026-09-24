import { describe, expect, it } from 'vitest'
import type { Group, Participant } from '../../app/domain/create-group'
import type { Expense } from '../../app/domain/expense'
import type { PendingMutation } from '../../app/domain/pending-mutation'
import type { Settlement } from '../../app/domain/settlement'
import { createStatementParticipantLabels, generateStatementSnapshot, type StatementSnapshotInput } from '../../app/domain/statement-snapshot'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ALICE_ID = '22222222-2222-4222-8222-222222222222'
const BOB_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

const group: Group = {
  id: GROUP_ID,
  name: 'Reise',
  currency: 'EUR',
  ownerAccessIdentityId: ACTOR_ID,
  status: 'active',
  hasFinancialHistory: true,
  participantIds: [ALICE_ID, BOB_ID],
}
const participants: Participant[] = [
  { id: ALICE_ID, groupId: GROUP_ID, name: 'Alice', status: 'active', order: 0 },
  { id: BOB_ID, groupId: GROUP_ID, name: 'Bob', status: 'active', order: 1 },
]
const expense: Expense = {
  id: '55555555-5555-4555-8555-555555555555',
  groupId: GROUP_ID,
  description: 'Abendessen',
  amountMinor: 1000,
  incurredOn: '2026-09-20',
  payerParticipantId: ALICE_ID,
  creatorAccessIdentityId: ACTOR_ID,
  splitMethod: 'equal',
  shares: [
    { participantId: ALICE_ID, amountMinor: 500 },
    { participantId: BOB_ID, amountMinor: 500 },
  ],
}
const settlement: Settlement = {
  id: '66666666-6666-4666-8666-666666666666',
  groupId: GROUP_ID,
  senderParticipantId: BOB_ID,
  receiverParticipantId: ALICE_ID,
  amountMinor: 200n,
  occurredOn: '2026-09-21',
  creatorAccessIdentityId: ACTOR_ID,
}

function input(overrides: Partial<StatementSnapshotInput> = {}): StatementSnapshotInput {
  return {
    group,
    participantId: BOB_ID,
    participants,
    expenses: [expense],
    settlements: [settlement],
    pendingMutations: [],
    proposalStrategy: 'deterministic',
    generatedAt: new Date('2026-09-24T16:05:06.789Z'),
    ...overrides,
  }
}

describe('Statement Snapshot', () => {
  it('materializes a frozen participant statement with current actual and proposed amounts', () => {
    const snapshot = generateStatementSnapshot(input())

    expect(snapshot).toEqual({
      generatedAt: '2026-09-24T16:05:06.789Z',
      containsUnsyncedChanges: false,
      text: expect.any(String),
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(snapshot.text).toContain('Erstellt: 24.09.2026, 16:05:06 UTC')
    expect(snapshot.text).toContain('Bezahlt: 0,00\u00a0€')
    expect(snapshot.text).toContain('Eigene Anteile: 5,00\u00a0€')
    expect(snapshot.text).toContain('Zahlungen gesendet: 2,00\u00a0€')
    expect(snapshot.text).toContain('Offener Saldo: −3,00\u00a0€')
    expect(snapshot.text).toContain('Bob → Alice · 3,00\u00a0€')
  })

  it('includes expenses where the participant paid even without an own share', () => {
    const payerOnly = { ...expense, shares: [{ participantId: BOB_ID, amountMinor: 1000 }] }
    const snapshot = generateStatementSnapshot(input({ participantId: ALICE_ID, expenses: [payerOnly], settlements: [] }))
    expect(snapshot.text).toContain('Abendessen')
    expect(snapshot.text).toContain('Eigener Anteil: 0,00\u00a0€')
  })

  it('reports explicit empty sections for a zero state', () => {
    const snapshot = generateStatementSnapshot(input({ expenses: [], settlements: [] }))
    expect(snapshot.text).toContain('Offener Saldo: 0,00\u00a0€')
    expect(snapshot.text).toContain('Keine relevanten Ausgaben.')
    expect(snapshot.text).toContain('Keine relevanten Zahlungen.')
    expect(snapshot.text).toContain('Keine vorgeschlagenen Ausgleichszahlungen für diese Person.')
  })

  it('warns only for Pending Mutations of the represented Group', () => {
    const mutation = (groupId: string): PendingMutation => ({
      id: `${groupId}-mutation`, type: 'AddParticipant', groupId, createdOrder: 0,
      payload: { participantId: 'new', name: 'Neu', order: 2 },
    })
    const unrelated = generateStatementSnapshot(input({ pendingMutations: [mutation('other')] }))
    const related = generateStatementSnapshot(input({ pendingMutations: [mutation(GROUP_ID)] }))
    expect(unrelated.containsUnsyncedChanges).toBe(false)
    expect(unrelated.text).not.toContain('nicht synchronisierte Änderungen')
    expect(related.containsUnsyncedChanges).toBe(true)
    expect(related.text).toContain('Dieser lokale Gruppenstand enthält noch nicht synchronisierte Änderungen.')
  })

  it('normalizes hostile multiline names and descriptions without interpreting markup', () => {
    const hostileParticipants = [
      { ...participants[0]!, name: '<b>Alice</b>\nAdmin' },
      { ...participants[1]!, name: 'Bob\t<script>' },
    ]
    const hostileExpense = { ...expense, description: 'Essen\r\nWARNUNG: falsch' }
    const snapshot = generateStatementSnapshot(input({ participants: hostileParticipants, expenses: [hostileExpense] }))
    expect(snapshot.text).toContain('Person: Bob <script>')
    expect(snapshot.text).toContain('Essen WARNUNG: falsch')
    expect(snapshot.text).not.toContain('<b>Alice</b>\nAdmin')
  })

  it('disambiguates duplicate names by stable participant order and marks lifecycle states', () => {
    const duplicateParticipants = [
      { ...participants[0]!, name: 'Alex' },
      { ...participants[1]!, name: 'Alex', status: 'inactive' as const },
    ]
    const snapshot = generateStatementSnapshot(input({
      group: { ...group, name: 'Alt\nGruppe', status: 'archived' },
      participants: duplicateParticipants,
    }))
    expect(snapshot.text).toContain('Gruppe: Alt Gruppe (archiviert)')
    expect(snapshot.text).toContain('Person: Alex (Teilnehmer 2) (inaktiv)')
    expect(snapshot.text).toContain('Alex (Teilnehmer 2) → Alex (Teilnehmer 1)')
  })

  it('exposes stable shared Participant labels for unsorted duplicate names', () => {
    const labels = createStatementParticipantLabels([
      { ...participants[1]!, name: 'Alex' },
      { ...participants[0]!, name: 'Alex' },
    ])
    expect([...labels.entries()]).toEqual([
      [ALICE_ID, 'Alex (Teilnehmer 1)'],
      [BOB_ID, 'Alex (Teilnehmer 2)'],
    ])
  })

  it('removes Unicode bidirectional format controls from displayed user text', () => {
    const snapshot = generateStatementSnapshot(input({
      group: { ...group, name: 'Rei\u061C\u200Ese' },
      participants: [participants[0]!, { ...participants[1]!, name: 'B\u202Eob\u2069' }],
      expenses: [{ ...expense, description: 'Abend\u202Aessen' }],
    }))
    expect(snapshot.text).toContain('Gruppe: Reise')
    expect(snapshot.text).toContain('Person: Bob')
    expect(snapshot.text).toContain('Abendessen')
    expect(snapshot.text).not.toMatch(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u)
  })

  it('sorts same-date records by ID and is stable under input permutation', () => {
    const earlierIdExpense = { ...expense, id: '10000000-0000-4000-8000-000000000000', description: 'A' }
    const laterIdExpense = { ...expense, id: '90000000-0000-4000-8000-000000000000', description: 'B' }
    const newestExpense = { ...expense, id: '50000000-0000-4000-8000-000000000000', description: 'Neu', incurredOn: '2026-09-22' }
    const first = generateStatementSnapshot(input({ participants: [...participants].reverse(), expenses: [laterIdExpense, newestExpense, earlierIdExpense] }))
    const second = generateStatementSnapshot(input({ expenses: [earlierIdExpense, laterIdExpense, newestExpense] }))
    expect(first.text).toBe(second.text)
    expect(first.text.indexOf('· Neu ·')).toBeLessThan(first.text.indexOf('· A ·'))
    expect(first.text.indexOf('· A ·')).toBeLessThan(first.text.indexOf('· B ·'))
  })

  it('reports exact strategy unavailability without falling back', () => {
    const manyParticipants = Array.from({ length: 13 }, (_, index): Participant => ({
      id: `participant-${index}`, groupId: GROUP_ID, name: `Person ${index}`, status: 'active', order: index,
    }))
    const manyExpense: Expense = {
      ...expense,
      payerParticipantId: manyParticipants[0]!.id,
      amountMinor: 1200,
      shares: manyParticipants.slice(1).map(candidate => ({ participantId: candidate.id, amountMinor: 100 })),
    }
    const snapshot = generateStatementSnapshot(input({
      group: { ...group, participantIds: manyParticipants.map(candidate => candidate.id) },
      participantId: manyParticipants[0]!.id,
      participants: manyParticipants,
      expenses: [manyExpense],
      settlements: [],
      proposalStrategy: 'minimum-transfer',
    }))
    expect(snapshot.text).toContain('Nicht verfügbar: 13 offene Salden; unterstützt werden höchstens 12.')
    expect(snapshot.text).not.toContain('Person 1 → Person 0')
  })

  it('uses a successful minimum-transfer proposal and includes only the selected Participant transfers', () => {
    const exactParticipants: Participant[] = [
      { id: 'debtor-a', groupId: GROUP_ID, name: 'Schuldner A', status: 'active', order: 0 },
      { id: 'debtor-b', groupId: GROUP_ID, name: 'Schuldner B', status: 'active', order: 1 },
      { id: 'creditor-a', groupId: GROUP_ID, name: 'Gläubiger A', status: 'active', order: 2 },
      { id: 'creditor-b', groupId: GROUP_ID, name: 'Gläubiger B', status: 'active', order: 3 },
    ]
    const exactExpenses: Expense[] = [
      {
        ...expense, id: 'expense-a', payerParticipantId: 'creditor-b', amountMinor: 600,
        shares: [{ participantId: 'debtor-a', amountMinor: 600 }],
      },
      {
        ...expense, id: 'expense-b', payerParticipantId: 'creditor-a', amountMinor: 400,
        shares: [{ participantId: 'debtor-b', amountMinor: 400 }],
      },
    ]
    const snapshot = generateStatementSnapshot(input({
      group: { ...group, participantIds: exactParticipants.map(candidate => candidate.id) },
      participantId: 'debtor-a', participants: exactParticipants, expenses: exactExpenses,
      settlements: [], proposalStrategy: 'minimum-transfer',
    }))
    expect(snapshot.text).toContain('Vorgeschlagene Ausgleichszahlungen (Möglichst wenige Zahlungen)')
    expect(snapshot.text).toContain('Schuldner A → Gläubiger B · 6,00\u00a0€')
    expect(snapshot.text).not.toContain('Schuldner B → Gläubiger A')
  })

  it('does not mutate its input and freezes the materialized result', () => {
    const source = input()
    const participantsBefore = source.participants.map(candidate => ({ ...candidate }))
    const expensesBefore = source.expenses.map(candidate => ({ ...candidate, shares: candidate.shares.map(share => ({ ...share })) }))
    const result = generateStatementSnapshot(source)
    expect(source.participants).toEqual(participantsBefore)
    expect(source.expenses).toEqual(expensesBefore)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it.each([
    ['unknown selected Participant', { participantId: 'missing' }],
    ['mismatched Group Participant IDs', { group: { ...group, participantIds: [ALICE_ID] } }],
    ['Expense with an unknown payer', { expenses: [{ ...expense, payerParticipantId: 'missing' }] }],
    ['Settlement with an unknown receiver', { settlements: [{ ...settlement, receiverParticipantId: 'missing' }] }],
    ['invalid generation instant', { generatedAt: new Date(Number.NaN) }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => generateStatementSnapshot(input(overrides as Partial<StatementSnapshotInput>))).toThrow()
  })
})
