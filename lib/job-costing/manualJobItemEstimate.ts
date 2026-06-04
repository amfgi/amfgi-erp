import { calculateTrackedProgress, type TrackableItem } from '@/lib/job-costing/progressTracking';
import {
  MANUAL_BUDGET_HOURS_PER_WORKER_DAY,
  manualLaborEstimatedDays,
  parseManualBudgetSpecifications,
} from '@/lib/job-costing/manualBudget';
import type {
  EmployeeExpertiseProfile,
  JobItemCostEstimate,
  JobItemLaborEstimate,
  JobItemMaterialEstimate,
  JobItemSpecifications,
  MaterialPricingSnapshot,
  PricingMode,
} from '@/lib/job-costing/types';

type BuildManualEstimateArgs = {
  postingDate: Date;
  nonWorkingWeekdays: number[];
  pricingMode: PricingMode;
  jobItem: {
    id: string;
    name: string;
    specifications: JobItemSpecifications;
    assignedEmployeeIds: string[];
    progressStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
    progressPercent?: number;
    trackingItems?: TrackableItem[];
    trackingEnabled?: boolean;
    trackingLabel?: string | null;
    trackingUnit?: string | null;
    trackingTargetValue?: number | null;
    trackingSourceKey?: string | null;
    plannedStartDate?: Date | null;
    plannedEndDate?: Date | null;
    actualStartDate?: Date | null;
    actualEndDate?: Date | null;
    progressNote?: string | null;
    progressEntries?: Array<{
      trackerId?: string | null;
      entryDate: Date;
      quantity: number;
    }>;
    attendanceEntries?: Array<{
      employeeId: string;
      workDate: Date;
      workedMinutes: number;
    }>;
  };
  materialCatalog: Map<string, { id: string; name: string; unit: string }>;
  materialPricing: Map<string, MaterialPricingSnapshot>;
  materialFactorToBase: (materialId: string, quantityUomId?: string | null) => number;
  actualConsumption: Map<string, { materialId: string; actualIssuedBaseQuantity: number; actualIssuedCost: number }>;
  teamProfiles: EmployeeExpertiseProfile[];
};

function nextWorkingDate(start: Date, offsetDays: number, nonWorkingWeekdays: number[]) {
  if (offsetDays <= 0) return start.toISOString();
  const current = new Date(start);
  let remaining = Math.ceil(offsetDays);
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (nonWorkingWeekdays.includes(current.getDay())) continue;
    remaining -= 1;
  }
  return current.toISOString();
}

function diffCalendarDays(later: Date, earlier: Date) {
  const laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterUtc - earlierUtc) / 86400000);
}

function resolveIssuePaceStatus(
  expectedIssuedBaseQuantity: number,
  actualIssuedBaseQuantity: number,
  scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD'
) {
  if (scheduleStatus === 'NOT_DUE' && expectedIssuedBaseQuantity <= 0) return 'NOT_DUE' as const;
  const variance = actualIssuedBaseQuantity - expectedIssuedBaseQuantity;
  const tolerance = Math.max(expectedIssuedBaseQuantity * 0.05, 0.001);
  if (variance > tolerance) return 'OVER_ISSUED' as const;
  if (variance < -tolerance) return 'UNDER_ISSUED' as const;
  return 'ON_PLAN' as const;
}

function normalizeExpertise(value: string) {
  return value.trim().toLowerCase();
}

export function buildManualJobItemEstimate({
  postingDate,
  nonWorkingWeekdays,
  pricingMode,
  jobItem,
  materialCatalog,
  materialPricing,
  materialFactorToBase,
  actualConsumption,
  teamProfiles,
}: BuildManualEstimateArgs): JobItemCostEstimate {
  const manualBudget = parseManualBudgetSpecifications(jobItem.specifications) ?? { materials: [], labor: [] };
  const materialTotals = new Map<string, JobItemMaterialEstimate>();
  const laborTotals = new Map<string, JobItemLaborEstimate>();
  const warnings: string[] = [];

  const tracking = calculateTrackedProgress(
    jobItem.trackingItems ?? [],
    jobItem.progressEntries ?? [],
    {
      progressStatus: jobItem.progressStatus,
      progressPercent: jobItem.progressPercent,
    },
    jobItem.attendanceEntries ?? []
  );
  const progressStatus = tracking.enabled ? tracking.derivedStatus : (jobItem.progressStatus ?? 'NOT_STARTED');
  const percentComplete = Math.max(0, Math.min(100, tracking.percentComplete));
  const plannedStartDate = jobItem.plannedStartDate ?? null;
  const plannedEndDate = jobItem.plannedEndDate ?? null;
  const actualStartDate = jobItem.actualStartDate ?? tracking.firstEntryDate ?? null;
  const actualEndDate = jobItem.actualEndDate ?? (progressStatus === 'COMPLETED' ? tracking.lastEntryDate : null);
  const provisionalScheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD' =
    progressStatus === 'ON_HOLD'
      ? 'ON_HOLD'
      : progressStatus === 'COMPLETED'
        ? 'COMPLETED'
        : plannedStartDate && postingDate.getTime() < plannedStartDate.getTime()
          ? 'NOT_DUE'
          : 'ON_TRACK';

  for (const line of manualBudget.materials) {
    const material = materialCatalog.get(line.materialId);
    if (!material) {
      warnings.push(`Material ${line.materialId} is no longer available in this company.`);
      continue;
    }
    const wasteFactor = 1 + ((line.wastePercent ?? 0) / 100);
    const estimatedBaseQuantity = line.quantity * wasteFactor * materialFactorToBase(line.materialId);
    const price = materialPricing.get(line.materialId);
    const actual = actualConsumption.get(line.materialId);
    const existing = materialTotals.get(line.materialId);
    const quotedUnitCost = price?.baseUnitCost ?? 0;
    const quotedCost = estimatedBaseQuantity * quotedUnitCost;
    const expectedIssuedBaseQuantity = estimatedBaseQuantity * (percentComplete / 100);
    const expectedIssuedCost = expectedIssuedBaseQuantity * quotedUnitCost;
    const actualIssuedBaseQuantity = actual?.actualIssuedBaseQuantity ?? 0;
    const actualIssuedCost = actual?.actualIssuedCost ?? 0;
    const issuePaceVariance = actualIssuedBaseQuantity - expectedIssuedBaseQuantity;
    const issuePaceStatus = resolveIssuePaceStatus(
      expectedIssuedBaseQuantity,
      actualIssuedBaseQuantity,
      provisionalScheduleStatus
    );

    materialTotals.set(line.materialId, {
      materialId: line.materialId,
      materialName: material.name,
      baseUnit: material.unit,
      estimatedBaseQuantity: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity,
      expectedIssuedBaseQuantity: (existing?.expectedIssuedBaseQuantity ?? 0) + expectedIssuedBaseQuantity,
      quotedUnitCost,
      quotedCost: (existing?.quotedCost ?? 0) + quotedCost,
      expectedIssuedCost: (existing?.expectedIssuedCost ?? 0) + expectedIssuedCost,
      actualIssuedBaseQuantity,
      actualIssuedCost,
      quantityVariance: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity - actualIssuedBaseQuantity,
      costVariance: ((existing?.quotedCost ?? 0) + quotedCost) - actualIssuedCost,
      issuePaceVariance: (existing?.issuePaceVariance ?? 0) + issuePaceVariance,
      issuePaceStatus,
      issueReconcileCompatible: true,
      pricingSource: price?.source ?? pricingMode,
    });
  }

  for (const line of manualBudget.labor) {
    const requiredWorkers = Math.max(1, line.crewSize ?? 1);
    const estimatedDays = manualLaborEstimatedDays(line);
    const expertiseKey = normalizeExpertise(line.expertiseName);
    const matchingEmployees = teamProfiles.filter((employee) =>
      employee.expertises.some((expertise) => normalizeExpertise(expertise) === expertiseKey)
    );
    const laborRow: JobItemLaborEstimate = {
      expertiseName: line.expertiseName,
      requiredWorkers,
      estimatedDays,
      productivityPerWorkerPerDay: MANUAL_BUDGET_HOURS_PER_WORKER_DAY,
      assignedEmployeeIds: matchingEmployees.map((employee) => employee.id),
      assignedEmployeeNames: matchingEmployees.map((employee) => employee.fullName),
      missingExpertises: matchingEmployees.length > 0 ? [] : [line.expertiseName],
    };
    const existing = laborTotals.get(laborRow.expertiseName);
    if (!existing) {
      laborTotals.set(laborRow.expertiseName, laborRow);
      continue;
    }
    laborTotals.set(laborRow.expertiseName, {
      ...existing,
      requiredWorkers: Math.max(existing.requiredWorkers, laborRow.requiredWorkers),
      estimatedDays: existing.estimatedDays + laborRow.estimatedDays,
      assignedEmployeeIds: Array.from(new Set([...existing.assignedEmployeeIds, ...laborRow.assignedEmployeeIds])),
      assignedEmployeeNames: Array.from(new Set([...existing.assignedEmployeeNames, ...laborRow.assignedEmployeeNames])),
      missingExpertises: Array.from(new Set([...existing.missingExpertises, ...laborRow.missingExpertises])),
    });
  }

  let scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD' = provisionalScheduleStatus;
  let varianceDays = 0;
  const materials = Array.from(materialTotals.values()).map((row) => ({
    ...row,
    quantityVariance: row.estimatedBaseQuantity - row.actualIssuedBaseQuantity,
    costVariance: row.quotedCost - row.actualIssuedCost,
    issuePaceVariance: row.actualIssuedBaseQuantity - row.expectedIssuedBaseQuantity,
    issuePaceStatus: resolveIssuePaceStatus(
      row.expectedIssuedBaseQuantity,
      row.actualIssuedBaseQuantity,
      scheduleStatus
    ),
  }));
  const labor = Array.from(laborTotals.values());
  const totalQuotedMaterialCost = materials.reduce((sum, row) => sum + row.quotedCost, 0);
  const totalActualMaterialCost = materials.reduce((sum, row) => sum + row.actualIssuedCost, 0);
  const estimatedCompletionDays = labor.reduce((maxDays, row) => Math.max(maxDays, row.estimatedDays), 0);
  const remainingFactor = Math.max(0, 1 - (percentComplete / 100));
  const forecastBaseDate = actualStartDate ?? plannedStartDate ?? postingDate;
  const forecastCompletionDate = progressStatus === 'COMPLETED'
    ? actualEndDate?.toISOString() ?? plannedEndDate?.toISOString() ?? null
    : nextWorkingDate(forecastBaseDate, estimatedCompletionDays * remainingFactor, nonWorkingWeekdays);

  if (progressStatus === 'ON_HOLD') {
    scheduleStatus = 'ON_HOLD';
  } else if (progressStatus === 'COMPLETED') {
    scheduleStatus = 'COMPLETED';
    if (plannedEndDate && actualEndDate) {
      varianceDays = diffCalendarDays(actualEndDate, plannedEndDate);
    }
  } else if (plannedStartDate && postingDate.getTime() < plannedStartDate.getTime()) {
    scheduleStatus = 'NOT_DUE';
  } else if (plannedEndDate && forecastCompletionDate) {
    varianceDays = diffCalendarDays(new Date(forecastCompletionDate), plannedEndDate);
    if (varianceDays > 0) {
      scheduleStatus = 'DELAYED';
    } else if (varianceDays === 0) {
      scheduleStatus = 'AT_RISK';
    } else {
      scheduleStatus = 'ON_TRACK';
    }
  }

  for (const laborRow of labor) {
    if (laborRow.missingExpertises.length > 0) {
      warnings.push(`Assigned team is missing ${laborRow.missingExpertises.join(', ')} expertise.`);
    }
  }

  if (manualBudget.materials.length === 0 && manualBudget.labor.length === 0) {
    warnings.push('Manual budget has no material or labor lines.');
  }

  return {
    itemId: jobItem.id,
    itemName: jobItem.name,
    formulaLibraryId: null,
    formulaLibraryName: 'Manual budget',
    fabricationType: 'Manual',
    materials,
    labor,
    totalQuotedMaterialCost,
    totalActualMaterialCost,
    estimatedCompletionDays,
    estimatedCompletionDate: nextWorkingDate(postingDate, estimatedCompletionDays, nonWorkingWeekdays),
    progress: {
      status: progressStatus,
      scheduleStatus,
      percentComplete,
      plannedStartDate: plannedStartDate?.toISOString() ?? null,
      plannedEndDate: plannedEndDate?.toISOString() ?? null,
      actualStartDate: actualStartDate?.toISOString() ?? null,
      actualEndDate: actualEndDate?.toISOString() ?? null,
      forecastCompletionDate,
      varianceDays,
      note: jobItem.progressNote ?? null,
      remainingQuotedMaterialCost: totalQuotedMaterialCost * remainingFactor,
      remainingEstimatedDays: estimatedCompletionDays * remainingFactor,
      completedQuotedMaterialCost: totalQuotedMaterialCost * (percentComplete / 100),
      tracking: {
        enabled: tracking.enabled,
        items: tracking.items.map((item) => ({
          ...item,
          unit: item.unit ?? null,
          sourceKey: item.sourceKey ?? null,
          firstEntryDate: item.firstEntryDate?.toISOString() ?? null,
          lastEntryDate: item.lastEntryDate?.toISOString() ?? null,
        })),
        totalTargetValue: tracking.totalTargetValue,
        totalCompletedValue: tracking.totalCompletedValue,
        totalRemainingValue: tracking.totalRemainingValue,
        overallAveragePerDay: tracking.overallAveragePerDay,
        overallProjectedRemainingDays: tracking.overallProjectedRemainingDays,
        entryCount: tracking.entryCount,
        trackedDayCount: tracking.trackedDayCount,
        firstEntryDate: tracking.firstEntryDate?.toISOString() ?? null,
        lastEntryDate: tracking.lastEntryDate?.toISOString() ?? null,
        paceDenominator: tracking.paceDenominator,
        awaitingAttendanceForPace: tracking.awaitingAttendanceForPace,
        attendance: {
          workedDayCount: tracking.attendance.workedDayCount,
          totalWorkedMinutes: tracking.attendance.totalWorkedMinutes,
          totalWorkedHours: tracking.attendance.totalWorkedHours,
          uniqueWorkerCount: tracking.attendance.uniqueWorkerCount,
          averageWorkersPerDay: tracking.attendance.averageWorkersPerDay,
          lastAttendanceDate: tracking.attendance.lastAttendanceDate?.toISOString() ?? null,
        },
      },
    },
    warnings,
  };
}
