export const LIST_PAGE_SIZE_OPTIONS = [100, 200, 500, 1000] as const;

export const DEFAULT_LIST_PAGE_SIZE: number = LIST_PAGE_SIZE_OPTIONS[0];

export type PaginatedListResponse<T> = {
  items: T[];
  total: number;
};

export function parseListLimit(
  raw: string | null,
  options: readonly number[] = LIST_PAGE_SIZE_OPTIONS,
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIST_PAGE_SIZE;
  if (options.includes(parsed)) return parsed;
  const max = options[options.length - 1] ?? 500;
  return Math.min(max, Math.max(1, parsed));
}

export function parseListOffset(raw: string | null): number {
  return Math.max(0, Number.parseInt(raw ?? '0', 10) || 0);
}

export function isPaginatedListRequest(searchParams: URLSearchParams): boolean {
  return searchParams.get('limit') !== null;
}
