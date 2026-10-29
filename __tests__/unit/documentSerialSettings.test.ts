import { nextSerialFromHighest, normalizeDocumentSerialSettings } from '@/lib/sales/documentSerialSettings';

describe('document serial settings', () => {
  it('keeps a blank setting at 1', () => {
    expect(normalizeDocumentSerialSettings(null)).toEqual({
      query: 1,
      quotation: 1,
      purchaseOrder: 1,
      job: 1,
    });
  });

  it('stores only the serial the user entered', () => {
    expect(normalizeDocumentSerialSettings({
      query: 1234,
      quotation: '20',
      purchaseOrder: 1,
      job: 5000,
    })).toEqual({
      query: 1234,
      quotation: 20,
      purchaseOrder: 1,
      job: 5000,
    });
  });

  it('starts at the entered serial, or after a higher number already issued', () => {
    expect(nextSerialFromHighest(0, 1234)).toBe(1234);
    expect(nextSerialFromHighest(2228, 1234)).toBe(2229);
    expect(nextSerialFromHighest(2228, 5000)).toBe(5000);
  });
});
