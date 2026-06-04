import {
  buildMaterialListOrderBy,
  parseMaterialListSortKey,
  parseListSortDirection,
} from '@/lib/pagination/materialListSort';

describe('materialListSort', () => {
  it('defaults invalid sort keys to name ascending', () => {
    expect(parseMaterialListSortKey('status')).toBe('name');
    expect(buildMaterialListOrderBy(null, null)).toEqual({ name: 'asc' });
  });

  it('maps known keys and directions for Prisma orderBy', () => {
    expect(parseListSortDirection('desc')).toBe('desc');
    expect(buildMaterialListOrderBy('currentStock', 'desc')).toEqual({ currentStock: 'desc' });
    expect(buildMaterialListOrderBy('unitCost', 'asc')).toEqual({ unitCost: 'asc' });
  });
});
