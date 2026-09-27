const online = ref(true)
let listening = false

function refreshConnectivity(): void {
  online.value = navigator.onLine
}

function refreshVisibleConnectivity(): void {
  if (document.visibilityState === 'visible') refreshConnectivity()
}

export function useConnectivity() {
  onMounted(() => {
    refreshConnectivity()

    if (!listening) {
      window.addEventListener('online', refreshConnectivity)
      window.addEventListener('offline', refreshConnectivity)
      window.addEventListener('pageshow', refreshConnectivity)
      document.addEventListener('visibilitychange', refreshVisibleConnectivity)
      listening = true
    }
  })

  return { online: readonly(online) }
}
