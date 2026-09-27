import { describe, expect, test } from 'vitest'
import { preparePerson, renamePerson, type Person } from '../../app/domain/person'

const PERSON_ID = '11111111-1111-4111-8111-111111111111'

describe('Person local workflow', () => {
  test('starts a new local Person at revision zero', () => {
    expect(preparePerson(' Ada ', PERSON_ID).person).toEqual({
      id: PERSON_ID,
      name: 'Ada',
      status: 'active',
      revision: 0,
    })
  })

  test('preserves the server revision and status when renaming an adopted Person', () => {
    const person: Person = {
      id: PERSON_ID,
      name: 'Ada Account',
      status: 'inactive',
      revision: 4,
    }

    expect(renamePerson(person, '  Ada Synced  ').person).toEqual({
      id: PERSON_ID,
      name: 'Ada Synced',
      status: 'inactive',
      revision: 4,
    })
  })
})
