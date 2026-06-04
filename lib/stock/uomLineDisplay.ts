import type { Material } from '@/store/hooks';

/** factorToBase for the selected purchase UOM (1 when base / empty id). */
export function getMaterialUomFactor(material: Material | undefined, quantityUomId: string): number {
  if (!material || !quantityUomId.trim()) return 1;
  const row = material.materialUoms?.find((uom) => uom.id === quantityUomId);
  return row?.factorToBase && row.factorToBase > 0 ? row.factorToBase : 1;
}

export function unitCostFromBase(baseUnitCost: number, factorToBase: number) {
  return baseUnitCost * factorToBase;
}

export function unitCostToBase(displayUnitCost: number, factorToBase: number) {
  if (factorToBase <= 0) return displayUnitCost;
  return displayUnitCost / factorToBase;
}

function formatConvertedNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

/** Display unit cost for a line's UOM from material master cost (stored per base UOM). */
export function defaultDisplayUnitCost(material: Material, quantityUomId: string) {
  const base = material.unitCost ?? 0;
  if (base <= 0) return '';
  return formatConvertedNumber(unitCostFromBase(base, getMaterialUomFactor(material, quantityUomId)));
}

/** Keep cost per base UOM when switching purchase UOM on a receipt line. */
export function convertLineUnitCost(
  displayUnitCost: string,
  material: Material | undefined,
  fromUomId: string,
  toUomId: string
): string {
  if (!material) return displayUnitCost;
  const fromFactor = getMaterialUomFactor(material, fromUomId);
  const toFactor = getMaterialUomFactor(material, toUomId);
  if (fromFactor === toFactor) return displayUnitCost;

  const parsed = parseFloat(displayUnitCost);
  const baseCost =
    parsed > 0 ? unitCostToBase(parsed, fromFactor) : (material.unitCost ?? 0);
  if (baseCost <= 0) return displayUnitCost;

  return formatConvertedNumber(unitCostFromBase(baseCost, toFactor));
}

/** Keep physical quantity when switching purchase UOM. */
export function convertLineQuantity(
  quantity: string,
  material: Material | undefined,
  fromUomId: string,
  toUomId: string
): string {
  if (!material) return quantity;
  const fromFactor = getMaterialUomFactor(material, fromUomId);
  const toFactor = getMaterialUomFactor(material, toUomId);
  if (fromFactor === toFactor) return quantity;

  const parsed = parseFloat(quantity);
  if (!parsed || parsed <= 0) return quantity;

  const quantityInBase = parsed * fromFactor;
  return formatConvertedNumber(quantityInBase / toFactor);
}
