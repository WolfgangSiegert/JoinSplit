const online = ref(true)
let listening = false

export function useConnectivity() {
  onMounted(() => {
    online.value = navigator.onLine

    if (!listening) {
      window.addEventListener('online', () => (online.value = true))
      window.addEventListener('offline', () => (online.value = false))
      listening = true
    }
  })

  return { online: readonly(online) }
}
