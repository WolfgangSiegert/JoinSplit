export function accountInitials(name: string | null, email: string): string {
  const source = name?.trim() || email.split('@')[0]?.trim() || email.trim()
  const parts = source.match(/[\p{L}\p{N}]+/gu) ?? []
  if (!parts.length) return '?'
  const initials = parts.length > 1
    ? parts.slice(0, 2).map(part => Array.from(part)[0]).join('')
    : Array.from(parts[0]!).slice(0, 2).join('')
  return Array.from(initials.toLocaleUpperCase('de-DE')).slice(0, 2).join('')
}
