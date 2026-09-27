type UtilityPath = '/account' | '/settings'

function safeInternalReturnPath(value: unknown, currentPath: string): string {
  if (typeof value !== 'string'
    || !/^\/(?!\/)[^\r\n]*$/u.test(value)
    || value.includes('\\')
    || value.split(/[?#]/u)[0] === currentPath.split(/[?#]/u)[0]) return '/'

  return value
}

export function useUtilityNavigation() {
  const route = useRoute()

  function closeUtility(): ReturnType<typeof navigateTo> {
    return navigateTo(safeInternalReturnPath(route.query.returnTo, route.fullPath))
  }

  function toggleUtility(path: UtilityPath): ReturnType<typeof navigateTo> {
    if (route.path === path) return closeUtility()
    return navigateTo({ path, query: { returnTo: route.fullPath } })
  }

  return { closeUtility, toggleUtility }
}
