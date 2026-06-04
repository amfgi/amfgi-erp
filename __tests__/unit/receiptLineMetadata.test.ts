import {
  buildStockBatchReceiptLineMeta,
  parseReceiptLineMetadata,
} from '@/lib/utils/receiptLineMetadata';

describe('receiptLineMetadata', () => {
  it('round-trips alternate UOM line metadata in StockBatch.meta', () => {
    const meta = buildStockBatchReceiptLineMeta({
      quantityUomId: 'uom-drum',
      displayQuantity: 2,
      displayUnitCost: 150,
    });

    expect(meta).toEqual({
      receiptLine: {
        quantityUomId: 'uom-drum',
        displayQuantity: 2,
        displayUnitCost: 150,
      },
    });

    const parsed = parseReceiptLineMetadata(meta);
    expect(parsed.quantityUomId).toBe('uom-drum');
    expect(parsed.displayQuantity).toBe(2);
    expect(parsed.displayUnitCost).toBe(150);
  });

  it('stores display quantity without UOM for base unit receipts', () => {
    const meta = buildStockBatchReceiptLineMeta({
      displayQuantity: 12.5,
      displayUnitCost: 3.2,
    });

    const parsed = parseReceiptLineMetadata(meta);
    expect(parsed.quantityUomId).toBeNull();
    expect(parsed.displayQuantity).toBe(12.5);
    expect(parsed.displayUnitCost).toBe(3.2);
  });

  it('returns empty metadata when meta is missing', () => {
    expect(parseReceiptLineMetadata(null)).toEqual({
      quantityUomId: null,
      displayQuantity: null,
      displayUnitCost: null,
    });
  });
});
