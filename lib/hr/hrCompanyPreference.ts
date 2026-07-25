export const HR_COMPANY_STORAGE_KEY = 'hr-selected-company-id';

export function readHrPreferredCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(HR_COMPANY_STORAGE_KEY)?.trim();
  return value || null;
}

export function writeHrPreferredCompanyId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id?.trim()) {
    window.localStorage.setItem(HR_COMPANY_STORAGE_KEY, id.trim());
  } else {
    window.localStorage.removeItem(HR_COMPANY_STORAGE_KEY);
  }
}

export function resolveDefaultHrCompanyId(
  optionIds: string[],
  activeCompanyId?: string | null,
): string {
  const preferred = readHrPreferredCompanyId();
  if (preferred && optionIds.includes(preferred)) return preferred;
  if (activeCompanyId && optionIds.includes(activeCompanyId)) return activeCompanyId;
  return optionIds[0] ?? '';
}
