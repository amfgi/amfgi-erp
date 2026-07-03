import type { Employee, EmployeeStatus, Prisma } from '@prisma/client';

import { employeeTypeFromProfileExtension } from '@/lib/hr/employeeTypeSettings';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';

export type EmployeeListFilterParams = {
  q?: string | null;
  status?: string | null;
  employeeType?: string | null;
  portal?: string | null;
  designation?: string | null;
  department?: string | null;
  employmentType?: string | null;
  signatureGroup?: string | null;
  visaHolding?: string | null;
  expertise?: string | null;
};

export type EmployeeDirectoryFilterParams = {
  q?: string;
  status?: string;
  employeeType?: string;
  portal?: string;
  designation?: string;
  department?: string;
  employmentType?: string;
  signatureGroup?: string;
  visaHolding?: string;
  expertise?: string;
};

type EmploymentStringField = 'designation' | 'department' | 'employmentType' | 'signatureGroup';

export function parseEmployeeFilterValues(value?: string | null): string[] {
  if (!value?.trim() || value.trim() === 'ALL') return [];
  return [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))];
}

export function serializeEmployeeFilterValues(values?: string[] | null): string | undefined {
  if (!values?.length) return undefined;
  return values.join(',');
}

function appendAndClause(where: Prisma.EmployeeWhereInput, clause: Prisma.EmployeeWhereInput) {
  const andClauses = Array.isArray(where.AND) ? [...where.AND] : where.AND ? [where.AND] : [];
  andClauses.push(clause);
  where.AND = andClauses;
}

function applyOptionalEmploymentField(
  where: Prisma.EmployeeWhereInput,
  field: EmploymentStringField,
  value?: string | null
) {
  const values = parseEmployeeFilterValues(value);
  if (values.length === 0) return;

  const wantsNone = values.includes('__none__');
  const names = values.filter((v) => v !== '__none__');
  const clauses: Prisma.EmployeeWhereInput[] = [];

  if (wantsNone) {
    clauses.push({ OR: [{ [field]: null }, { [field]: '' }] });
  }
  if (names.length === 1) {
    clauses.push({ [field]: names[0] });
  } else if (names.length > 1) {
    clauses.push({ [field]: { in: names } });
  }

  if (clauses.length === 1) {
    appendAndClause(where, clauses[0]);
  } else if (clauses.length > 1) {
    appendAndClause(where, { OR: clauses });
  }
}

export function buildEmployeeListWhere(
  companyId: string,
  filters: EmployeeListFilterParams
): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = { companyId };
  const statuses = parseEmployeeFilterValues(filters.status);
  const portals = parseEmployeeFilterValues(filters.portal);
  const q = filters.q?.trim();

  if (statuses.length === 1) {
    where.status = statuses[0] as EmployeeStatus;
  } else if (statuses.length > 1) {
    where.status = { in: statuses as EmployeeStatus[] };
  }

  if (portals.length === 1) {
    where.portalEnabled = portals[0] === 'enabled';
  } else if (portals.length === 2 && portals.includes('enabled') && portals.includes('disabled')) {
    // Both selected = no portal filter
  } else if (portals.includes('enabled')) {
    where.portalEnabled = true;
  } else if (portals.includes('disabled')) {
    where.portalEnabled = false;
  }

  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { employeeCode: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }

  applyOptionalEmploymentField(where, 'designation', filters.designation);
  applyOptionalEmploymentField(where, 'department', filters.department);
  applyOptionalEmploymentField(where, 'employmentType', filters.employmentType);
  applyOptionalEmploymentField(where, 'signatureGroup', filters.signatureGroup);

  return where;
}

export function filterEmployeesByWorkforceType<T extends { profileExtension: unknown }>(
  rows: T[],
  employeeType: string | null | undefined
): T[] {
  const values = parseEmployeeFilterValues(employeeType);
  if (values.length === 0) return rows;

  const wantsNone = values.includes('__none__');
  const types = values.filter((v) => v !== '__none__');

  return rows.filter((employee) => {
    const type = employeeTypeFromProfileExtension(employee.profileExtension);
    const isNone = !type || type.trim() === '';
    if (isNone) return wantsNone;
    if (types.length === 0) return false;
    return types.includes(type);
  });
}

export function filterEmployeesByWorkforceFilters<T extends { profileExtension: unknown }>(
  rows: T[],
  filters: Pick<EmployeeListFilterParams, 'employeeType' | 'visaHolding' | 'expertise'>
): T[] {
  let result = rows;
  if (filters.employeeType && filters.employeeType !== 'ALL') {
    result = filterEmployeesByWorkforceType(result, filters.employeeType);
  }

  const visaValues = parseEmployeeFilterValues(filters.visaHolding);
  if (visaValues.length > 0) {
    result = result.filter((employee) => {
      const holding = parseWorkforceProfile(employee.profileExtension).visaHolding;
      return visaValues.includes(holding);
    });
  }

  const expertiseValues = parseEmployeeFilterValues(filters.expertise).map((v) => v.toLowerCase());
  if (expertiseValues.length > 0) {
    result = result.filter((employee) => {
      const expertises = parseWorkforceProfile(employee.profileExtension).expertises;
      return expertises.some((name) => expertiseValues.includes(name.toLowerCase()));
    });
  }

  return result;
}

export function sortEmployeesByName<T extends Pick<Employee, 'fullName'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function readEmployeeDirectoryFiltersFromSearchParams(
  searchParams: URLSearchParams
): EmployeeListFilterParams {
  return {
    q: searchParams.get('q') ?? undefined,
    status: searchParams.get('status'),
    employeeType: searchParams.get('employeeType'),
    portal: searchParams.get('portal'),
    designation: searchParams.get('designation'),
    department: searchParams.get('department'),
    employmentType: searchParams.get('employmentType'),
    signatureGroup: searchParams.get('signatureGroup'),
    visaHolding: searchParams.get('visaHolding'),
    expertise: searchParams.get('expertise'),
  };
}

export function appendEmployeeDirectorySearchParams(
  search: URLSearchParams,
  params?: EmployeeDirectoryFilterParams | null
) {
  if (!params) return;
  if (params.q?.trim()) search.set('q', params.q.trim());

  const setFilter = (key: string, value?: string) => {
    if (value?.trim() && value.trim() !== 'ALL') search.set(key, value.trim());
  };

  setFilter('status', params.status);
  setFilter('employeeType', params.employeeType);
  setFilter('portal', params.portal);
  setFilter('designation', params.designation);
  setFilter('department', params.department);
  setFilter('employmentType', params.employmentType);
  setFilter('signatureGroup', params.signatureGroup);
  setFilter('visaHolding', params.visaHolding);
  setFilter('expertise', params.expertise);
}

export function directoryFilterValueToArray(value?: string | null): string[] {
  return parseEmployeeFilterValues(value);
}

export function directoryFilterArrayToValue(values: string[]): string | undefined {
  return serializeEmployeeFilterValues(values);
}

export function hasEmployeeDirectoryFilters(filters: EmployeeDirectoryFilterParams): boolean {
  return Boolean(
    filters.q?.trim() ||
      parseEmployeeFilterValues(filters.status).length > 0 ||
      parseEmployeeFilterValues(filters.employeeType).length > 0 ||
      parseEmployeeFilterValues(filters.portal).length > 0 ||
      parseEmployeeFilterValues(filters.designation).length > 0 ||
      parseEmployeeFilterValues(filters.department).length > 0 ||
      parseEmployeeFilterValues(filters.employmentType).length > 0 ||
      parseEmployeeFilterValues(filters.signatureGroup).length > 0 ||
      parseEmployeeFilterValues(filters.visaHolding).length > 0 ||
      parseEmployeeFilterValues(filters.expertise).length > 0
  );
}
