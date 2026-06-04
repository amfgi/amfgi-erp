import type { Supplier } from '@/store/api/endpoints/suppliers';
import {
  PARTY_CONTACT_IMPORT_FIELDS,
  PARTY_LICENSE_IMPORT_FIELDS,
  contactsFromImportRow,
  formatPartyDateExport,
  parsePartyMappedFields,
} from '@/lib/import-export/partyFields';
import { mergePartyContactsForImport } from '@/lib/import-export/partyImportContacts';
import { cellToString, parseOptionalBoolean } from '@/lib/import-export/xlsx';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';
import type { PartyListContactInput } from '@/lib/partyListRecordPayload';

export const SUPPLIER_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'ID', aliases: ['supplier id'] },
  { key: 'name', label: 'Name', required: true, aliases: ['supplier name'] },
  { key: 'contact_person', label: 'Contact Person', aliases: ['contact person', 'primary contact name'] },
  { key: 'phone', label: 'Phone', aliases: ['primary phone'] },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'is_active', label: 'Is Active', aliases: ['active', 'status'] },
  ...PARTY_LICENSE_IMPORT_FIELDS,
  ...PARTY_CONTACT_IMPORT_FIELDS,
  { key: '__skip__', label: 'Skip Column' },
];

export type SupplierImportRow = {
  id?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  isActive?: boolean;
  trade_license_number?: string | null;
  trade_license_authority?: string | null;
  trade_license_expiry?: string | null;
  trn_number?: string | null;
  trn_expiry?: string | null;
  contacts?: PartyListContactInput[];
};

function contactExportColumns(contactsJson: unknown) {
  const rows: Array<{ contact_name?: string; email?: string | null; phone?: string | null }> = [];
  if (Array.isArray(contactsJson)) {
    for (const item of contactsJson) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        rows.push({
          contact_name: row.contact_name != null ? String(row.contact_name) : '',
          email: row.email != null ? String(row.email) : '',
          phone: row.phone != null ? String(row.phone) : '',
        });
      }
    }
  }
  while (rows.length < 3) rows.push({});
  return {
    'Contact 1 Name': rows[0]?.contact_name ?? '',
    'Contact 1 Email': rows[0]?.email ?? '',
    'Contact 1 Phone': rows[0]?.phone ?? '',
    'Contact 2 Name': rows[1]?.contact_name ?? '',
    'Contact 2 Email': rows[1]?.email ?? '',
    'Contact 2 Phone': rows[1]?.phone ?? '',
    'Contact 3 Name': rows[2]?.contact_name ?? '',
    'Contact 3 Email': rows[2]?.email ?? '',
    'Contact 3 Phone': rows[2]?.phone ?? '',
  };
}

export function supplierToExportRow(supplier: Supplier): Record<string, string | number | boolean> {
  return {
    ID: supplier.id,
    Name: supplier.name,
    'Contact Person': supplier.contactPerson ?? '',
    Phone: supplier.phone ?? '',
    Email: supplier.email ?? '',
    Address: supplier.address ?? '',
    City: supplier.city ?? '',
    Country: supplier.country ?? '',
    'Is Active': supplier.isActive ? 'TRUE' : 'FALSE',
    'Trade License Number': supplier.tradeLicenseNumber ?? '',
    'Trade License Authority': supplier.tradeLicenseAuthority ?? '',
    'Trade License Expiry': formatPartyDateExport(supplier.tradeLicenseExpiry),
    'TRN Number': supplier.trnNumber ?? '',
    'TRN Expiry': formatPartyDateExport(supplier.trnExpiry),
    Source: supplier.source ?? 'LOCAL',
    'External Party ID': supplier.externalPartyId ?? '',
    ...contactExportColumns(supplier.contactsJson),
  };
}

export function mapSupplierImportRow(
  row: (string | number | boolean | null)[],
  headers: string[],
  mapping: Record<number, string>,
  rowIndex: number
): MappedImportRow {
  const parsed: MappedImportRow & Record<string, unknown> = { __rowIndex: rowIndex, __errors: [] };

  headers.forEach((_, colIndex) => {
    const fieldKey = mapping[colIndex];
    if (!fieldKey || fieldKey === '__skip__') return;
    const value = row[colIndex];
    if (value === null || value === undefined || value === '') return;
    parsed[fieldKey] = cellToString(value);
  });

  const name = cellToString(parsed.name as string | undefined);
  if (!name) parsed.__errors.push('Missing required field: Name');

  parsePartyMappedFields(parsed, parsed, SUPPLIER_IMPORT_FIELDS.filter((f) => f.key !== 'name' && f.key !== 'id'));

  if (parsed.is_active === undefined && parsed.isActive === undefined) {
    parsed.isActive = true;
  } else if (parsed.is_active !== undefined) {
    parsed.isActive = parsed.is_active;
  }

  const primaryPhone = cellToString(parsed.phone as string | undefined);
  if (primaryPhone.length > 50) {
    parsed.__errors.push(`Primary Phone: maximum 50 characters (your value has ${primaryPhone.length})`);
  }

  for (let i = 1; i <= 3; i += 1) {
    const contactPhone = cellToString(parsed[`contact${i}_phone`] as string | undefined);
    if (contactPhone.length > 50) {
      parsed.__errors.push(
        `Contact ${i} Phone: maximum 50 characters (your value has ${contactPhone.length})`
      );
    }
  }

  return parsed;
}

export function supplierImportRowToPayload(row: MappedImportRow): SupplierImportRow {
  const draft = {
    contactPerson: cellToString(row.contact_person as string | undefined) || undefined,
    phone: cellToString(row.phone as string | undefined) || undefined,
    email: cellToString(row.email as string | undefined) || undefined,
    contacts: contactsFromImportRow(row),
  };
  const contacts = mergePartyContactsForImport(draft);
  return {
    id: cellToString(row.id as string | undefined) || undefined,
    name: cellToString(row.name as string),
    contactPerson: draft.contactPerson,
    phone: draft.phone,
    email: draft.email,
    address: cellToString(row.address as string | undefined) || undefined,
    city: cellToString(row.city as string | undefined) || undefined,
    country: cellToString(row.country as string | undefined) || undefined,
    isActive:
      row.isActive !== undefined
        ? Boolean(row.isActive)
        : parseOptionalBoolean(row.is_active as string | number | boolean | undefined) ?? true,
    trade_license_number: cellToString(row.trade_license_number as string | undefined) || null,
    trade_license_authority: cellToString(row.trade_license_authority as string | undefined) || null,
    trade_license_expiry: cellToString(row.trade_license_expiry as string | undefined) || null,
    trn_number: cellToString(row.trn_number as string | undefined) || null,
    trn_expiry: cellToString(row.trn_expiry as string | undefined) || null,
    contacts: contacts.length > 0 ? contacts : undefined,
  };
}

import { downloadWorkbook } from '@/lib/import-export/xlsx';

export function downloadSupplierImportTemplate() {
  const instructions = [
    ['Field', 'Required', 'Instructions'],
    ['ID', 'No', 'Leave blank for new suppliers. Use existing ID to update.'],
    ['Name', 'Yes', 'Unique per company (case-insensitive).'],
    ['Is Active', 'No', 'TRUE/FALSE, YES/NO, or Active/Inactive. Defaults to TRUE.'],
    ['Contact 1–3', 'No', 'Optional additional contacts beyond primary fields.'],
    ['Synced suppliers', '—', 'Rows matched to party-API synced suppliers are skipped on update.'],
  ];
  const template = [
    {
      ID: '',
      Name: 'Sample Supplier LLC',
      'Contact Person': 'Ahmed Ali',
      Phone: '+971500000000',
      Email: 'ahmed@example.com',
      Address: 'Industrial Area 1',
      City: 'Sharjah',
      Country: 'UAE',
      'Is Active': 'TRUE',
      'Trade License Number': '',
      'Trade License Authority': '',
      'Trade License Expiry': '',
      'TRN Number': '',
      'TRN Expiry': '',
      'Contact 1 Name': 'Ahmed Ali',
      'Contact 1 Email': 'ahmed@example.com',
      'Contact 1 Phone': '+971500000000',
      'Contact 2 Name': '',
      'Contact 2 Email': '',
      'Contact 2 Phone': '',
      'Contact 3 Name': '',
      'Contact 3 Email': '',
      'Contact 3 Phone': '',
    },
  ];
  downloadWorkbook('suppliers-import-template.xlsx', [
    { name: 'Instructions', rows: instructions },
    { name: 'Template', rows: template },
  ]);
}
