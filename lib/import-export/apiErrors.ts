/** Standard RTK Query / API error message for import modals and directory pages. */
export function extractImportApiErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
