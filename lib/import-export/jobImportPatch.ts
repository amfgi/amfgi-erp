import type { ParentJobImportRow } from '@/lib/import-export/parentJobFields';
import { decimalToNumber } from '@/lib/utils/decimal';

function parseDateOrNull(value?: string) {
  if (!value?.trim()) return null;
  return new Date(`${value.trim()}T00:00:00Z`);
}

function setOptionalString(
  patch: Record<string, unknown>,
  key: string,
  value: string | undefined,
) {
  if (value !== undefined) patch[key] = value.trim() || null;
}

function setOptionalDate(
  patch: Record<string, unknown>,
  key: string,
  value: string | undefined,
) {
  if (value !== undefined) patch[key] = parseDateOrNull(value);
}

/** Full row for create — missing values become null / defaults. */
export function buildParentJobCreateData(row: ParentJobImportRow, customerId: string) {
  return {
    jobNumber: row.jobNumber.trim(),
    customerId,
    description: row.description?.trim() || null,
    site: row.site?.trim() || null,
    address: row.address?.trim() || null,
    status: row.status ?? 'ACTIVE',
    startDate: parseDateOrNull(row.startDate) ?? new Date(),
    endDate: parseDateOrNull(row.endDate),
    quotationNumber: row.quotationNumber?.trim() || null,
    quotationDate: parseDateOrNull(row.quotationDate),
    lpoNumber: row.lpoNumber?.trim() || null,
    lpoDate: parseDateOrNull(row.lpoDate),
    lpoValue: decimalToNumber(row.lpoValue) ?? null,
    projectName: row.projectName?.trim() || null,
    projectDetails: row.projectDetails?.trim() || null,
    projectType: row.projectType?.trim() || null,
    projectQtyArea: row.projectQtyArea?.trim() || null,
    contactPerson: row.contactPerson?.trim() || null,
    salesPerson: row.salesPerson?.trim() || null,
    jobWorkValue: decimalToNumber(row.jobWorkValue) ?? null,
    parentJobId: null as string | null,
  };
}

/** Patch only columns present in the import row — safe for bulk update. */
export function buildParentJobUpdatePatch(row: ParentJobImportRow, customerId: string) {
  const patch: Record<string, unknown> = {
    jobNumber: row.jobNumber.trim(),
    customerId,
  };

  setOptionalString(patch, 'description', row.description);
  setOptionalString(patch, 'site', row.site);
  setOptionalString(patch, 'address', row.address);
  if (row.status !== undefined) patch.status = row.status;
  setOptionalDate(patch, 'startDate', row.startDate);
  setOptionalDate(patch, 'endDate', row.endDate);
  setOptionalString(patch, 'quotationNumber', row.quotationNumber);
  setOptionalDate(patch, 'quotationDate', row.quotationDate);
  setOptionalString(patch, 'lpoNumber', row.lpoNumber);
  setOptionalDate(patch, 'lpoDate', row.lpoDate);
  if (row.lpoValue !== undefined) patch.lpoValue = decimalToNumber(row.lpoValue) ?? null;
  setOptionalString(patch, 'projectName', row.projectName);
  setOptionalString(patch, 'projectDetails', row.projectDetails);
  setOptionalString(patch, 'projectType', row.projectType);
  setOptionalString(patch, 'projectQtyArea', row.projectQtyArea);
  setOptionalString(patch, 'contactPerson', row.contactPerson);
  setOptionalString(patch, 'salesPerson', row.salesPerson);
  if (row.jobWorkValue !== undefined) patch.jobWorkValue = decimalToNumber(row.jobWorkValue) ?? null;

  return patch;
}

/** Variation create/update uses the same field set plus parentJobId on create. */
export function buildVariationJobCreateData(
  row: ParentJobImportRow,
  jobNumber: string,
  customerId: string,
  parentJobId: string,
) {
  return {
    ...buildParentJobCreateData({ ...row, jobNumber }, customerId),
    jobNumber,
    parentJobId,
  };
}

export function buildVariationJobUpdatePatch(
  row: ParentJobImportRow,
  jobNumber: string,
  customerId: string,
  parentJobId: string,
) {
  return {
    ...buildParentJobUpdatePatch({ ...row, jobNumber }, customerId),
    jobNumber,
    parentJobId,
  };
}
