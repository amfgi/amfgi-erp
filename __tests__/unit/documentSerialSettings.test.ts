import { nextSerialFromHighest, normalizeDocumentSerialSettings } from '@/lib/sales/documentSerialSettings';

const defaultPrefixes = { query: 'QR', quotation: 'Q', purchaseOrder: 'PO', job: 'J' };

describe('document serial settings', () => {
  it('keeps a blank setting at 1 with the default tags', () => {
    expect(normalizeDocumentSerialSettings(null)).toEqual({
      query: 1,
      quotation: 1,
      purchaseOrder: 1,
      job: 1,
      prefixes: defaultPrefixes,
    });
  });

  it('keeps a saved serial when the older number-only shape is stored', () => {
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
      prefixes: defaultPrefixes,
    });
  });

  it('stores a custom starting tag in uppercase', () => {
    expect(normalizeDocumentSerialSettings({
      query: 1,
      quotation: 1,
      purchaseOrder: 1,
      job: 8,
      prefixes: { query: 'qry', quotation: 'Q', purchaseOrder: 'po', job: 'job' },
    }).prefixes).toEqual({
      query: 'QRY',
      quotation: 'Q',
      purchaseOrder: 'PO',
      job: 'JOB',
    });
  });

  it('starts at the entered serial, or after a higher number already issued', () => {
    expect(nextSerialFromHighest(0, 1234)).toBe(1234);
    expect(nextSerialFromHighest(2228, 1234)).toBe(2229);
    expect(nextSerialFromHighest(2228, 5000)).toBe(5000);
  });
});
