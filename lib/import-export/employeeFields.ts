import { cellToString, downloadWorkbook, parseOptionalBoolean } from '@/lib/import-export/xlsx';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  type WorkforceEmployeeType,
  type WorkforceVisaHolding,
  buildWorkforceProfileExtension,
  parseWorkforceProfile,
} from '@/lib/hr/workforceProfile';
import { parsePartyListDateInput } from '@/lib/partyListsApi';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export const EMPLOYEE_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'ID', aliases: ['employee id'] },
  { key: 'employee_code', label: 'Employee Code', required: true, aliases: ['code', 'emp code'] },
  { key: 'full_name', label: 'Full Name', required: true, aliases: ['name', 'employee name'] },
  { key: 'preferred_name', label: 'Preferred Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone', aliases: ['mobile', 'mobile number'] },
  { key: 'nationality', label: 'Nationality' },
  { key: 'date_of_birth', label: 'Date of Birth', aliases: ['dob', 'birth date'] },
  { key: 'gender', label: 'Gender' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'employment_type', label: 'Employment Type' },
  { key: 'hire_date', label: 'Hire Date' },
  { key: 'termination_date', label: 'Termination Date' },
  { key: 'status', label: 'Status', aliases: ['employee status'] },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { key: 'emergency_contact_phone', label: 'Emergency Contact Phone' },
  { key: 'blood_group', label: 'Blood Group' },
  { key: 'portal_enabled', label: 'Portal Enabled', aliases: ['portal'] },
  { key: 'employee_type', label: 'Employee Type', aliases: ['workforce type'] },
  { key: 'visa_holding', label: 'Visa Holding' },
  { key: 'expertises', label: 'Expertises', aliases: ['skills', 'expertise'] },
  { key: '__skip__', label: 'Skip Column' },
];

const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED'] as const;

export type EmployeeImportRow = {
  id?: string;
  employeeCode: string;
  fullName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  designation?: string | null;
  department?: string | null;
  employmentType?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  status?: (typeof EMPLOYEE_STATUSES)[number];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bloodGroup?: string | null;
  portalEnabled?: boolean;
  employeeType?: WorkforceEmployeeType;
  visaHolding?: WorkforceVisaHolding;
  expertises?: string[];
};

function formatDateExport(value?: string | Date | null) {
  if (!value) return '';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function employeeTypeLabel(value: string) {
  return WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function visaHoldingLabel(value: string) {
  return WORKFORCE_VISA_HOLDING_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function employeeToExportRow(employee: HrEmployeeExportRecord): Record<string, string | boolean> {
  const profile = parseWorkforceProfile(employee.profileExtension);
  return {
    ID: employee.id,
    'Employee Code': employee.employeeCode,
    'Full Name': employee.fullName,
    'Preferred Name': employee.preferredName ?? '',
    Email: employee.email ?? '',
    Phone: employee.phone ?? '',
    Nationality: employee.nationality ?? '',
    'Date of Birth': formatDateExport(employee.dateOfBirth),
    Gender: employee.gender ?? '',
    Designation: employee.designation ?? '',
    Department: employee.department ?? '',
    'Employment Type': employee.employmentType ?? '',
    'Hire Date': formatDateExport(employee.hireDate),
    'Termination Date': formatDateExport(employee.terminationDate),
    Status: employee.status,
    'Emergency Contact Name': employee.emergencyContactName ?? '',
    'Emergency Contact Phone': employee.emergencyContactPhone ?? '',
    'Blood Group': employee.bloodGroup ?? '',
    'Portal Enabled': employee.portalEnabled ? 'TRUE' : 'FALSE',
    'Employee Type': employeeTypeLabel(profile.employeeType),
    'Visa Holding': visaHoldingLabel(profile.visaHolding),
    Expertises: profile.expertises.join(', '),
  };
}

function parseDateField(value: string, label: string, errors: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = parsePartyListDateInput(trimmed);
  if (!date) errors.push(`Invalid date for ${label} (use YYYY-MM-DD)`);
  return trimmed;
}

function parseEmployeeStatus(value: string, errors: string[]): (typeof EMPLOYEE_STATUSES)[number] | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'ONHOLD') return 'ON_LEAVE';
  const match = EMPLOYEE_STATUSES.find((s) => s === normalized);
  if (!match) {
    errors.push(`Invalid status "${value}" (use Active, On Leave, Suspended, or Exited)`);
    return undefined;
  }
  return match;
}

function parseEmployeeTypeInput(value: string, errors: string[]): WorkforceEmployeeType | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  const byValue = WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === upper);
  if (byValue) return byValue.value;
  const byLabel = WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.label.toLowerCase().startsWith(trimmed.toLowerCase())
  );
  if (byLabel) return byLabel.value;
  errors.push(
    `Invalid employee type "${value}" (use Office Staff, Hybrid Staff, Driver, or Labour / Worker)`
  );
  return undefined;
}

function parseVisaHoldingInput(value: string, errors: string[]): WorkforceVisaHolding | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  const byValue = WORKFORCE_VISA_HOLDING_OPTIONS.find((o) => o.value === upper);
  if (byValue) return byValue.value;
  const byLabel = WORKFORCE_VISA_HOLDING_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return byLabel.value;
  errors.push(`Invalid visa holding "${value}"`);
  return undefined;
}

function parseExpertisesInput(value: string): string[] {
  if (!value.trim()) return [];
  return [...new Set(value.split(/[,;|]/).map((part) => part.trim()).filter(Boolean))];
}

export function mapEmployeeImportRow(
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

  const employeeCode = cellToString(parsed.employee_code as string | undefined);
  if (!employeeCode) parsed.__errors.push('Missing required field: Employee Code');

  const fullName = cellToString(parsed.full_name as string | undefined);
  if (!fullName) parsed.__errors.push('Missing required field: Full Name');

  if (employeeCode.length > 80) {
    parsed.__errors.push(`Employee Code: maximum 80 characters (your value has ${employeeCode.length})`);
  }
  if (fullName.length > 200) {
    parsed.__errors.push(`Full Name: maximum 200 characters (your value has ${fullName.length})`);
  }

  const email = cellToString(parsed.email as string | undefined);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    parsed.__errors.push('Email must be a valid email address');
  }

  const phone = cellToString(parsed.phone as string | undefined);
  if (phone.length > 50) {
    parsed.__errors.push(`Phone: maximum 50 characters (your value has ${phone.length})`);
  }

  for (const [key, label] of [
    ['date_of_birth', 'Date of Birth'],
    ['hire_date', 'Hire Date'],
    ['termination_date', 'Termination Date'],
  ] as const) {
    const raw = cellToString(parsed[key] as string | undefined);
    if (raw) parseDateField(raw, label, parsed.__errors);
  }

  const statusRaw = cellToString(parsed.status as string | undefined);
  if (statusRaw) {
    const status = parseEmployeeStatus(statusRaw, parsed.__errors);
    if (status) parsed.status = status;
  } else {
    parsed.status = 'ACTIVE';
  }

  const portalRaw = parsed.portal_enabled;
  if (portalRaw !== undefined && portalRaw !== '') {
    const portal = parseOptionalBoolean(portalRaw as string | number | boolean);
    if (portal === undefined) {
      parsed.__errors.push('Invalid value for Portal Enabled (use TRUE/FALSE or Yes/No)');
    } else {
      parsed.portalEnabled = portal;
    }
  }

  const typeRaw = cellToString(parsed.employee_type as string | undefined);
  if (typeRaw) {
    const employeeType = parseEmployeeTypeInput(typeRaw, parsed.__errors);
    if (employeeType) parsed.employeeType = employeeType;
  }

  const visaRaw = cellToString(parsed.visa_holding as string | undefined);
  if (visaRaw) {
    const visaHolding = parseVisaHoldingInput(visaRaw, parsed.__errors);
    if (visaHolding) parsed.visaHolding = visaHolding;
  }

  const expertisesRaw = cellToString(parsed.expertises as string | undefined);
  if (expertisesRaw) parsed.expertisesList = parseExpertisesInput(expertisesRaw);

  return parsed;
}

export function employeeImportRowToPayload(row: MappedImportRow): EmployeeImportRow {
  const profile = parseWorkforceProfile(null);
  const employeeType =
    (row.employeeType as WorkforceEmployeeType | undefined) ?? profile.employeeType;
  const visaHolding = (row.visaHolding as WorkforceVisaHolding | undefined) ?? profile.visaHolding;
  const expertises = (row.expertisesList as string[] | undefined) ?? profile.expertises;

  return {
    id: cellToString(row.id as string | undefined) || undefined,
    employeeCode: cellToString(row.employee_code as string),
    fullName: cellToString(row.full_name as string),
    preferredName: cellToString(row.preferred_name as string | undefined) || null,
    email: cellToString(row.email as string | undefined) || null,
    phone: cellToString(row.phone as string | undefined) || null,
    nationality: cellToString(row.nationality as string | undefined) || null,
    dateOfBirth: cellToString(row.date_of_birth as string | undefined) || null,
    gender: cellToString(row.gender as string | undefined) || null,
    designation: cellToString(row.designation as string | undefined) || null,
    department: cellToString(row.department as string | undefined) || null,
    employmentType: cellToString(row.employment_type as string | undefined) || null,
    hireDate: cellToString(row.hire_date as string | undefined) || null,
    terminationDate: cellToString(row.termination_date as string | undefined) || null,
    status: (row.status as EmployeeImportRow['status']) ?? 'ACTIVE',
    emergencyContactName: cellToString(row.emergency_contact_name as string | undefined) || null,
    emergencyContactPhone: cellToString(row.emergency_contact_phone as string | undefined) || null,
    bloodGroup: cellToString(row.blood_group as string | undefined) || null,
    portalEnabled:
      row.portalEnabled !== undefined
        ? Boolean(row.portalEnabled)
        : parseOptionalBoolean(row.portal_enabled as string | number | boolean | undefined),
    employeeType,
    visaHolding,
    expertises,
  };
}

export function buildEmployeeProfileExtensionFromImport(row: EmployeeImportRow): Record<string, unknown> {
  return buildWorkforceProfileExtension({
    employeeType: row.employeeType ?? 'LABOUR_WORKER',
    visaHolding: row.visaHolding ?? 'COMPANY_PROVIDED',
    expertises: row.expertises ?? [],
  });
}

export function downloadEmployeeImportTemplate() {
  const instructions = [
    ['Field', 'Required', 'Instructions'],
    ['ID', 'No', 'Leave blank for new employees. Use existing ID to update.'],
    ['Employee Code', 'Yes', 'Unique per company. Used to match duplicates.'],
    ['Full Name', 'Yes', 'Legal / display name.'],
    ['Status', 'No', 'ACTIVE, ON_LEAVE, SUSPENDED, or EXITED. Defaults to ACTIVE.'],
    ['Portal Enabled', 'No', 'TRUE/FALSE. Does not auto-create login accounts on import.'],
    ['Employee Type', 'No', 'Office Staff, Hybrid Staff, Driver, or Labour / Worker.'],
    ['Expertises', 'No', 'Comma-separated skill labels.'],
    ['Dates', 'No', 'Use YYYY-MM-DD.'],
  ];
  const template = [
    {
      ID: '',
      'Employee Code': 'EMP-001',
      'Full Name': 'Sample Employee',
      'Preferred Name': '',
      Email: 'employee@example.com',
      Phone: '+971500000000',
      Nationality: 'UAE',
      'Date of Birth': '1990-01-15',
      Gender: '',
      Designation: 'Technician',
      Department: 'Production',
      'Employment Type': 'Full time',
      'Hire Date': '2024-01-01',
      'Termination Date': '',
      Status: 'ACTIVE',
      'Emergency Contact Name': '',
      'Emergency Contact Phone': '',
      'Blood Group': '',
      'Portal Enabled': 'FALSE',
      'Employee Type': 'Labour / Worker',
      'Visa Holding': 'Company provided',
      Expertises: 'Lamination, Finishing',
    },
  ];
  downloadWorkbook('employees-import-template.xlsx', [
    { name: 'Instructions', rows: instructions },
    { name: 'Template', rows: template },
  ]);
}
