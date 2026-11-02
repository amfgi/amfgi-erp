export type InventoryValuationMethod = 'FIFO';

export interface CompanyOperationalSettings {
  currencyCode: string;
  inventoryValuationMethod: InventoryValuationMethod;
  /** When true, a new material delivery note is also listed as a dispatch. Stock still moves once. */
  deliveryNoteCreatesDispatch: boolean;
}

export const DEFAULT_COMPANY_OPERATIONAL_SETTINGS: CompanyOperationalSettings = {
  currencyCode: 'AED',
  inventoryValuationMethod: 'FIFO',
  deliveryNoteCreatesDispatch: false,
};

export function readCompanyOperationalSettings(value: unknown): CompanyOperationalSettings {
  const settings =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  const currencyCodeRaw =
    typeof settings.currencyCode === 'string' && settings.currencyCode.trim().length === 3
      ? settings.currencyCode.trim().toUpperCase()
      : DEFAULT_COMPANY_OPERATIONAL_SETTINGS.currencyCode;

  return {
    currencyCode: currencyCodeRaw,
    inventoryValuationMethod: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.inventoryValuationMethod,
    deliveryNoteCreatesDispatch: settings.deliveryNoteCreatesDispatch === true,
  };
}

/** True when this stock-out row is the single movement shared by a delivery note and its dispatch. */
export function stockOutCountsAsDispatch(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).countsAsDispatch === true;
}

export function isDeliveryNoteStockMovement(txn: {
  isDeliveryNote?: boolean | null;
  deliveryNoteId?: string | null;
}): boolean {
  return txn.isDeliveryNote === true || Boolean(txn.deliveryNoteId);
}

/**
 * Only a new material delivery note can create a dispatch, and only when the company switch is on.
 * A plain dispatch never creates a delivery note. Edits keep an existing link and do not start another.
 */
export function shouldLinkNewDeliveryNoteAsDispatch(input: {
  alreadyLinked: boolean;
  type: string;
  isDeliveryNote: boolean;
  deliveryType: string;
  isExistingDeliveryNote: boolean;
  lineCount: number;
  companySetting: boolean;
}): boolean {
  if (input.type !== 'STOCK_OUT') return false;
  if (!input.isDeliveryNote) return false;
  if (input.alreadyLinked) return true;
  if (input.deliveryType !== 'DISPATCH') return false;
  if (input.isExistingDeliveryNote) return false;
  if (input.lineCount <= 0) return false;
  return input.companySetting;
}

export function matchesDispatchHistoryNoteType(
  noteType: string,
  entry: {
    isDeliveryNote?: boolean;
    countsAsDispatch?: boolean;
    deliveryType?: string | null;
    transitStatus?: string | null;
  },
): boolean {
  if (noteType === 'delivery' && !entry.isDeliveryNote) return false;
  if (noteType === 'dispatch' && entry.isDeliveryNote && !entry.countsAsDispatch) return false;
  if (noteType === 'transit') {
    if (!entry.isDeliveryNote || entry.deliveryType !== 'SUBCONTRACT') return false;
    if (entry.transitStatus !== 'ON_TRANSIT' && entry.transitStatus !== 'PARTIALLY_RECEIVED') return false;
  }
  return true;
}
