import { z } from 'zod';
import {
  buildManualBudgetSpecifications,
  isManualBudgetSpecifications,
  parseManualBudgetSpecifications,
  validateManualBudgetForSave,
} from '@/lib/job-costing/manualBudget';

const TrackingItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  unit: z.string().max(40).optional().nullable(),
  targetValue: z.number().positive(),
  sourceKey: z.string().max(180).optional().nullable(),
  finishedGoodMaterialId: z.string().min(1).optional().nullable(),
  finishedGoodWarehouseId: z.string().min(1).optional().nullable(),
});

const JobItemCommonSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  specifications: z.unknown().optional(),
  assignedEmployeeIds: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).optional(),
  progressStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  trackingItems: z.array(TrackingItemSchema).optional(),
  trackingEnabled: z.boolean().optional(),
  trackingLabel: z.string().max(120).optional().nullable(),
  trackingUnit: z.string().max(40).optional().nullable(),
  trackingTargetValue: z.number().min(0).optional().nullable(),
  trackingSourceKey: z.string().max(180).optional().nullable(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
  actualStartDate: z.string().optional().nullable(),
  actualEndDate: z.string().optional().nullable(),
  progressNote: z.string().max(2000).optional().nullable(),
});

export const JobItemCreateSchema = JobItemCommonSchema.extend({
  formulaLibraryId: z.string().min(1).nullable().optional(),
}).superRefine((data, ctx) => {
  const manual = parseManualBudgetSpecifications(data.specifications);
  const hasFormula = Boolean(data.formulaLibraryId?.trim());
  if (hasFormula && manual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose either a formula or a manual budget, not both',
      path: ['formulaLibraryId'],
    });
    return;
  }
  if (!hasFormula && !manual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select a formula or provide a manual material and labor budget',
      path: ['formulaLibraryId'],
    });
    return;
  }
  if (!hasFormula && manual) {
    const error = validateManualBudgetForSave(manual);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['specifications'] });
    }
  }
});

export const JobItemUpdateSchema = JobItemCommonSchema.extend({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  formulaLibraryId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.specifications === undefined && data.formulaLibraryId === undefined) return;
  const manual = data.specifications === undefined ? null : parseManualBudgetSpecifications(data.specifications);
  const clearingFormula = data.formulaLibraryId === null;
  const hasFormula = typeof data.formulaLibraryId === 'string' && data.formulaLibraryId.trim().length > 0;
  if (hasFormula && (manual || clearingFormula)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Manual budget items cannot reference a formula',
      path: ['formulaLibraryId'],
    });
  }
  if (!hasFormula && manual) {
    const error = validateManualBudgetForSave(manual);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ['specifications'] });
    }
  }
});

export function normalizeJobItemCreatePayload(data: z.infer<typeof JobItemCreateSchema>) {
  const manual = parseManualBudgetSpecifications(data.specifications);
  if (manual) {
    return {
      ...data,
      formulaLibraryId: null,
      specifications: buildManualBudgetSpecifications(manual),
    };
  }
  return {
    ...data,
    formulaLibraryId: data.formulaLibraryId ?? null,
    specifications: data.specifications ?? {},
  };
}

export function normalizeJobItemUpdatePayload(
  existing: { formulaLibraryId: string | null; specifications: unknown },
  data: z.infer<typeof JobItemUpdateSchema>
) {
  const nextSpecs = data.specifications ?? existing.specifications;
  const manual = isManualBudgetSpecifications(nextSpecs) ? parseManualBudgetSpecifications(nextSpecs) : null;
  if (manual || existing.formulaLibraryId === null) {
    return {
      ...data,
      formulaLibraryId: null,
      ...(manual ? { specifications: buildManualBudgetSpecifications(manual) } : {}),
    };
  }
  return data;
}
