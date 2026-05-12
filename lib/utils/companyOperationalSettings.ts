export type InventoryValuationMethod = 'FIFO';

export interface CompanyOperationalSettings {
  currencyCode: string;
  inventoryValuationMethod: InventoryValuationMethod;
}

export const DEFAULT_COMPANY_OPERATIONAL_SETTINGS: CompanyOperationalSettings = {
  currencyCode: 'AED',
  inventoryValuationMethod: 'FIFO',
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
  };
}
