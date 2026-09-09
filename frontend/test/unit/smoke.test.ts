import { expect, test } from 'vitest'

test('runs a pure TypeScript test', () => {
  const values: number[] = [3, 1, 2]

  expect(values.toSorted((a, b) => a - b)).toEqual([1, 2, 3])
})
