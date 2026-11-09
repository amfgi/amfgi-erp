import { Prisma } from '@prisma/client';

export const MATERIAL_COLUMN_UPDATE_MAX_ROWS = 5000;
export const MATERIAL_COLUMN_UPDATE_APPLY_CHUNK = 50;

const UNIT_COST_PLACES = 4;
const REORDER_LEVEL_PLACES = 3;

export type SheetCell = string | number | boolean | null;

export type CatalogMaterial = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  stockType: string;
  category: string | null;
  categoryId: string | null;
  warehouse: string | null;
  warehouseId: string | null;
  allowNegativeConsumption: boolean;
  assemblyUseDynamicCost: boolean;
  externalItemName: string | null;
  unitCost: number | null;
  reorderLevel: number | null;
};

export type NamedRef = { id: string; name: string };

export type ColumnLookups = {
  units: NamedRef[];
  categories: NamedRef[];
  warehouses: NamedRef[];
};

export type RefValue = { id: string | null; name: string | null };
export type RefTarget = { id: string; name: string };

type TextField = 'description' | 'unit' | 'stockType' | 'externalItemName';
type BoolField = 'allowNegativeConsumption' | 'assemblyUseDynamicCost';
type NumberField = 'unitCost' | 'reorderLevel';
type RefField = 'category' | 'warehouse';

export type MaterialColumnChange =
  | { field: TextField; label: string; from: string | null; to: string }
  | { field: BoolField; label: string; from: boolean; to: boolean }
  | { field: NumberField; label: string; from: number | null; to: number }
  | { field: RefField; label: string; from: RefValue; to: RefTarget };

export type ClassifiedMaterialRow = {
  rowNumber: number;
  materialId: string | null;
  itemName: string | null;
  status: 'update' | 'unchanged' | 'skipped';
  reason: string | null;
  changes: MaterialColumnChange[];
};

export type MaterialColumnClassification = {
  ok: boolean;
  fileError: string | null;
  unknownColumns: string[];
  ignoredColumns: string[];
  rows: ClassifiedMaterialRow[];
};

type HeaderKind =
  | 'materialId'
  | 'itemName'
  | 'description'
  | 'unit'
  | 'stockType'
  | 'category'
  | 'categoryId'
  | 'warehouse'
  | 'warehouseId'
  | 'allowNegativeConsumption'
  | 'assemblyUseDynamicCost'
  | 'externalItemName'
  | 'unitCost'
  | 'reorderLevel'
  | 'ignore';

const HEADER_KINDS: Record<string, HeaderKind> = {
  'material id': 'materialId',
  'item name': 'itemName',
  description: 'description',
  unit: 'unit',
  'stock type': 'stockType',
  category: 'category',
  'category id': 'categoryId',
  warehouse: 'warehouse',
  'warehouse id': 'warehouseId',
  'allow negative consumption': 'allowNegativeConsumption',
  'assembly use dynamic cost': 'assemblyUseDynamicCost',
  'external item name': 'externalItemName',
  'unit cost': 'unitCost',
  'reorder level': 'reorderLevel',
  'opening stock': 'ignore',
  'total quantity': 'ignore',
};

const HEADER_LABELS: Record<Exclude<HeaderKind, 'ignore'>, string> = {
  materialId: 'Material ID',
  itemName: 'Item Name',
  description: 'Description',
  unit: 'Unit',
  stockType: 'Stock Type',
  category: 'Category',
  categoryId: 'Category ID',
  warehouse: 'Warehouse',
  warehouseId: 'Warehouse ID',
  allowNegativeConsumption: 'Allow Negative Consumption',
  assemblyUseDynamicCost: 'Assembly Use Dynamic Cost',
  externalItemName: 'External Item Name',
  unitCost: 'Unit Cost',
  reorderLevel: 'Reorder Level',
};

const TEXT_LIMITS: Record<'description' | 'stockType' | 'externalItemName' | 'unit', number> = {
  description: 500,
  stockType: 50,
  externalItemName: 100,
  unit: 20,
};

function headerKey(value: string) {
  return value.trim().toLowerCase();
}

export function isBlankCell(value: SheetCell | undefined) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function cellText(value: SheetCell | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function emptyText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function scaleKey(value: number, places: number) {
  return new Prisma.Decimal(value)
    .toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(places);
}

export function numbersMatch(left: number | null, right: number | null, places: number) {
  if (left === null || right === null) return left === right;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return scaleKey(left, places) === scaleKey(right, places);
}

function roundNumber(value: number, places: number) {
  return Number(scaleKey(value, places));
}

function findByName(items: NamedRef[], name: string): NamedRef | 'ambiguous' | null {
  const exact = items.filter((item) => item.name === name);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return 'ambiguous';
  const folded = items.filter((item) => namesMatch(item.name, name));
  if (folded.length === 1) return folded[0];
  if (folded.length > 1) return 'ambiguous';
  return null;
}

function parseBoolean(value: SheetCell | undefined): boolean | 'blank' | 'invalid' {
  if (isBlankCell(value)) return 'blank';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return 'invalid';
  }
  const normalized = cellText(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'allowed'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'blocked'].includes(normalized)) return false;
  return 'invalid';
}

function parseNonNegative(value: SheetCell | undefined, places: number): number | 'blank' | 'invalid' {
  if (isBlankCell(value)) return 'blank';
  const numeric = typeof value === 'number' ? value : Number(cellText(value));
  if (!Number.isFinite(numeric) || numeric < 0) return 'invalid';
  return roundNumber(numeric, places);
}

function skipRow(
  rowNumber: number,
  materialId: string | null,
  itemName: string | null,
  reason: string
): ClassifiedMaterialRow {
  return {
    rowNumber,
    materialId,
    itemName,
    status: 'skipped',
    reason,
    changes: [],
  };
}

function resolveRef(
  label: string,
  items: NamedRef[],
  idColumn: boolean,
  nameColumn: boolean,
  idCell: SheetCell | undefined,
  nameCell: SheetCell | undefined
): { ok: true; value: RefTarget | null } | { ok: false; reason: string } {
  const idText = idColumn && !isBlankCell(idCell) ? cellText(idCell) : '';
  const nameText = nameColumn && !isBlankCell(nameCell) ? cellText(nameCell) : '';
  if (!idText && !nameText) return { ok: true, value: null };

  if (idText) {
    const match = items.find((item) => item.id === idText);
    if (!match) return { ok: false, reason: `${label} not found` };
    if (nameText && !namesMatch(match.name, nameText)) {
      return { ok: false, reason: `${label} and ${label} ID do not match` };
    }
    return { ok: true, value: { id: match.id, name: match.name } };
  }

  const byName = findByName(items, nameText);
  if (byName === 'ambiguous') return { ok: false, reason: `More than one ${label} matches this name` };
  if (!byName) return { ok: false, reason: `${label} not found` };
  return { ok: true, value: { id: byName.id, name: byName.name } };
}

function sameRef(currentId: string | null, currentName: string | null, next: RefTarget) {
  return (currentId ?? null) === next.id && namesMatch(currentName ?? '', next.name);
}

export function classifyMaterialColumnSheet(
  sheet: SheetCell[][],
  materials: CatalogMaterial[],
  lookups: ColumnLookups
): MaterialColumnClassification {
  const headerRow = sheet[0];
  if (!headerRow || headerRow.length === 0) {
    return {
      ok: false,
      fileError: 'The file has no header row.',
      unknownColumns: [],
      ignoredColumns: [],
      rows: [],
    };
  }

  const columns: Array<{ index: number; kind: HeaderKind; label: string } | null> = [];
  const unknownColumns: string[] = [];
  const ignoredColumns: string[] = [];
  const seen = new Map<HeaderKind, string>();

  headerRow.forEach((cell, index) => {
    const label = cellText(cell);
    if (!label) {
      columns.push(null);
      return;
    }
    const kind = HEADER_KINDS[headerKey(label)];
    if (!kind) {
      if (!unknownColumns.includes(label)) unknownColumns.push(label);
      columns.push(null);
      return;
    }
    if (kind === 'ignore') {
      if (!ignoredColumns.includes(label)) ignoredColumns.push(label);
      columns.push({ index, kind, label });
      return;
    }
    const previous = seen.get(kind);
    if (previous) {
      seen.set(kind, previous);
    } else {
      seen.set(kind, HEADER_LABELS[kind]);
    }
    columns.push({ index, kind, label: HEADER_LABELS[kind] });
  });

  const duplicateLabels = [...seen.entries()]
    .filter(([kind]) => {
      if (kind === 'ignore') return false;
      return columns.filter((column) => column?.kind === kind).length > 1;
    })
    .map(([, label]) => label);

  if (duplicateLabels.length > 0) {
    return {
      ok: false,
      fileError: `Column ${duplicateLabels.join(', ')} appears more than once.`,
      unknownColumns,
      ignoredColumns,
      rows: [],
    };
  }

  if (!seen.has('materialId') || !seen.has('itemName')) {
    return {
      ok: false,
      fileError: 'The file must include Material ID and Item Name columns.',
      unknownColumns,
      ignoredColumns,
      rows: [],
    };
  }

  const dataRows = sheet.slice(1);
  if (dataRows.length > MATERIAL_COLUMN_UPDATE_MAX_ROWS) {
    return {
      ok: false,
      fileError: `Too many rows. Maximum ${MATERIAL_COLUMN_UPDATE_MAX_ROWS}.`,
      unknownColumns,
      ignoredColumns,
      rows: [],
    };
  }

  const byId = new Map(materials.map((material) => [material.id, material]));
  const indexOf = (kind: HeaderKind) => columns.find((column) => column?.kind === kind)?.index;

  const rows: ClassifiedMaterialRow[] = [];

  dataRows.forEach((row, index) => {
    if (!row.some((cell) => !isBlankCell(cell))) return;
    const rowNumber = index + 2;
    const materialId = cellText(row[indexOf('materialId') ?? -1]) || null;
    const itemName = cellText(row[indexOf('itemName') ?? -1]) || null;

    if (!materialId) {
      rows.push(skipRow(rowNumber, null, itemName, 'Material ID is blank'));
      return;
    }
    if (!itemName) {
      rows.push(skipRow(rowNumber, materialId, null, 'Item Name is blank'));
      return;
    }

    const material = byId.get(materialId);
    if (!material) {
      rows.push(skipRow(rowNumber, materialId, itemName, 'Material ID was not found'));
      return;
    }
    if (!namesMatch(material.name, itemName)) {
      rows.push(skipRow(rowNumber, materialId, itemName, 'Item Name does not match this Material ID'));
      return;
    }

    const reasons: string[] = [];
    const changes: MaterialColumnChange[] = [];

    const pushText = (
      field: 'description' | 'stockType' | 'externalItemName',
      current: string | null
    ) => {
      const column = indexOf(field);
      if (column === undefined) return;
      const cell = row[column];
      if (isBlankCell(cell)) return;
      const next = cellText(cell);
      if (next.length > TEXT_LIMITS[field]) {
        reasons.push(`${HEADER_LABELS[field]} is too long`);
        return;
      }
      if (emptyText(current) === next) return;
      changes.push({ field, label: HEADER_LABELS[field], from: emptyText(current), to: next });
    };

    pushText('description', material.description);
    pushText('stockType', material.stockType);
    pushText('externalItemName', material.externalItemName);

    const unitColumn = indexOf('unit');
    if (unitColumn !== undefined && !isBlankCell(row[unitColumn])) {
      const nextName = cellText(row[unitColumn]);
      if (nextName.length > TEXT_LIMITS.unit) {
        reasons.push('Unit is too long');
      } else if (!namesMatch(material.unit, nextName)) {
        const unit = findByName(lookups.units, nextName);
        if (unit === 'ambiguous') reasons.push('More than one Unit matches this name');
        else if (!unit) reasons.push('Unit not found');
        else changes.push({ field: 'unit', label: 'Unit', from: material.unit, to: unit.name });
      }
    }

    const pushBoolean = (field: BoolField, current: boolean) => {
      const column = indexOf(field);
      if (column === undefined) return;
      const parsed = parseBoolean(row[column]);
      if (parsed === 'blank') return;
      if (parsed === 'invalid') {
        reasons.push(`${HEADER_LABELS[field]} must be yes or no`);
        return;
      }
      if (parsed === current) return;
      changes.push({ field, label: HEADER_LABELS[field], from: current, to: parsed });
    };

    pushBoolean('allowNegativeConsumption', material.allowNegativeConsumption);
    pushBoolean('assemblyUseDynamicCost', material.assemblyUseDynamicCost);

    const pushNumber = (field: NumberField, current: number | null, places: number) => {
      const column = indexOf(field);
      if (column === undefined) return;
      const parsed = parseNonNegative(row[column], places);
      if (parsed === 'blank') return;
      if (parsed === 'invalid') {
        reasons.push(`${HEADER_LABELS[field]} must be a number zero or greater`);
        return;
      }
      if (numbersMatch(current, parsed, places)) return;
      changes.push({
        field,
        label: HEADER_LABELS[field],
        from: current === null ? null : roundNumber(current, places),
        to: parsed,
      });
    };

    pushNumber('unitCost', material.unitCost, UNIT_COST_PLACES);
    pushNumber('reorderLevel', material.reorderLevel, REORDER_LEVEL_PLACES);

    const pushRef = (
      field: RefField,
      label: string,
      items: NamedRef[],
      idKind: 'categoryId' | 'warehouseId',
      nameKind: 'category' | 'warehouse',
      currentId: string | null,
      currentName: string | null
    ) => {
      const idColumn = indexOf(idKind);
      const nameColumn = indexOf(nameKind);
      if (idColumn === undefined && nameColumn === undefined) return;
      const resolved = resolveRef(
        label,
        items,
        idColumn !== undefined,
        nameColumn !== undefined,
        idColumn === undefined ? null : row[idColumn],
        nameColumn === undefined ? null : row[nameColumn]
      );
      if (!resolved.ok) {
        reasons.push(resolved.reason);
        return;
      }
      if (!resolved.value || sameRef(currentId, currentName, resolved.value)) return;
      changes.push({
        field,
        label,
        from: { id: currentId, name: emptyText(currentName) },
        to: resolved.value,
      });
    };

    pushRef(
      'category',
      'Category',
      lookups.categories,
      'categoryId',
      'category',
      material.categoryId,
      material.category
    );
    pushRef(
      'warehouse',
      'Warehouse',
      lookups.warehouses,
      'warehouseId',
      'warehouse',
      material.warehouseId,
      material.warehouse
    );

    if (reasons.length > 0) {
      rows.push(skipRow(rowNumber, material.id, material.name, reasons.join('; ')));
      return;
    }

    rows.push({
      rowNumber,
      materialId: material.id,
      itemName: material.name,
      status: changes.length > 0 ? 'update' : 'unchanged',
      reason: null,
      changes,
    });
  });

  const idCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.materialId) continue;
    idCounts.set(row.materialId, (idCounts.get(row.materialId) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.materialId && (idCounts.get(row.materialId) ?? 0) > 1) {
      row.status = 'skipped';
      row.reason = 'Duplicate Material ID in this file';
      row.changes = [];
    }
  }

  return {
    ok: true,
    fileError: null,
    unknownColumns,
    ignoredColumns,
    rows,
  };
}

export function partitionColumnChanges(material: CatalogMaterial, changes: MaterialColumnChange[]) {
  const writable: MaterialColumnChange[] = [];
  const drifted: MaterialColumnChange[] = [];

  for (const change of changes) {
    if (!fromMatchesMaterial(material, change)) {
      drifted.push(change);
      continue;
    }
    if (!toMatchesMaterial(material, change)) writable.push(change);
  }

  return { writable, drifted };
}

function fromMatchesMaterial(material: CatalogMaterial, change: MaterialColumnChange) {
  switch (change.field) {
    case 'description':
      return emptyText(material.description) === change.from;
    case 'externalItemName':
      return emptyText(material.externalItemName) === change.from;
    case 'stockType':
      return emptyText(material.stockType) === change.from;
    case 'unit':
      return material.unit === change.from;
    case 'allowNegativeConsumption':
      return material.allowNegativeConsumption === change.from;
    case 'assemblyUseDynamicCost':
      return material.assemblyUseDynamicCost === change.from;
    case 'unitCost':
      return numbersMatch(material.unitCost, change.from, UNIT_COST_PLACES);
    case 'reorderLevel':
      return numbersMatch(material.reorderLevel, change.from, REORDER_LEVEL_PLACES);
    case 'category':
      return (material.categoryId ?? null) === change.from.id && emptyText(material.category) === change.from.name;
    case 'warehouse':
      return (material.warehouseId ?? null) === change.from.id && emptyText(material.warehouse) === change.from.name;
    default:
      return false;
  }
}

function toMatchesMaterial(material: CatalogMaterial, change: MaterialColumnChange) {
  switch (change.field) {
    case 'description':
      return emptyText(material.description) === change.to;
    case 'externalItemName':
      return emptyText(material.externalItemName) === change.to;
    case 'stockType':
      return material.stockType === change.to;
    case 'unit':
      return namesMatch(material.unit, change.to);
    case 'allowNegativeConsumption':
      return material.allowNegativeConsumption === change.to;
    case 'assemblyUseDynamicCost':
      return material.assemblyUseDynamicCost === change.to;
    case 'unitCost':
      return numbersMatch(material.unitCost, change.to, UNIT_COST_PLACES);
    case 'reorderLevel':
      return numbersMatch(material.reorderLevel, change.to, REORDER_LEVEL_PLACES);
    case 'category':
      return sameRef(material.categoryId, material.category, change.to);
    case 'warehouse':
      return sameRef(material.warehouseId, material.warehouse, change.to);
    default:
      return false;
  }
}
