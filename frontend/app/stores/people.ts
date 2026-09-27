import { defineStore } from 'pinia'
import type { Person } from '../domain/person'
import type { PendingPersonMutation } from '../domain/pending-person-mutation'

export const usePeopleStore = defineStore('people', {
  state: (): { people: Person[]; pendingMutations: PendingPersonMutation[]; conflictedPersonIds: string[] } => ({
    people: [], pendingMutations: [], conflictedPersonIds: [],
  }),
  getters: {
    activePeople: state => state.people.filter(person => person.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name, 'de')),
    inactivePeople: state => state.people.filter(person => person.status === 'inactive')
      .sort((left, right) => left.name.localeCompare(right.name, 'de')),
  },
  actions: {
    hydrate(people: readonly Person[], pendingMutations: readonly PendingPersonMutation[] = []): void {
      this.people = [...people]; this.pendingMutations = [...pendingMutations]; this.conflictedPersonIds = []
    },
    save(person: Person): void {
      this.people = [...this.people.filter(item => item.id !== person.id), person]
    },
    remove(personId: string): void { this.people = this.people.filter(person => person.id !== personId) },
    queue(mutation: PendingPersonMutation): void { this.pendingMutations.push(mutation) },
    acknowledge(mutationId: string, personId: string, revision: number): void {
      this.pendingMutations = this.pendingMutations.filter(item => item.id !== mutationId)
      this.people = this.people.map(person => person.id === personId ? { ...person, revision } : person)
    },
    conflict(personId: string): void {
      if (!this.conflictedPersonIds.includes(personId)) this.conflictedPersonIds.push(personId)
    },
  },
})
