import { normalizeName } from './create-group'

export interface Person {
  readonly id: string
  readonly name: string
  readonly status: 'active' | 'inactive'
  readonly revision: number
}

export interface PreparePersonResult {
  readonly person?: Person
  readonly error?: string
}

export function preparePerson(name: string, id: string = crypto.randomUUID()): PreparePersonResult {
  const normalized = normalizeName(name).replace(/\s+/gu, ' ')
  const length = Array.from(normalized).length
  if (length < 1 || length > 100) return { error: 'Der Name muss zwischen 1 und 100 Zeichen lang sein.' }
  return { person: Object.freeze({ id, name: normalized, status: 'active', revision: 0 }) }
}

export function renamePerson(person: Person, name: string): PreparePersonResult {
  const prepared = preparePerson(name, person.id)
  return prepared.person
    ? { person: Object.freeze({ ...prepared.person, status: person.status, revision: person.revision }) }
    : prepared
}
