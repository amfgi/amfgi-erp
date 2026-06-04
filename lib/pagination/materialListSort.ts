import type { Prisma } from '@prisma/client';

export const MATERIAL_LIST_SORT_KEYS = [
  'id',
  'name',
  'category',
  'unit',
  'stockType',
  'categoryId',
  'warehouse',
  'warehouseId',
  'currentStock',
  'unitCost',
  'reorderLevel',
  'allowNegativeConsumption',
  'externalItemName',
  'isActive',
  'createdAt',
] as const;

export type MaterialListSortKey = (typeof MATERIAL_LIST_SORT_KEYS)[number];

export type ListSortDirection = 'asc' | 'desc';

const MATERIAL_LIST_SORT_KEY_SET = new Set<string>(MATERIAL_LIST_SORT_KEYS);

export const DEFAULT_MATERIAL_LIST_SORT: MaterialListSortKey = 'name';

export function parseListSortDirection(raw: string | null | undefined): ListSortDirection {
  return raw === 'desc' ? 'desc' : 'asc';
}

export function parseMaterialListSortKey(
  raw: string | null | undefined
): MaterialListSortKey {
  const key = (raw ?? '').trim();
  if (MATERIAL_LIST_SORT_KEY_SET.has(key)) {
    return key as MaterialListSortKey;
  }
  return DEFAULT_MATERIAL_LIST_SORT;
}

export function buildMaterialListOrderBy(
  sortBy: string | null | undefined,
  sortDir: string | null | undefined
): Prisma.MaterialOrderByWithRelationInput {
  const key = parseMaterialListSortKey(sortBy);
  const direction = parseListSortDirection(sortDir);
  return { [key]: direction };
}
