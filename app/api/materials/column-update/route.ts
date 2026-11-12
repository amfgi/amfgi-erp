import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  MATERIAL_COLUMN_UPDATE_APPLY_CHUNK,
  MATERIAL_COLUMN_UPDATE_MAX_ROWS,
  classifyMaterialColumnSheet,
  namesMatch,
  partitionColumnChanges,
  type CatalogMaterial,
  type ColumnLookups,
  type MaterialColumnChange,
  type SheetCell,
} from '@/lib/import-export/materialColumnUpdate';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumber } from '@/lib/utils/decimal';
import { recalculateAssemblyAncestorsTx } from '@/lib/utils/materialAssembly';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const maxDuration = 60;

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const textChangeSchema = z.object({
  field: z.enum(['description', 'unit', 'stockType', 'externalItemName']),
  label: z.string(),
  from: z.string().nullable(),
  to: z.string().min(1),
});

const boolChangeSchema = z.object({
  field: z.enum(['allowNegativeConsumption', 'assemblyUseDynamicCost']),
  label: z.string(),
  from: z.boolean(),
  to: z.boolean(),
});

const numberChangeSchema = z.object({
  field: z.enum(['unitCost', 'reorderLevel']),
  label: z.string(),
  from: z.number().finite().nullable(),
  to: z.number().finite().min(0),
});

const refChangeSchema = z.object({
  field: z.enum(['category', 'warehouse']),
  label: z.string(),
  from: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
  }),
  to: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
});

const changeSchema = z.union([textChangeSchema, boolChangeSchema, numberChangeSchema, refChangeSchema]);

const previewSchema = z.object({
  mode: z.literal('preview'),
  rows: z.array(z.array(cellSchema)).min(1).max(MATERIAL_COLUMN_UPDATE_MAX_ROWS + 1),
});

const applyRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  materialId: z.string().min(1).max(100),
  itemName: z.string().min(1).max(500),
  changes: z.array(changeSchema).min(1).max(12),
});

const applySchema = z.object({
  mode: z.literal('apply'),
  rows: z.array(applyRowSchema).max(MATERIAL_COLUMN_UPDATE_APPLY_CHUNK),
});

const requestSchema = z.discriminatedUnion('mode', [previewSchema, applySchema]);

const materialSelect = {
  id: true,
  name: true,
  description: true,
  unit: true,
  stockType: true,
  category: true,
  categoryId: true,
  warehouse: true,
  warehouseId: true,
  allowNegativeConsumption: true,
  assemblyUseDynamicCost: true,
  externalItemName: true,
  unitCost: true,
  reorderLevel: true,
} satisfies Prisma.MaterialSelect;

type MaterialRow = Prisma.MaterialGetPayload<{ select: typeof materialSelect }>;

function toCatalog(row: MaterialRow): CatalogMaterial {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    stockType: row.stockType,
    category: row.category,
    categoryId: row.categoryId,
    warehouse: row.warehouse,
    warehouseId: row.warehouseId,
    allowNegativeConsumption: row.allowNegativeConsumption,
    assemblyUseDynamicCost: row.assemblyUseDynamicCost,
    externalItemName: row.externalItemName,
    unitCost: decimalToNumber(row.unitCost) ?? null,
    reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
  };
}

function invalidChange(change: MaterialColumnChange, lookups: ColumnLookups) {
  switch (change.field) {
    case 'description':
      return change.to.length > 500 ? 'Description is too long' : null;
    case 'stockType':
      return change.to.length > 50 ? 'Stock Type is too long' : null;
    case 'externalItemName':
      return change.to.length > 100 ? 'External Item Name is too long' : null;
    case 'unit':
      return lookups.units.some((unit) => unit.name === change.to) ? null : 'Unit not found';
    case 'unitCost':
    case 'reorderLevel':
      return change.to >= 0 ? null : `${change.label} must be a number zero or greater`;
    case 'category':
    case 'warehouse': {
      const items = change.field === 'category' ? lookups.categories : lookups.warehouses;
      const match = items.find((item) => item.id === change.to.id);
      if (!match || !namesMatch(match.name, change.to.name)) return `${change.label} not found`;
      return null;
    }
    default:
      return null;
  }
}

function patchFrom(changes: MaterialColumnChange[]): Prisma.MaterialUncheckedUpdateInput {
  const data: Prisma.MaterialUncheckedUpdateInput = {};
  for (const change of changes) {
    switch (change.field) {
      case 'description':
        data.description = change.to;
        break;
      case 'unit':
        data.unit = change.to;
        break;
      case 'stockType':
        data.stockType = change.to;
        break;
      case 'externalItemName':
        data.externalItemName = change.to;
        break;
      case 'allowNegativeConsumption':
        data.allowNegativeConsumption = change.to;
        break;
      case 'assemblyUseDynamicCost':
        data.assemblyUseDynamicCost = change.to;
        break;
      case 'unitCost':
        data.unitCost = change.to;
        break;
      case 'reorderLevel':
        data.reorderLevel = change.to;
        break;
      case 'category':
        data.category = change.to.name;
        data.categoryId = change.to.id;
        break;
      case 'warehouse':
        data.warehouse = change.to.name;
        data.warehouseId = change.to.id;
        break;
      default:
        break;
    }
  }
  return data;
}

function logFrom(changes: MaterialColumnChange[]) {
  const changesLog: Record<string, { from: unknown; to: unknown }> = {};
  for (const change of changes) {
    if (change.field === 'category') {
      changesLog.category = { from: change.from.name, to: change.to.name };
      changesLog.categoryId = { from: change.from.id, to: change.to.id };
      continue;
    }
    if (change.field === 'warehouse') {
      changesLog.warehouse = { from: change.from.name, to: change.to.name };
      changesLog.warehouseId = { from: change.from.id, to: change.to.id };
      continue;
    }
    changesLog[change.field] = { from: change.from, to: change.to };
  }
  return changesLog;
}

async function loadLookups(companyId: string): Promise<ColumnLookups> {
  const [units, categories, warehouses] = await Promise.all([
    prisma.unit.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.warehouse.findMany({ where: { companyId }, select: { id: true, name: true } }),
  ]);
  return { units, categories, warehouses };
}

async function loadCatalog(companyId: string) {
  const materials = await prisma.material.findMany({
    where: { companyId },
    select: materialSelect,
  });
  return materials.map(toCatalog);
}

type ApplyResult = {
  rowNumber: number;
  materialId: string;
  status: 'updated' | 'skipped';
  reason: string | null;
  appliedFields: string[];
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.edit')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const changedBy = session.user.name || session.user.email || session.user.id;

  if (parsed.data.mode === 'preview') {
    const [catalog, lookups] = await Promise.all([loadCatalog(companyId), loadLookups(companyId)]);
    const classification = classifyMaterialColumnSheet(parsed.data.rows as SheetCell[][], catalog, lookups);
    const summary = {
      update: classification.rows.filter((row) => row.status === 'update').length,
      unchanged: classification.rows.filter((row) => row.status === 'unchanged').length,
      skipped: classification.rows.filter((row) => row.status === 'skipped').length,
    };
    return successResponse({ ...classification, summary });
  }

  const lookups = await loadLookups(companyId);
  const idCounts = new Map<string, number>();
  for (const row of parsed.data.rows) {
    idCounts.set(row.materialId, (idCounts.get(row.materialId) ?? 0) + 1);
  }

  const results: ApplyResult[] = [];

  for (const row of parsed.data.rows) {
    if ((idCounts.get(row.materialId) ?? 0) > 1) {
      results.push({
        rowNumber: row.rowNumber,
        materialId: row.materialId,
        status: 'skipped',
        reason: 'Duplicate Material ID in this file',
        appliedFields: [],
      });
      continue;
    }

    const fields = new Set(row.changes.map((change) => change.field));
    if (fields.size !== row.changes.length) {
      results.push({
        rowNumber: row.rowNumber,
        materialId: row.materialId,
        status: 'skipped',
        reason: 'The same column appears more than once on this row',
        appliedFields: [],
      });
      continue;
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const existing = await tx.material.findUnique({
          where: { companyId_id: { companyId, id: row.materialId } },
          select: materialSelect,
        });
        if (!existing) {
          return {
            status: 'skipped' as const,
            reason: 'Material ID was not found',
            appliedFields: [] as string[],
          };
        }
        if (!namesMatch(existing.name, row.itemName)) {
          return {
            status: 'skipped' as const,
            reason: 'Item Name does not match this Material ID',
            appliedFields: [] as string[],
          };
        }

        const changes = row.changes as MaterialColumnChange[];
        const invalid = changes
          .map((change) => invalidChange(change, lookups))
          .filter((reason): reason is string => Boolean(reason));
        if (invalid.length > 0) {
          return { status: 'skipped' as const, reason: invalid.join('; '), appliedFields: [] as string[] };
        }

        const catalog = toCatalog(existing);
        const { writable, drifted } = partitionColumnChanges(catalog, changes);
        const unitChange = writable.find((change) => change.field === 'unit');
        if (unitChange && unitChange.field === 'unit') {
          const unitRow = await tx.unit.findUnique({
            where: { companyId_name: { companyId, name: unitChange.to } },
            select: { id: true },
          });
          if (!unitRow) {
            return { status: 'skipped' as const, reason: 'Unit not found', appliedFields: [] as string[] };
          }
          const base = await tx.materialUom.findFirst({
            where: { materialId: existing.id, isBase: true },
            select: { id: true },
          });
          if (base) {
            const taken = await tx.materialUom.findFirst({
              where: { materialId: existing.id, unitId: unitRow.id, NOT: { id: base.id } },
              select: { id: true },
            });
            if (taken) {
              return {
                status: 'skipped' as const,
                reason: 'That unit is already used as a packaging UOM for this material.',
                appliedFields: [] as string[],
              };
            }
          }
        }

        if (writable.length === 0) {
          const reason =
            drifted.length > 0
              ? drifted
                  .map((change) => `${change.label} no longer matches the reviewed value, so it was left unchanged`)
                  .join('; ')
              : 'Nothing left to change';
          return { status: 'skipped' as const, reason, appliedFields: [] as string[] };
        }

        await tx.material.update({
          where: { companyId_id: { companyId, id: existing.id } },
          data: patchFrom(writable),
        });

        const nextUnit = writable.find((change) => change.field === 'unit');
        if (nextUnit && nextUnit.field === 'unit') {
          const unitRow = await tx.unit.findUnique({
            where: { companyId_name: { companyId, name: nextUnit.to } },
            select: { id: true },
          });
          if (unitRow) {
            const base = await tx.materialUom.findFirst({
              where: { materialId: existing.id, isBase: true },
              select: { id: true },
            });
            if (base) {
              await tx.materialUom.update({
                where: { id: base.id },
                data: { unitId: unitRow.id },
              });
            } else {
              await tx.materialUom.create({
                data: {
                  companyId,
                  materialId: existing.id,
                  unitId: unitRow.id,
                  isBase: true,
                  parentUomId: null,
                  factorToParent: 1,
                },
              });
            }
          }
        }

        if (writable.some((change) => change.field === 'unitCost')) {
          await recalculateAssemblyAncestorsTx(tx, companyId, existing.id, changedBy);
        }

        await tx.materialLog.create({
          data: {
            companyId,
            materialId: existing.id,
            action: 'updated',
            changes: logFrom(writable) as Prisma.InputJsonValue,
            changedBy,
          },
        });

        const driftNote =
          drifted.length > 0
            ? drifted
                .map((change) => `${change.label} no longer matches the reviewed value, so it was left unchanged`)
                .join('; ')
            : null;

        return {
          status: 'updated' as const,
          reason: driftNote,
          appliedFields: writable.map((change) => change.label),
        };
      });

      results.push({
        rowNumber: row.rowNumber,
        materialId: row.materialId,
        status: outcome.status,
        reason: outcome.reason,
        appliedFields: outcome.appliedFields,
      });
    } catch (err: unknown) {
      results.push({
        rowNumber: row.rowNumber,
        materialId: row.materialId,
        status: 'skipped',
        reason: err instanceof Error ? err.message : 'Update failed',
        appliedFields: [],
      });
    }
  }

  const updated = results.filter((result) => result.status === 'updated').length;
  if (updated > 0) {
    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'material',
      action: 'updated',
    });
  }

  return successResponse({
    updated,
    skipped: results.length - updated,
    results,
  });
}
