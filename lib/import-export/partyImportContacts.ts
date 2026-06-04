import type { PartyListContactInput } from '@/lib/partyListRecordPayload';

/** Ensure primary contact columns become structured contacts (CustomerContact rows). */
export function mergePartyContactsForImport(row: {
  contactPerson?: string;
  phone?: string;
  email?: string;
  contacts?: PartyListContactInput[];
}): PartyListContactInput[] {
  const fromColumns = row.contacts ?? [];
  if (fromColumns.length > 0) return fromColumns;

  const contactName = row.contactPerson?.trim() ?? '';
  const phone = row.phone?.trim() ?? '';
  const email = row.email?.trim() ?? '';
  if (!contactName && !phone && !email) return [];

  return [
    {
      contact_name: contactName,
      email: email || '',
      phone: phone || null,
      sort_order: 0,
    },
  ];
}
