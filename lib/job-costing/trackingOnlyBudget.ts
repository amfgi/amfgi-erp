function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A job line used only to record quantities before a material or labor budget exists. */
export function isTrackingOnlySpecifications(specifications: unknown): boolean {
  return isRecord(specifications) && specifications.budgetMode === 'tracking';
}

export function buildTrackingOnlySpecifications() {
  return { budgetMode: 'tracking' as const };
}
