import type { Prisma } from '@prisma/client';

export const STOCK_BATCH_RECEIPT_LINE_META_KEY = 'receiptLine';

export interface ReceiptLineDisplayMetadata {
  quantityUomId: string | null;
  displayQuantity: number | null;
  displayUnitCost: number | null;
}

export interface StockBatchReceiptLineMetaInput {
  quantityUomId?: string | null;
  displayQuantity: number;
  displayUnitCost?: number | null;
}

const EMPTY_METADATA: ReceiptLineDisplayMetadata = {
  quantityUomId: null,
  displayQuantity: null,
  displayUnitCost: null,
};

export function parseReceiptLineMetadata(meta: unknown): ReceiptLineDisplayMetadata {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return EMPTY_METADATA;
  }

  const receiptLine = (meta as Record<string, unknown>)[STOCK_BATCH_RECEIPT_LINE_META_KEY];
  if (!receiptLine || typeof receiptLine !== 'object' || Array.isArray(receiptLine)) {
    return EMPTY_METADATA;
  }

  const row = receiptLine as Record<string, unknown>;
  const quantityUomId =
    typeof row.quantityUomId === 'string' && row.quantityUomId.trim()
      ? row.quantityUomId.trim()
      : null;
  const displayQuantity =
    typeof row.displayQuantity === 'number' && Number.isFinite(row.displayQuantity)
      ? row.displayQuantity
      : null;
  const displayUnitCost =
    typeof row.displayUnitCost === 'number' && Number.isFinite(row.displayUnitCost)
      ? row.displayUnitCost
      : null;

  return { quantityUomId, displayQuantity, displayUnitCost };
}

export function buildStockBatchReceiptLineMeta(
  input: StockBatchReceiptLineMetaInput
): Prisma.InputJsonValue | undefined {
  const quantityUomId = input.quantityUomId?.trim() || undefined;
  const hasQty = Number.isFinite(input.displayQuantity);
  const hasCost =
    input.displayUnitCost != null && Number.isFinite(input.displayUnitCost);

  if (!quantityUomId && !hasQty && !hasCost) return undefined;

  const receiptLine: Record<string, string | number> = {};
  if (quantityUomId) receiptLine.quantityUomId = quantityUomId;
  if (hasQty) receiptLine.displayQuantity = input.displayQuantity;
  if (hasCost) receiptLine.displayUnitCost = input.displayUnitCost as number;

  return { [STOCK_BATCH_RECEIPT_LINE_META_KEY]: receiptLine };
}
