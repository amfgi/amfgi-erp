import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { formatPartyDateExport } from '@/lib/import-export/partyFields';
import { cellToString, parseOptionalNumber } from '@/lib/import-export/xlsx';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';
import { parsePartyListDateInput } from '@/lib/partyListsApi';
import type { Job } from '@/store/api/endpoints/jobs';

export const PARENT_JOB_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'ID', aliases: ['job id'] },
  { key: 'job_number', label: 'Job Number', required: true, aliases: ['job no', 'job #'] },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name', aliases: ['customer'] },
  { key: 'status', label: 'Status', aliases: ['job status'] },
  { key: 'description', label: 'Description' },
  { key: 'site', label: 'Site' },
  { key: 'address', label: 'Address' },
  { key: 'start_date', label: 'Start Date', aliases: ['start'] },
  { key: 'end_date', label: 'End Date', aliases: ['end'] },
  { key: 'quotation_number', label: 'Quotation Number', aliases: ['quote number'] },
  { key: 'quotation_date', label: 'Quotation Date', aliases: ['quote date'] },
  { key: 'lpo_number', label: 'LPO Number' },
  { key: 'lpo_date', label: 'LPO Date' },
  { key: 'lpo_value', label: 'LPO Value' },
  { key: 'project_name', label: 'Project Name' },
  { key: 'project_details', label: 'Project Details' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'sales_person', label: 'Sales Person' },
  { key: 'job_work_value', label: 'Job Work Value' },
  { key: 'required_expertises', label: 'Required Expertises', aliases: ['expertise', 'expertises'] },
  { key: 'contact1_name', label: 'Contact 1 Name' },
  { key: 'contact1_email', label: 'Contact 1 Email' },
  { key: 'contact1_number', label: 'Contact 1 Phone', aliases: ['contact 1 phone'] },
  { key: 'contact2_name', label: 'Contact 2 Name' },
  { key: 'contact2_email', label: 'Contact 2 Email' },
  { key: 'contact2_number', label: 'Contact 2 Phone' },
  { key: 'contact3_name', label: 'Contact 3 Name' },
  { key: 'contact3_email', label: 'Contact 3 Email' },
  { key: 'contact3_number', label: 'Contact 3 Phone' },
  { key: '__skip__', label: 'Skip Column' },
];

const JOB_STATUSES = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'] as const;
export type JobStatusImport = (typeof JOB_STATUSES)[number];

export type ParentJobImportRow = {
  id?: string;
  jobNumber: string;
  customerId?: string;
  customerName?: string;
  status?: JobStatusImport;
  description?: string;
  site?: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  quotationNumber?: string;
  quotationDate?: string;
  lpoNumber?: string;
  lpoDate?: string;
  lpoValue?: number;
  projectName?: string;
  projectDetails?: string;
  contactPerson?: string;
  salesPerson?: string;
  jobWorkValue?: number;
  requiredExpertises?: string[];
  contactsJson?: Array<Record<string, string>>;
};

function parseJobStatus(value: string): JobStatusImport | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'ONHOLD') return 'ON_HOLD';
  return JOB_STATUSES.find((s) => s === normalized);
}

function parseDateField(value: string, label: string, errors: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = parsePartyListDateInput(trimmed);
  if (!date) errors.push(`Invalid date for ${label}`);
  return trimmed;
}

function jobContactsFromRow(row: MappedImportRow): Array<Record<string, string>> {
  const contacts: Array<Record<string, string>> = [];
  for (let i = 1; i <= 3; i += 1) {
    const name = cellToString(row[`contact${i}_name`] as string | undefined);
    const email = cellToString(row[`contact${i}_email`] as string | undefined);
    const number = cellToString(row[`contact${i}_number`] as string | undefined);
    if (!name && !email && !number) continue;
    const o: Record<string, string> = {};
    if (name) o.name = name;
    if (email) o.email = email;
    if (number) o.number = number;
    contacts.push(o);
  }
  return contacts;
}

function jobContactExportColumns(contactsJson: unknown) {
  const rows: Array<{ name?: string; email?: string; number?: string }> = [];
  if (Array.isArray(contactsJson)) {
    for (const item of contactsJson) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        rows.push({
          name: row.name != null ? String(row.name) : '',
          email: row.email != null ? String(row.email) : '',
          number: row.number != null ? String(row.number) : '',
        });
      }
    }
  }
  while (rows.length < 3) rows.push({});
  return {
    'Contact 1 Name': rows[0]?.name ?? '',
    'Contact 1 Email': rows[0]?.email ?? '',
    'Contact 1 Phone': rows[0]?.number ?? '',
    'Contact 2 Name': rows[1]?.name ?? '',
    'Contact 2 Email': rows[1]?.email ?? '',
    'Contact 2 Phone': rows[1]?.number ?? '',
    'Contact 3 Name': rows[2]?.name ?? '',
    'Contact 3 Email': rows[2]?.email ?? '',
    'Contact 3 Phone': rows[2]?.number ?? '',
  };
}

export function parentJobToExportRow(job: Job): Record<string, string | number> {
  const expertises = (job.requiredExpertises ?? []).join('; ');
  return {
    ID: job.id,
    'Job Number': job.jobNumber,
    'Customer Name': job.customerName ?? '',
    'Customer ID': job.customerId,
    Status: job.status,
    Description: job.description ?? '',
    Site: job.site ?? '',
    Address: job.address ?? '',
    'Start Date': formatPartyDateExport(job.startDate),
    'End Date': formatPartyDateExport(job.endDate),
    'Quotation Number': job.quotationNumber ?? '',
    'Quotation Date': formatPartyDateExport(job.quotationDate),
    'LPO Number': job.lpoNumber ?? '',
    'LPO Date': formatPartyDateExport(job.lpoDate),
    'LPO Value': job.lpoValue ?? '',
    'Project Name': job.projectName ?? '',
    'Project Details': job.projectDetails ?? '',
    'Contact Person': job.contactPerson ?? '',
    'Sales Person': job.salesPerson ?? '',
    'Job Work Value': job.jobWorkValue ?? '',
    'Required Expertises': expertises,
    Source: job.source ?? 'LOCAL',
    'External Job ID': job.externalJobId ?? '',
    ...jobContactExportColumns(job.contactsJson),
  };
}

export function mapParentJobImportRow(
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

  const jobNumber = cellToString(parsed.job_number as string | undefined);
  if (!jobNumber) parsed.__errors.push('Missing required field: Job Number');

  const customerId = cellToString(parsed.customer_id as string | undefined);
  const customerName = cellToString(parsed.customer_name as string | undefined);
  if (!customerId && !customerName) {
    parsed.__errors.push('Customer Name or Customer ID is required');
  }

  const statusRaw = cellToString(parsed.status as string | undefined);
  if (statusRaw) {
    const status = parseJobStatus(statusRaw);
    if (!status) parsed.__errors.push(`Invalid status: ${statusRaw}`);
    else parsed.status = status;
  } else {
    parsed.status = 'ACTIVE';
  }

  for (const [key, label] of [
    ['start_date', 'Start Date'],
    ['end_date', 'End Date'],
    ['quotation_date', 'Quotation Date'],
    ['lpo_date', 'LPO Date'],
  ] as const) {
    const raw = cellToString(parsed[key] as string | undefined);
    if (raw) parseDateField(raw, label, parsed.__errors);
  }

  const lpoValue = parseOptionalNumber(parsed.lpo_value as string | number | undefined);
  if (parsed.lpo_value !== undefined && parsed.lpo_value !== '' && lpoValue === undefined) {
    parsed.__errors.push('Invalid number for LPO Value');
  } else if (lpoValue !== undefined) {
    parsed.lpo_value = lpoValue;
  }

  const jobWorkValue = parseOptionalNumber(parsed.job_work_value as string | number | undefined);
  if (parsed.job_work_value !== undefined && parsed.job_work_value !== '' && jobWorkValue === undefined) {
    parsed.__errors.push('Invalid number for Job Work Value');
  } else if (jobWorkValue !== undefined) {
    parsed.job_work_value = jobWorkValue;
  }

  return parsed;
}

export function parentJobImportRowToPayload(row: MappedImportRow): ParentJobImportRow {
  const expertisesRaw = cellToString(row.required_expertises as string | undefined);
  const expertises = expertisesRaw
    ? expertisesRaw
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const contacts = jobContactsFromRow(row);

  return {
    id: cellToString(row.id as string | undefined) || undefined,
    jobNumber: cellToString(row.job_number as string),
    customerId: cellToString(row.customer_id as string | undefined) || undefined,
    customerName: cellToString(row.customer_name as string | undefined) || undefined,
    status: (row.status as JobStatusImport) || 'ACTIVE',
    description: cellToString(row.description as string | undefined) || undefined,
    site: cellToString(row.site as string | undefined) || undefined,
    address: cellToString(row.address as string | undefined) || undefined,
    startDate: cellToString(row.start_date as string | undefined) || undefined,
    endDate: cellToString(row.end_date as string | undefined) || undefined,
    quotationNumber: cellToString(row.quotation_number as string | undefined) || undefined,
    quotationDate: cellToString(row.quotation_date as string | undefined) || undefined,
    lpoNumber: cellToString(row.lpo_number as string | undefined) || undefined,
    lpoDate: cellToString(row.lpo_date as string | undefined) || undefined,
    lpoValue: typeof row.lpo_value === 'number' ? row.lpo_value : undefined,
    projectName: cellToString(row.project_name as string | undefined) || undefined,
    projectDetails: cellToString(row.project_details as string | undefined) || undefined,
    contactPerson: cellToString(row.contact_person as string | undefined) || undefined,
    salesPerson: cellToString(row.sales_person as string | undefined) || undefined,
    jobWorkValue: typeof row.job_work_value === 'number' ? row.job_work_value : undefined,
    requiredExpertises: expertises,
    contactsJson: contacts.length > 0 ? contacts : undefined,
  };
}

export function downloadParentJobImportTemplate() {
  const instructions = [
    ['Field', 'Required', 'Instructions'],
    ['Job Number', 'Yes', 'Unique per company. Parent jobs only (no variations in this template).'],
    ['Customer Name / ID', 'Yes', 'Use Customer Name or Customer ID to link the job.'],
    ['Status', 'No', 'ACTIVE, COMPLETED, ON_HOLD, or CANCELLED. Defaults to ACTIVE.'],
    ['Required Expertises', 'No', 'Semicolon-separated list, e.g. Welding; Painting'],
    ['Synced jobs', '—', 'Rows matched to EXTERNAL_API parent jobs are skipped on update.'],
  ];
  const template = [
    {
      ID: '',
      'Job Number': 'JOB-1001',
      'Customer Name': 'Sample Customer LLC',
      'Customer ID': '',
      Status: 'ACTIVE',
      Description: 'Sample parent job',
      Site: 'Site A',
      Address: '',
      'Start Date': '2026-01-15',
      'End Date': '',
      'Quotation Number': '',
      'Quotation Date': '',
      'LPO Number': '',
      'LPO Date': '',
      'LPO Value': '',
      'Project Name': 'Project Alpha',
      'Project Details': '',
      'Contact Person': 'Site manager',
      'Sales Person': '',
      'Job Work Value': '',
      'Required Expertises': 'Welding',
      'Contact 1 Name': 'Site manager',
      'Contact 1 Email': '',
      'Contact 1 Phone': '',
    },
  ];
  downloadWorkbook('parent-jobs-import-template.xlsx', [
    { name: 'Instructions', rows: instructions },
    { name: 'Template', rows: template },
  ]);
}
