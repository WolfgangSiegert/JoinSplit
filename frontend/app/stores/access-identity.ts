import { defineStore } from 'pinia'
import { ref } from 'vue'

function createCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface AccessIdentity {
  readonly id: string
  readonly credential: string
}

export function generateAccessIdentity(): AccessIdentity {
  return { id: crypto.randomUUID(), credential: createCredential() }
}

export const useAccessIdentityStore = defineStore('accessIdentity', () => {
  const accessIdentityId = ref<string | null>(null)
  const credential = ref<string | null>(null)

  function hydrate(identity: AccessIdentity): void {
    accessIdentityId.value = identity.id
    credential.value = identity.credential
  }

  return { accessIdentityId, credential, hydrate }
})
