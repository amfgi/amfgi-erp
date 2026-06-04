import type { FormulaConfig, JobItemSpecifications } from '@/lib/job-costing/types';
import { getManualBudgetMaterialIds, isManualBudgetSpecifications } from '@/lib/job-costing/manualBudget';

function getSelectedMaterialIdsFromSpecifications(specifications: JobItemSpecifications) {
  return Object.values(specifications.global ?? {}).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

export function getBudgetMaterialIdsFromJobItem(item: {
  formulaLibrary?: { formulaConfig: unknown } | null;
  specifications: unknown;
}) {
  if (isManualBudgetSpecifications(item.specifications)) {
    return getManualBudgetMaterialIds(item.specifications);
  }
  const config = item.formulaLibrary?.formulaConfig as FormulaConfig | undefined;
  const staticMaterialIds = Array.isArray(config?.areas)
    ? config.areas.flatMap((area) =>
        area.materials.flatMap((material) => (material.materialId ? [material.materialId] : []))
      )
    : [];
  const selectedMaterialIds = getSelectedMaterialIdsFromSpecifications(
    item.specifications as JobItemSpecifications
  );
  return [...staticMaterialIds, ...selectedMaterialIds];
}
