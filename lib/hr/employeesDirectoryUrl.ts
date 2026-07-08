/** sessionStorage key for the last /hr/employees URL (including search/filter query). */
export const HR_EMPLOYEES_DIRECTORY_URL_KEY = 'hr-employees-directory-url';

export function readHrEmployeesDirectoryUrl(): string {
  if (typeof window === 'undefined') return '/hr/employees';
  try {
    const stored = window.sessionStorage.getItem(HR_EMPLOYEES_DIRECTORY_URL_KEY);
    if (stored?.startsWith('/hr/employees')) return stored;
  } catch {
    /* ignore */
  }
  return '/hr/employees';
}

export function rememberHrEmployeesDirectoryUrl(url: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HR_EMPLOYEES_DIRECTORY_URL_KEY, url);
  } catch {
    /* ignore */
  }
}
