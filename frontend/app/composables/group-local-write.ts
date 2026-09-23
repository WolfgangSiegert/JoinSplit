import { nextCreatedOrder, type PendingMutation } from '../domain/pending-mutation'

interface WriteCoordinator {
  readonly tails: Map<string, Promise<void>>
  nextOrder: number | undefined
}

const coordinatorsByStore = new WeakMap<object, WriteCoordinator>()

function coordinatorFor(store: object): WriteCoordinator {
  let coordinator = coordinatorsByStore.get(store)
  if (!coordinator) {
    coordinator = { tails: new Map(), nextOrder: undefined }
    coordinatorsByStore.set(store, coordinator)
  }
  return coordinator
}

export function reserveLocalMutationOrder(store: object, pendingMutations: readonly PendingMutation[]): number {
  const coordinator = coordinatorFor(store)
  const observedNextOrder = nextCreatedOrder(pendingMutations)
  const createdOrder = Math.max(coordinator.nextOrder ?? observedNextOrder, observedNextOrder)
  coordinator.nextOrder = createdOrder + 1
  return createdOrder
}

export function serializeGroupLocalWrite<T>(
  store: object,
  groupId: string,
  pendingMutations: readonly PendingMutation[],
  operation: (createdOrder: number) => Promise<T>,
): Promise<T> {
  const coordinator = coordinatorFor(store)
  const createdOrder = reserveLocalMutationOrder(store, pendingMutations)

  const previous = coordinator.tails.get(groupId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(() => operation(createdOrder))
  const tail = result.then(() => undefined, () => undefined)
  coordinator.tails.set(groupId, tail)
  void tail.then(() => {
    if (coordinator.tails.get(groupId) === tail) coordinator.tails.delete(groupId)
  })
  return result
}
