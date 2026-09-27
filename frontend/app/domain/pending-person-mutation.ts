import type { Person } from './person'

export type PendingPersonMutation = Readonly<{
  id: string
  personId: string
  createdOrder: number
  baseRevision: number
} & ({ type: 'SavePerson'; payload: Readonly<{ person: Person }> }
  | { type: 'DeletePerson'; payload: Readonly<Record<string, never>> })>
