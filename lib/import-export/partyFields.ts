import type { PartyListContactInput } from '@/lib/partyListRecordPayload';
import { parsePartyListDateInput } from '@/lib/partyListsApi';
import { cellToString, parseOptionalBoolean } from '@/lib/import-export/xlsx';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';

export const PARTY_CONTACT_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'contact1_name', label: 'Contact 1 Name', aliases: ['contact 1 name', 'primary contact'] },
  { key: 'contact1_email', label: 'Contact 1 Email', aliases: ['contact 1 email'] },
  { key: 'contact1_phone', label: 'Contact 1 Phone', aliases: ['contact 1 phone', 'primary phone'] },
  { key: 'contact2_name', label: 'Contact 2 Name', aliases: ['contact 2 name'] },
  { key: 'contact2_email', label: 'Contact 2 Email', aliases: ['contact 2 email'] },
  { key: 'contact2_phone', label: 'Contact 2 Phone', aliases: ['contact 2 phone'] },
  { key: 'contact3_name', label: 'Contact 3 Name', aliases: ['contact 3 name'] },
  { key: 'contact3_email', label: 'Contact 3 Email', aliases: ['contact 3 email'] },
  { key: 'contact3_phone', label: 'Contact 3 Phone', aliases: ['contact 3 phone'] },
];

export const PARTY_LICENSE_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'trade_license_number', label: 'Trade License Number', aliases: ['trade license no'] },
  { key: 'trade_license_authority', label: 'Trade License Authority' },
  { key: 'trade_license_expiry', label: 'Trade License Expiry', aliases: ['trade license expiry date'] },
  { key: 'trn_number', label: 'TRN Number', aliases: ['trn', 'tax registration number'] },
  { key: 'trn_expiry', label: 'TRN Expiry', aliases: ['trn expiry date'] },
];

export function contactsFromImportRow(row: MappedImportRow): PartyListContactInput[] {
  const contacts: PartyListContactInput[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const name = cellToString(row[`contact${i}_name`] as string | undefined);
    const email = cellToString(row[`contact${i}_email`] as string | undefined);
    const phone = cellToString(row[`contact${i}_phone`] as string | undefined);
    if (!name && !email && !phone) continue;
    contacts.push({
      contact_name: name,
      email: email || '',
      phone: phone || null,
      sort_order: i - 1,
    });
  }
  return contacts;
}

export function parsePartyMappedFields(
  row: MappedImportRow,
  parsed: MappedImportRow & Record<string, unknown>,
  fields: ImportFieldDef[]
) {
  for (const field of fields) {
    const raw = row[field.key];
    if (raw === undefined || raw === '') continue;

    if (field.key === 'is_active' || field.key === 'isActive') {
      const bool = parseOptionalBoolean(raw as string | number | boolean);
      if (bool === undefined) {
        parsed.__errors.push(`Invalid value for ${field.label}`);
      } else {
        parsed.isActive = bool;
      }
      continue;
    }

    if (field.key.endsWith('_expiry') || field.key.endsWith('Expiry')) {
      const date = parsePartyListDateInput(String(raw));
      if (String(raw).trim() && !date) {
        parsed.__errors.push(`Invalid date for ${field.label}`);
      } else {
        parsed[field.key] = String(raw).trim() || undefined;
      }
      continue;
    }

    if (field.key === 'email') {
      const email = cellToString(raw as string);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        parsed.__errors.push(`Invalid email`);
      } else {
        parsed.email = email;
      }
      continue;
    }

    parsed[field.key] = cellToString(raw as string);
  }
}

export function formatPartyDateExport(value: string | Date | null | undefined): string {
  if (!value) return '';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}
