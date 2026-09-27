import { Capacitor, CapacitorCookies } from '@capacitor/core'

export const applicationFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

export function usesNativeHttpTransport(): boolean {
  return Capacitor.isNativePlatform()
}

export async function clearNativeApiCookies(apiBase: string): Promise<boolean> {
  if (!usesNativeHttpTransport()) return true

  try {
    await CapacitorCookies.clearCookies({ url: apiBase.replace(/\/$/u, '') })
    return true
  } catch {
    return false
  }
}
