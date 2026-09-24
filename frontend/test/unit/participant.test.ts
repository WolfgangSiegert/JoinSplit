import { describe, expect, test } from 'vitest'
import type { Group, Participant } from '../../app/domain/create-group'
import { canDeleteParticipant, hasDuplicateParticipantName, nextParticipantOrder, prepareParticipantAdd, prepareParticipantDeactivate, prepareParticipantDelete, prepareParticipantRename } from '../../app/domain/participant'
import { migrateLegacyCreateGroupRecords } from '../../app/persistence/database'
import { sortPendingMutations, type PendingMutation } from '../../app/domain/pending-mutation'

const GROUP_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const ALICE_ID = '33333333-3333-4333-8333-333333333333'
const CAROL_ID = '44444444-4444-4444-8444-444444444444'
const DAVE_ID = '55555555-5555-4555-8555-555555555555'
const MUTATION_ID = '66666666-6666-4666-8666-666666666666'
const group: Group = { id: GROUP_ID, name: 'Reise', currency: 'EUR', ownerAccessIdentityId: ACTOR_ID, status: 'active', hasFinancialHistory: false, participantIds: [ALICE_ID, CAROL_ID] }
const alice: Participant = { id: ALICE_ID, groupId: GROUP_ID, name: 'Alice', status: 'active', order: 0 }
const carol: Participant = { id: CAROL_ID, groupId: GROUP_ID, name: 'Carol', status: 'active', order: 2 }

describe('Participant local workflow', () => {
  test('adds with independent IDs and max order plus one without filling gaps', () => {
    const ids = [DAVE_ID, MUTATION_ID]
    const result = prepareParticipantAdd(group, [alice, carol], [], '  Dave  ', () => ids.shift()!)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.participant).toMatchObject({ id: DAVE_ID, name: 'Dave', order: 3, status: 'active' })
    expect(result.value.mutation).toMatchObject({ id: MUTATION_ID, type: 'AddParticipant', createdOrder: 0 })
    expect(result.value.mutation.id).not.toBe(result.value.participant.id)
    expect(Object.isFrozen(result.value.mutation.payload)).toBe(true)
    expect(nextParticipantOrder([alice, carol])).toBe(3)
  })

  test('detects normalized duplicate names while allowing a rename to keep its own name', () => {
    expect(hasDuplicateParticipantName([alice, carol], '  ALICE\u3000')).toBe(true)
    expect(hasDuplicateParticipantName([alice, carol], 'Alice', ALICE_ID)).toBe(false)
    expect(hasDuplicateParticipantName([alice, carol], 'Carol', ALICE_ID)).toBe(true)
    expect(hasDuplicateParticipantName([alice, carol], '   ')).toBe(false)
  })

  test('renames, deactivates and deletes without changing stable order', () => {
    const renamed = prepareParticipantRename(carol, [], '\u2003Caroline\u3000', () => MUTATION_ID)
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.value.participant).toMatchObject({ id: CAROL_ID, name: 'Caroline', order: 2, status: 'active' })
    expect(renamed.value.mutation.payload).toEqual({ participantId: CAROL_ID, name: 'Caroline', active: true, order: 2 })
    const deactivated = prepareParticipantDeactivate(renamed.value.participant, [renamed.value.mutation], () => DAVE_ID)
    expect(deactivated.participant).toMatchObject({ id: CAROL_ID, order: 2, status: 'inactive' })
    expect(deactivated.mutation.payload).toEqual({ participantId: CAROL_ID, name: 'Caroline', active: false, order: 2 })
    const deleted = prepareParticipantDelete(group, alice, [renamed.value.mutation, deactivated.mutation], () => ACTOR_ID)
    expect(deleted.group.participantIds).toEqual([CAROL_ID])
    expect(carol.order).toBe(2)
    expect(canDeleteParticipant(false)).toBe(true)
    expect(canDeleteParticipant(true)).toBe(false)
  })

  test('sorts explicit mutations FIFO without coalescing', () => {
    const ids = [DAVE_ID, MUTATION_ID]
    const add = prepareParticipantAdd(group, [alice, carol], [], 'Dave', () => ids.shift()!)
    expect(add.ok).toBe(true); if (!add.ok) return
    const rename = prepareParticipantRename(add.value.participant, [add.value.mutation], 'David', () => ACTOR_ID)
    expect(rename.ok).toBe(true); if (!rename.ok) return
    expect(sortPendingMutations([rename.value.mutation, add.value.mutation]).map(item => item.type))
      .toEqual(['AddParticipant', 'RenameParticipant'])
  })

  test('maps v1 CreateGroup records deterministically to v2 without changing domain IDs', () => {
    const migrated = migrateLegacyCreateGroupRecords([{ groupId: GROUP_ID, kind: 'CreateGroup', status: 'pending', payload: {
      groupId: GROUP_ID, name: 'Reise', currency: 'EUR', actorId: ACTOR_ID,
      initialParticipant: { participantId: ALICE_ID, name: 'Alice' },
    } }], () => MUTATION_ID)
    expect(migrated[0]).toMatchObject({ id: MUTATION_ID, type: 'CreateGroup', groupId: GROUP_ID, createdOrder: 0 })
    expect(migrated[0]?.payload.initialParticipant?.participantId).toBe(ALICE_ID)
  })

  test('allows a durable delete mutation to reference an absent local Participant', async () => {
    const mutation: PendingMutation = { id: MUTATION_ID, type: 'DeleteParticipant', groupId: GROUP_ID, createdOrder: 0, payload: { participantId: ALICE_ID } }
    const { validateDurableState } = await import('../../app/persistence/validation')
    expect(() => validateDurableState({ accessIdentity: { id: ACTOR_ID, credential: '01'.repeat(32) }, groups: [{ ...group, participantIds: [CAROL_ID] }], participants: [carol], pendingMutations: [mutation], expenses: [], settings: null })).not.toThrow()
  })
})
