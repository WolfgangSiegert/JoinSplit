export function pendingMutationLabel(count: number): string {
  return count === 1 ? 'eine lokale Änderung' : `${count} lokale Änderungen`
}

export function pendingMutationVerb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export function canApplyPwaUpdate(pendingCount: number, riskAccepted: boolean): boolean {
  return pendingCount === 0 || riskAccepted
}
