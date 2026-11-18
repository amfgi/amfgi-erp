import {
  classifyMaterialColumnSheet,
  partitionColumnChanges,
  type CatalogMaterial,
  type ColumnLookups,
  type MaterialColumnChange,
} from '@/lib/import-export/materialColumnUpdate';

const lookups: ColumnLookups = {
  units: [
    { id: 'u-pcs', name: 'PCS' },
    { id: 'u-kg', name: 'KG' },
  ],
  categories: [
    { id: 'cat-fg', name: 'Fiberglass' },
    { id: 'cat-rm', name: 'Raw' },
  ],
  warehouses: [
    { id: 'wh-main', name: 'Main' },
    { id: 'wh-yard', name: 'Yard' },
  ],
};

function material(overrides: Partial<CatalogMaterial> = {}): CatalogMaterial {
  return {
    id: 'mat-1',
    name: 'Bolt',
    description: 'Hex bolt',
    unit: 'PCS',
    stockType: 'Raw Material',
    category: 'Raw',
    categoryId: 'cat-rm',
    warehouse: 'Main',
    warehouseId: 'wh-main',
    allowNegativeConsumption: false,
    assemblyUseDynamicCost: true,
    externalItemName: null,
    unitCost: 10,
    reorderLevel: 50,
    ...overrides,
  };
}

describe('classifyMaterialColumnSheet', () => {
  it('updates only the columns kept in the file when id and name match', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Reorder Level'],
        ['mat-1', 'Bolt', 80],
      ],
      [material()],
      lookups
    );

    expect(result.ok).toBe(true);
    expect(result.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'reorderLevel', from: 50, to: 80 }],
    });
  });

  it('updates every changed column and leaves matching values out', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Description', 'Unit Cost', 'Reorder Level'],
        ['mat-1', 'bolt', 'Hex bolt', 12.5, 50],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.status).toBe('update');
    expect(result.rows[0]?.changes.map((change) => change.field)).toEqual(['unitCost']);
  });

  it('skips a row when the value is already saved', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Reorder Level'],
        ['mat-1', 'Bolt', 50],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.status).toBe('unchanged');
    expect(result.rows[0]?.changes).toEqual([]);
  });

  it('treats 50 and 50.000 as the same reorder level', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['material id', 'item name', 'reorder level'],
        ['mat-1', 'Bolt', 50.0],
      ],
      [material({ reorderLevel: 50 })],
      lookups
    );

    expect(result.rows[0]?.status).toBe('unchanged');
  });

  it('does not clear a field when its cell is blank', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Description', 'Reorder Level'],
        ['mat-1', 'Bolt', '', 80],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.status).toBe('update');
    expect(result.rows[0]?.changes.map((change) => change.field)).toEqual(['reorderLevel']);
  });

  it('ignores a blank column left between the kept columns', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', '', 'Item Name', 'Reorder Level'],
        ['mat-1', 'ignore me', 'Bolt', 80],
      ],
      [material()],
      lookups
    );

    expect(result.ok).toBe(true);
    expect(result.rows[0]?.changes.map((change) => change.field)).toEqual(['reorderLevel']);
  });

  it('skips the row when the item name does not match the id', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Reorder Level'],
        ['mat-1', 'Nut', 80],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]).toMatchObject({
      status: 'skipped',
      reason: 'Item Name does not match this Material ID',
      changes: [],
    });
  });

  it('skips every row when the same material id is repeated', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Reorder Level'],
        ['mat-1', 'Bolt', 80],
        ['mat-1', 'Bolt', 90],
      ],
      [material()],
      lookups
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.status === 'skipped' && row.changes.length === 0)).toBe(true);
    expect(result.rows[0]?.reason).toBe('Duplicate Material ID in this file');
  });

  it('skips the whole row when category id and name disagree', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Category', 'Category ID', 'Reorder Level'],
        ['mat-1', 'Bolt', 'Fiberglass', 'cat-rm', 80],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.status).toBe('skipped');
    expect(result.rows[0]?.reason).toBe('Category and Category ID do not match');
    expect(result.rows[0]?.changes).toEqual([]);
  });

  it('updates category name and id together', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Category'],
        ['mat-1', 'Bolt', 'Fiberglass'],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.changes).toEqual([
      {
        field: 'category',
        label: 'Category',
        from: { id: 'cat-rm', name: 'Raw' },
        to: { id: 'cat-fg', name: 'Fiberglass' },
      },
    ]);
  });

  it('skips the row when the warehouse does not exist', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Warehouse'],
        ['mat-1', 'Bolt', 'Missing'],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]).toMatchObject({
      status: 'skipped',
      reason: 'Warehouse not found',
      changes: [],
    });
  });

  it('ignores opening stock and does not change on-hand quantity', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Opening Stock', 'Reorder Level'],
        ['mat-1', 'Bolt', 999, 80],
      ],
      [material()],
      lookups
    );

    expect(result.ignoredColumns).toEqual(['Opening Stock']);
    expect(result.rows[0]?.changes.map((change) => change.field)).toEqual(['reorderLevel']);
  });

  it('lists an unknown column and does not write it', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Notes', 'Reorder Level'],
        ['mat-1', 'Bolt', 'hello', 80],
      ],
      [material()],
      lookups
    );

    expect(result.unknownColumns).toEqual(['Notes']);
    expect(result.rows[0]?.changes.map((change) => change.field)).toEqual(['reorderLevel']);
  });

  it('rejects a file that is missing the match columns', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Reorder Level'],
        [80],
      ],
      [material()],
      lookups
    );

    expect(result.ok).toBe(false);
    expect(result.fileError).toBe('The file must include Material ID and Item Name columns.');
  });

  it('skips a negative reorder level without applying other edits on that row', () => {
    const result = classifyMaterialColumnSheet(
      [
        ['Material ID', 'Item Name', 'Description', 'Reorder Level'],
        ['mat-1', 'Bolt', 'Changed', -1],
      ],
      [material()],
      lookups
    );

    expect(result.rows[0]?.status).toBe('skipped');
    expect(result.rows[0]?.changes).toEqual([]);
  });
});

describe('partitionColumnChanges', () => {
  it('does not write a field that changed after the review', () => {
    const change: MaterialColumnChange = {
      field: 'reorderLevel',
      label: 'Reorder Level',
      from: 50,
      to: 80,
    };
    const result = partitionColumnChanges(material({ reorderLevel: 60 }), [change]);

    expect(result.writable).toEqual([]);
    expect(result.drifted).toEqual([change]);
  });

  it('writes a field that still has the reviewed value', () => {
    const change: MaterialColumnChange = {
      field: 'reorderLevel',
      label: 'Reorder Level',
      from: 50,
      to: 80,
    };

    expect(partitionColumnChanges(material(), [change]).writable).toEqual([change]);
  });
});
