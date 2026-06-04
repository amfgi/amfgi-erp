import { downloadWorkbook } from '@/lib/import-export/xlsx';
import {
  parentJobImportRowToPayload,
  parentJobToExportRow,
  type JobStatusImport,
  type ParentJobImportRow,
} from '@/lib/import-export/parentJobFields';
import { cellToString, parseOptionalNumber } from '@/lib/import-export/xlsx';
import { parsePartyListDateInput } from '@/lib/partyListsApi';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';
import type { Job } from '@/store/api/endpoints/jobs';

export const JOB_VARIATION_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'ID', aliases: ['job id'] },
  { key: 'parent_job_number', label: 'Parent Job Number', aliases: ['parent job no'] },
  { key: 'parent_job_id', label: 'Parent Job ID' },
  { key: 'variation_suffix', label: 'Variation Suffix', aliases: ['suffix'] },
  { key: 'job_number', label: 'Job Number', aliases: ['full job number'] },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name', aliases: ['customer'] },
  { key: 'status', label: 'Status' },
  { key: 'description', label: 'Description' },
  { key: 'site', label: 'Site' },
  { key: 'address', label: 'Address' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'quotation_number', label: 'Quotation Number' },
  { key: 'quotation_date', label: 'Quotation Date' },
  { key: 'lpo_number', label: 'LPO Number' },
  { key: 'lpo_date', label: 'LPO Date' },
  { key: 'lpo_value', label: 'LPO Value' },
  { key: 'project_name', label: 'Project Name' },
  { key: 'project_details', label: 'Project Details' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'sales_person', label: 'Sales Person' },
  { key: 'job_work_value', label: 'Job Work Value' },
  { key: 'required_expertises', label: 'Required Expertises' },
  { key: 'contact1_name', label: 'Contact 1 Name' },
  { key: 'contact1_email', label: 'Contact 1 Email' },
  { key: 'contact1_number', label: 'Contact 1 Phone' },
  { key: 'contact2_name', label: 'Contact 2 Name' },
  { key: 'contact2_email', label: 'Contact 2 Email' },
  { key: 'contact2_number', label: 'Contact 2 Phone' },
  { key: 'contact3_name', label: 'Contact 3 Name' },
  { key: 'contact3_email', label: 'Contact 3 Email' },
  { key: 'contact3_number', label: 'Contact 3 Phone' },
  { key: '__skip__', label: 'Skip Column' },
];

export type JobVariationImportRow = ParentJobImportRow & {
  parentJobId?: string;
  parentJobNumber?: string;
  variationSuffix?: string;
};

export function extractVariationSuffix(parentJobNumber: string, variationJobNumber: string) {
  const prefix = `${parentJobNumber}-`;
  return variationJobNumber.startsWith(prefix) ? variationJobNumber.slice(prefix.length).trim() : '';
}

export type VariationParentLookup = {
  byId: Map<string, string>;
  byNumber: Map<string, string>;
};

/** Unique key for variation import duplicate checks (parent + suffix or full job number). */
export function resolveVariationImportRecordKey(
  row: MappedImportRow,
  parents?: VariationParentLookup
): string {
  const fullJobNumber = cellToString(row.job_number as string | undefined).trim().toLowerCase();
  if (fullJobNumber) return fullJobNumber;

  const suffix = cellToString(row.variation_suffix as string | undefined).trim();
  if (!suffix) return '';

  const parentId = cellToString(row.parent_job_id as string | undefined);
  const parentNumKey = cellToString(row.parent_job_number as string | undefined).trim().toLowerCase();

  let parentJobNumber: string | undefined;
  if (parents) {
    if (parentId && parents.byId.has(parentId)) {
      parentJobNumber = parents.byId.get(parentId);
    } else if (parentNumKey && parents.byNumber.has(parentNumKey)) {
      parentJobNumber = parents.byNumber.get(parentNumKey);
    }
  }

  const suffixKey = suffix.toLowerCase();
  if (parentJobNumber) {
    return `${parentJobNumber.trim().toLowerCase()}-${suffixKey}`;
  }
  if (parentId) return `${parentId}|${suffixKey}`;
  if (parentNumKey) return `${parentNumKey}|${suffixKey}`;
  return suffixKey;
}

export function variationDuplicateInFileMessage(row: MappedImportRow): string {
  const parent = cellToString(row.parent_job_number as string | undefined);
  const suffix = cellToString(row.variation_suffix as string | undefined);
  const jobNumber = cellToString(row.job_number as string | undefined);
  if (jobNumber) return jobNumber;
  if (parent && suffix) return `${parent} / suffix ${suffix}`;
  if (suffix) return `suffix ${suffix}`;
  return 'variation row';
}

export function jobVariationToExportRow(
  job: Job,
  parentJobNumber: string
): Record<string, string | number> {
  const base = parentJobToExportRow(job);
  return {
    ...base,
    'Parent Job Number': parentJobNumber,
    'Parent Job ID': job.parentJobId ?? '',
    'Variation Suffix': extractVariationSuffix(parentJobNumber, job.jobNumber),
  };
}

function parseJobStatus(value: string): JobStatusImport | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'ONHOLD') return 'ON_HOLD';
  const statuses: JobStatusImport[] = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
  return statuses.find((s) => s === normalized);
}

function parseDateField(value: string, label: string, errors: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!parsePartyListDateInput(trimmed)) errors.push(`Invalid date for ${label}`);
}

export function mapJobVariationImportRow(
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

  const parentJobNumber = cellToString(parsed.parent_job_number as string | undefined);
  const parentJobId = cellToString(parsed.parent_job_id as string | undefined);
  if (!parentJobNumber && !parentJobId) {
    parsed.__errors.push('Parent Job Number or Parent Job ID is required');
  }

  const variationSuffix = cellToString(parsed.variation_suffix as string | undefined);
  const jobNumber = cellToString(parsed.job_number as string | undefined);
  if (!variationSuffix && !jobNumber) {
    parsed.__errors.push('Variation Suffix or Job Number is required');
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

export function jobVariationImportRowToPayload(row: MappedImportRow): JobVariationImportRow {
  const jobNumberHint = cellToString(row.job_number as string | undefined) || 'variation';
  const base = parentJobImportRowToPayload({ ...row, job_number: jobNumberHint });
  return {
    ...base,
    jobNumber: cellToString(row.job_number as string | undefined) || jobNumberHint,
    parentJobId: cellToString(row.parent_job_id as string | undefined) || undefined,
    parentJobNumber: cellToString(row.parent_job_number as string | undefined) || undefined,
    variationSuffix: cellToString(row.variation_suffix as string | undefined) || undefined,
  };
}

export function downloadJobVariationImportTemplate() {
  const instructions = [
    ['Field', 'Required', 'Instructions'],
    ['Parent Job Number / ID', 'Yes', 'Link variation to an existing parent job.'],
    ['Variation Suffix / Job Number', 'Yes', 'Use suffix (e.g. 1 → PARENT-1) or full job number.'],
    ['Customer', 'No', 'Optional; inherits from parent when omitted.'],
    ['Variations', '—', 'Can be imported even when parent jobs are external-only.'],
  ];
  const template = [
    {
      ID: '',
      'Parent Job Number': 'JOB-1001',
      'Parent Job ID': '',
      'Variation Suffix': '1',
      'Job Number': '',
      'Customer Name': '',
      'Customer ID': '',
      Status: 'ACTIVE',
      Description: 'Variation scope',
      Site: '',
    },
  ];
  downloadWorkbook('job-variations-import-template.xlsx', [
    { name: 'Instructions', rows: instructions },
    { name: 'Template', rows: template },
  ]);
}
