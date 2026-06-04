import { randomUUID } from 'crypto';
import type { JobItemSpecifications } from '@/lib/job-costing/types';

export type ManualBudgetMaterialLine = {
  id: string;
  materialId: string;
  quantity: number;
  wastePercent?: number;
};

export type ManualBudgetLaborLine = {
  id: string;
  expertiseName: string;
  estimatedHours: number;
  crewSize?: number;
};

export type JobItemManualBudget = {
  materials: ManualBudgetMaterialLine[];
  labor: ManualBudgetLaborLine[];
};

export type JobItemManualSpecifications = JobItemSpecifications & {
  budgetMode: 'manual';
  manualBudget: JobItemManualBudget;
};

export const MANUAL_BUDGET_HOURS_PER_WORKER_DAY = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isManualBudgetSpecifications(specifications: unknown): specifications is JobItemManualSpecifications {
  if (!isRecord(specifications)) return false;
  if (specifications.budgetMode !== 'manual') return false;
  return isRecord(specifications.manualBudget);
}

export function parseManualBudgetSpecifications(specifications: unknown): JobItemManualBudget | null {
  if (!isManualBudgetSpecifications(specifications)) return null;
  const raw = specifications.manualBudget;
  const materials = Array.isArray(raw.materials)
    ? raw.materials.flatMap((line): ManualBudgetMaterialLine[] => {
        if (!isRecord(line) || typeof line.materialId !== 'string' || !line.materialId.trim()) return [];
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return [];
        const wastePercent = line.wastePercent === undefined ? undefined : Number(line.wastePercent);
        return [{
          id: typeof line.id === 'string' && line.id.trim() ? line.id : randomUUID(),
          materialId: line.materialId.trim(),
          quantity,
          wastePercent: Number.isFinite(wastePercent) ? wastePercent : undefined,
        }];
      })
    : [];
  const labor = Array.isArray(raw.labor)
    ? raw.labor.flatMap((line): ManualBudgetLaborLine[] => {
        if (!isRecord(line) || typeof line.expertiseName !== 'string' || !line.expertiseName.trim()) return [];
        const estimatedHours = Number(line.estimatedHours);
        if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) return [];
        const parsedCrew = line.crewSize === undefined ? NaN : Number(line.crewSize);
        return [{
          id: typeof line.id === 'string' && line.id.trim() ? line.id : randomUUID(),
          expertiseName: line.expertiseName.trim(),
          estimatedHours,
          crewSize: Number.isFinite(parsedCrew) && parsedCrew >= 1 ? Math.ceil(parsedCrew) : undefined,
        }];
      })
    : [];
  return { materials, labor };
}

export function buildManualBudgetSpecifications(manualBudget: JobItemManualBudget): JobItemManualSpecifications {
  return {
    budgetMode: 'manual',
    manualBudget: {
      materials: manualBudget.materials.map((line) => ({
        id: line.id,
        materialId: line.materialId,
        quantity: line.quantity,
        ...(line.wastePercent !== undefined && line.wastePercent > 0 ? { wastePercent: line.wastePercent } : {}),
      })),
      labor: manualBudget.labor.map((line) => ({
        id: line.id,
        expertiseName: line.expertiseName,
        estimatedHours: line.estimatedHours,
        ...(line.crewSize && line.crewSize > 1 ? { crewSize: line.crewSize } : {}),
      })),
    },
  };
}

export function getManualBudgetMaterialIds(specifications: unknown): string[] {
  const manual = parseManualBudgetSpecifications(specifications);
  if (!manual) return [];
  return manual.materials.map((line) => line.materialId);
}

export function validateManualBudgetForSave(manualBudget: JobItemManualBudget): string | null {
  if (manualBudget.materials.length === 0 && manualBudget.labor.length === 0) {
    return 'Add at least one material line or labor line';
  }
  for (const line of manualBudget.materials) {
    if (!line.materialId.trim()) return 'Each material line needs a material';
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return 'Each material line needs a quantity greater than zero';
  }
  for (const line of manualBudget.labor) {
    if (!line.expertiseName.trim()) return 'Each labor line needs an expertise or trade name';
    if (!Number.isFinite(line.estimatedHours) || line.estimatedHours <= 0) {
      return 'Each labor line needs estimated hours greater than zero';
    }
  }
  return null;
}

export function manualLaborEstimatedDays(line: ManualBudgetLaborLine) {
  const crewSize = Math.max(1, line.crewSize ?? 1);
  return line.estimatedHours / (crewSize * MANUAL_BUDGET_HOURS_PER_WORKER_DAY);
}
