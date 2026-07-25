/** Pure helpers for HR multi-company scoping (safe to unit-test without auth). */

/** Prisma `where` fragment for one or many company ids. */
export function companyIdWhere(
  companyIds: string[]
): { companyId: string } | { companyId: { in: string[] } } {
  if (companyIds.length === 1) return { companyId: companyIds[0] };
  return { companyId: { in: companyIds } };
}

export function isCompanyAccessible(companyId: string, companyIds: string[]): boolean {
  return companyIds.includes(companyId);
}

/** Resolve create/write company: body/query companyId, else active company if still accessible. */
export function resolveHrWriteCompanyId(input: {
  requestedCompanyId?: string | null;
  activeCompanyId?: string | null;
}): string | null {
  const requested = input.requestedCompanyId?.trim() || null;
  if (requested) return requested;
  const active = input.activeCompanyId?.trim() || null;
  return active;
}
