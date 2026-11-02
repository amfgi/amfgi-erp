import {
  isDeliveryNoteStockMovement,
  matchesDispatchHistoryNoteType,
  readCompanyOperationalSettings,
  shouldLinkNewDeliveryNoteAsDispatch,
  stockOutCountsAsDispatch,
} from '@/lib/utils/companyOperationalSettings';

describe('deliveryNoteCreatesDispatch', () => {
  it('reads a missing flag as off', () => {
    expect(readCompanyOperationalSettings({ currencyCode: 'AED' }).deliveryNoteCreatesDispatch).toBe(false);
    expect(readCompanyOperationalSettings(null).deliveryNoteCreatesDispatch).toBe(false);
  });

  it('reads an explicit true flag', () => {
    expect(
      readCompanyOperationalSettings({ deliveryNoteCreatesDispatch: true }).deliveryNoteCreatesDispatch
    ).toBe(true);
  });

  it('treats only countsAsDispatch stock-outs as a shared dispatch', () => {
    expect(stockOutCountsAsDispatch({ countsAsDispatch: true })).toBe(true);
    expect(stockOutCountsAsDispatch({ countsAsDispatch: false })).toBe(false);
    expect(stockOutCountsAsDispatch(null)).toBe(false);
    expect(stockOutCountsAsDispatch([])).toBe(false);
  });
});

describe('shouldLinkNewDeliveryNoteAsDispatch', () => {
  const base = {
    alreadyLinked: false,
    type: 'STOCK_OUT',
    isDeliveryNote: true,
    deliveryType: 'DISPATCH',
    isExistingDeliveryNote: false,
    lineCount: 1,
    companySetting: true,
  };

  it('links a new material delivery note once when the switch is on', () => {
    expect(shouldLinkNewDeliveryNoteAsDispatch(base)).toBe(true);
  });

  it('does not link when the switch is off, the note is an edit, or there are no material lines', () => {
    expect(shouldLinkNewDeliveryNoteAsDispatch({ ...base, companySetting: false })).toBe(false);
    expect(shouldLinkNewDeliveryNoteAsDispatch({ ...base, isExistingDeliveryNote: true })).toBe(false);
    expect(shouldLinkNewDeliveryNoteAsDispatch({ ...base, lineCount: 0 })).toBe(false);
    expect(shouldLinkNewDeliveryNoteAsDispatch({ ...base, deliveryType: 'SUBCONTRACT' })).toBe(false);
    expect(shouldLinkNewDeliveryNoteAsDispatch({ ...base, isDeliveryNote: false })).toBe(false);
    expect(
      shouldLinkNewDeliveryNoteAsDispatch({
        ...base,
        isDeliveryNote: false,
        alreadyLinked: true,
        companySetting: true,
      }),
    ).toBe(false);
  });

  it('keeps an existing link when the note is edited', () => {
    expect(
      shouldLinkNewDeliveryNoteAsDispatch({
        ...base,
        alreadyLinked: true,
        isExistingDeliveryNote: true,
        companySetting: false,
      }),
    ).toBe(true);
  });
});

describe('dispatch history tabs', () => {
  const linkedNote = { isDeliveryNote: true, countsAsDispatch: true, deliveryType: 'DISPATCH' };
  const plainNote = { isDeliveryNote: true, countsAsDispatch: false, deliveryType: 'DISPATCH' };
  const plainDispatch = { isDeliveryNote: false, countsAsDispatch: false, deliveryType: 'DISPATCH' };

  it('shows a linked note on both tabs and a plain note only on delivery notes', () => {
    expect(matchesDispatchHistoryNoteType('all', linkedNote)).toBe(true);
    expect(matchesDispatchHistoryNoteType('dispatch', linkedNote)).toBe(true);
    expect(matchesDispatchHistoryNoteType('delivery', linkedNote)).toBe(true);

    expect(matchesDispatchHistoryNoteType('dispatch', plainNote)).toBe(false);
    expect(matchesDispatchHistoryNoteType('delivery', plainNote)).toBe(true);
    expect(matchesDispatchHistoryNoteType('delivery', plainDispatch)).toBe(false);
    expect(matchesDispatchHistoryNoteType('dispatch', plainDispatch)).toBe(true);
  });
});

describe('isDeliveryNoteStockMovement', () => {
  it('protects delivery-note stock rows from a worksheet rewrite', () => {
    expect(isDeliveryNoteStockMovement({ isDeliveryNote: true, deliveryNoteId: 'dn1' })).toBe(true);
    expect(isDeliveryNoteStockMovement({ isDeliveryNote: false, deliveryNoteId: 'dn1' })).toBe(true);
    expect(isDeliveryNoteStockMovement({ isDeliveryNote: false, deliveryNoteId: null })).toBe(false);
  });
});
