import { describe, expect, it, vi } from 'vitest'
import { serverRequestId } from '../../server/utils/request-id'

describe('server request ids', () => {
  it('uses a server-generated value', () => {
    const generate = vi.fn(() => 'generated-id')

    expect(serverRequestId(generate)).toBe('generated-id')
    expect(generate).toHaveBeenCalledOnce()
  })
})
