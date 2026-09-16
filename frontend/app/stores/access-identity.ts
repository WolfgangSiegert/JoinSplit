import { defineStore } from 'pinia'
import { ref } from 'vue'

function createCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export const useAccessIdentityStore = defineStore('accessIdentity', () => {
  const accessIdentityId = ref<string | null>(null)
  const credential = ref<string | null>(null)

  function ensureIdentity(): string {
    if (!accessIdentityId.value) {
      accessIdentityId.value = crypto.randomUUID()
      credential.value = createCredential()
    }

    return accessIdentityId.value
  }

  return { accessIdentityId, credential, ensureIdentity }
})
