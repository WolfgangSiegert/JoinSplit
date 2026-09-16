export const GROUP_CURRENCY = 'EUR' as const

export interface CreateGroupDraft {
  groupName: string
  addParticipant: boolean
  participantName: string
}

export interface CreateGroupErrors {
  groupName?: string
  participantName?: string
}

export interface Group {
  id: string
  name: string
  currency: typeof GROUP_CURRENCY
  ownerAccessIdentityId: string
  status: 'active'
  participantIds: readonly string[]
}

export interface Participant {
  id: string
  groupId: string
  name: string
  status: 'active'
  order: number
}

export interface InitialParticipantPayload {
  readonly participantId: string
  readonly name: string
}

export interface CreateGroupPayload {
  readonly groupId: string
  readonly name: string
  readonly currency: typeof GROUP_CURRENCY
  readonly actorId: string
  readonly initialParticipant: Readonly<InitialParticipantPayload> | null
}

export interface PreparedGroupCreation {
  group: Group
  participant: Participant | null
  payload: Readonly<CreateGroupPayload>
}

export type PrepareGroupCreationResult =
  | { ok: true; value: PreparedGroupCreation }
  | { ok: false; errors: CreateGroupErrors }

const EDGE_WHITESPACE =
  /^[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/gu

export function normalizeName(value: string): string {
  return value.replace(EDGE_WHITESPACE, '')
}

function nameError(value: string, label: string): string | undefined {
  const length = Array.from(value).length

  if (length === 0) {
    return `${label} ist erforderlich.`
  }

  if (length > 100) {
    return `${label} darf höchstens 100 Zeichen lang sein.`
  }
}

export function validateCreateGroupDraft(draft: CreateGroupDraft): {
  normalizedGroupName: string
  normalizedParticipantName: string | null
  errors: CreateGroupErrors
} {
  const normalizedGroupName = normalizeName(draft.groupName)
  const normalizedParticipantName = draft.addParticipant
    ? normalizeName(draft.participantName)
    : null
  const errors: CreateGroupErrors = {}

  errors.groupName = nameError(normalizedGroupName, 'Gruppenname')
  if (normalizedParticipantName !== null) {
    errors.participantName = nameError(normalizedParticipantName, 'Name')
  }

  return { normalizedGroupName, normalizedParticipantName, errors }
}

export function prepareGroupCreation(
  draft: CreateGroupDraft,
  actorId: string,
  generateId: () => string = () => crypto.randomUUID(),
): PrepareGroupCreationResult {
  const { normalizedGroupName, normalizedParticipantName, errors } =
    validateCreateGroupDraft(draft)

  if (errors.groupName || errors.participantName) {
    return { ok: false, errors }
  }

  const groupId = generateId()
  const participantId = normalizedParticipantName === null ? null : generateId()
  const initialParticipant = participantId
    ? Object.freeze({ participantId, name: normalizedParticipantName! })
    : null
  const payload = Object.freeze({
    groupId,
    name: normalizedGroupName,
    currency: GROUP_CURRENCY,
    actorId,
    initialParticipant,
  })

  return {
    ok: true,
    value: {
      group: {
        id: groupId,
        name: normalizedGroupName,
        currency: GROUP_CURRENCY,
        ownerAccessIdentityId: actorId,
        status: 'active',
        participantIds: participantId ? [participantId] : [],
      },
      participant: participantId
        ? {
            id: participantId,
            groupId,
            name: normalizedParticipantName!,
            status: 'active',
            order: 0,
          }
        : null,
      payload,
    },
  }
}
