import { randomUUID } from 'node:crypto'

export function serverRequestId(
  generate: () => string = randomUUID,
): string {
  return generate()
}
