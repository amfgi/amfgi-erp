import { randomUUID } from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { parseAdvanceAmount, parseRecordDate } from '@/lib/hr/employeeRecordValidation';
import {
  EXTRA_FILE_MAX_BYTES,
  EXTRA_FILE_MAX_COUNT,
  extraFileBaseName,
  extraFileExtension,
  extraFileStorageName,
  isAllowedExtraFile,
} from '@/lib/hr/employeeExtraFiles';
import { dubaiTodayYmd } from '@/lib/hr/payroll/calendar';
import { formatPayrollMonthLabel, planFineInstallments, type FineRecoveryInput } from '@/lib/hr/payroll/fineInstallments';
import { dateFromYmd } from '@/lib/hr/workDate';
import { buildEmployeeDriveFolderName, deleteFromDrive, uploadToDrive } from '@/lib/utils/googleDrive';
import { driveFileIdToOpenUrl } from '@/lib/utils/googleDriveUrl';
import { getEffectiveGoogleDriveRootFolderId } from '@/lib/utils/globalSettings';

export const FINE_FILE_MAX_COUNT = EXTRA_FILE_MAX_COUNT;

const fineInclude = {
  employee: { select: { id: true, employeeCode: true, fullName: true, preferredName: true } },
  installments: {
    select: { payrollMonth: true, amount: true, sequence: true },
    orderBy: { sequence: 'asc' as const },
  },
  files: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      mediaUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.EmployeeFineInclude;

type FineRow = Prisma.EmployeeFineGetPayload<{ include: typeof fineInclude }>;

export type EmployeeFineDto = {
  id: string;
  companyId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePreferredName: string | null;
  fineDate: string;
  description: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  installments: Array<{ payrollMonth: string; amount: number; sequence: number }>;
  files: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    mediaUrl: string;
  }>;
  createdAt: string;
  reviewedAt: string | null;
};

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseFineDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const description = value.trim();
  if (!description || description.length > 2000) return null;
  return description;
}

export function toEmployeeFineDto(row: FineRow): EmployeeFineDto {
  return {
    id: row.id,
    companyId: row.companyId,
    employeeId: row.employeeId,
    employeeCode: row.employee.employeeCode,
    employeeName: row.employee.fullName,
    employeePreferredName: row.employee.preferredName,
    fineDate: ymd(row.fineDate),
    description: row.description,
    amount: Number(row.amount),
    status: row.status,
    installments: row.installments.map((installment) => ({
      payrollMonth: installment.payrollMonth,
      amount: Number(installment.amount),
      sequence: installment.sequence,
    })),
    files: row.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      mediaUrl: file.mediaUrl,
    })),
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export async function listEmployeeFines(input: {
  companyIds: string[];
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}) {
  const rows = await prisma.employeeFine.findMany({
    where: {
      companyId: { in: input.companyIds },
      ...(input.status ? { status: input.status } : {}),
    },
    include: fineInclude,
    orderBy: [{ fineDate: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toEmployeeFineDto);
}

export async function findEmployeeFine(id: string, companyIds: string[]) {
  return prisma.employeeFine.findFirst({
    where: { id, companyId: { in: companyIds } },
    include: fineInclude,
  });
}

function readUploadFiles(formData: FormData): File[] {
  return formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

export function validateFineUploadFiles(files: File[]): string | null {
  if (files.length > FINE_FILE_MAX_COUNT) {
    return `Upload at most ${FINE_FILE_MAX_COUNT} files at once`;
  }
  for (const file of files) {
    const fileName = extraFileBaseName(file.name);
    if (!fileName || !isAllowedExtraFile(fileName)) {
      return 'Allowed types: PDF, images, Word, Excel, CSV, TXT';
    }
    if (file.size > EXTRA_FILE_MAX_BYTES) {
      return 'File size must not exceed 20 MB';
    }
  }
  return null;
}

async function storeFineFiles(input: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  fineId: string;
  files: File[];
}): Promise<{ created: number; errors: string[] }> {
  if (input.files.length === 0) return { created: 0, errors: [] };
  const folderId = await getEffectiveGoogleDriveRootFolderId();
  if (!folderId) return { created: 0, errors: ['Google Drive folder not configured'] };

  let created = 0;
  const errors: string[] = [];
  for (const file of input.files) {
    const fileName = extraFileBaseName(file.name);
    const extension = extraFileExtension(fileName);
    const storageName = extraFileStorageName(fileName, randomUUID().slice(0, 8));
    let driveFileId = '';
    try {
      const uploaded = await uploadToDrive(
        Buffer.from(await file.arrayBuffer()),
        storageName,
        file.type || 'application/octet-stream',
        {
          companyId: input.companyId,
          rootFolderId: folderId,
          folderPath: [
            { key: 'drive-folder:employees-root', name: 'Employees' },
            {
              key: `drive-folder:employee:${input.employeeId}`,
              name: buildEmployeeDriveFolderName(input.employeeName, input.employeeId),
            },
            { key: `drive-folder:employee:${input.employeeId}:fines`, name: 'Fines' },
          ],
        }
      );
      driveFileId = uploaded.id;
      await prisma.employeeFineFile.create({
        data: {
          companyId: input.companyId,
          fineId: input.fineId,
          fileName,
          extension,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          mediaUrl: driveFileIdToOpenUrl(uploaded.id) ?? uploaded.viewerUrl,
          driveFileId: uploaded.id,
        },
      });
      created += 1;
    } catch (error) {
      if (driveFileId) {
        try {
          await deleteFromDrive(driveFileId, input.companyId);
        } catch (cleanupError) {
          console.error('Failed to remove fine file after save error:', cleanupError);
        }
      }
      errors.push(error instanceof Error ? error.message : 'Upload failed');
    }
  }
  return { created, errors };
}

export async function createEmployeeFine(input: {
  companyId: string;
  employeeId: string;
  description: string;
  amount: string;
  createdById: string | null;
  files: File[];
}): Promise<{ fine: EmployeeFineDto } | { error: string; status: number }> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
    select: { id: true, fullName: true },
  });
  if (!employee) return { error: 'Employee not found', status: 404 };

  const fileError = validateFineUploadFiles(input.files);
  if (fileError) return { error: fileError, status: 400 };
  if (input.files.length > 0) {
    const folderId = await getEffectiveGoogleDriveRootFolderId();
    if (!folderId) return { error: 'Google Drive folder not configured', status: 500 };
  }

  const created = await prisma.employeeFine.create({
    data: {
      companyId: input.companyId,
      employeeId: employee.id,
      fineDate: dateFromYmd(dubaiTodayYmd()),
      description: input.description,
      amount: input.amount,
      status: 'PENDING',
      createdById: input.createdById,
    },
    select: { id: true },
  });

  if (input.files.length > 0) {
    const uploaded = await storeFineFiles({
      companyId: input.companyId,
      employeeId: employee.id,
      employeeName: employee.fullName,
      fineId: created.id,
      files: input.files,
    });
    if (uploaded.created === 0) {
      await prisma.employeeFine.delete({ where: { id: created.id } });
      return { error: uploaded.errors[0] ?? 'Upload failed', status: 400 };
    }
  }

  const fine = await findEmployeeFine(created.id, [input.companyId]);
  if (!fine) return { error: 'Fine could not be saved', status: 500 };
  return { fine: toEmployeeFineDto(fine) };
}

function decidedFineError(status: string): { error: string; status: number } | null {
  if (status === 'PENDING') return null;
  const label = status === 'APPROVED' ? 'approved' : 'rejected';
  return { error: `This fine is already ${label} and cannot be changed`, status: 409 };
}

export async function updateEmployeeFine(input: {
  id: string;
  companyIds: string[];
  description: string;
  amount: string;
  status?: 'APPROVED' | 'REJECTED';
  recovery?: FineRecoveryInput | null;
  reviewedById: string | null;
}): Promise<{ fine: EmployeeFineDto } | { error: string; status: number }> {
  const existing = await findEmployeeFine(input.id, input.companyIds);
  if (!existing) return { error: 'Fine not found', status: 404 };
  const locked = decidedFineError(existing.status);
  if (locked) return locked;

  const approving = input.status === 'APPROVED';
  const plan = approving
    ? planFineInstallments({
        fineDate: ymd(existing.fineDate),
        amount: Number(input.amount),
        recovery: input.recovery ?? null,
      })
    : null;
  if (plan && 'error' in plan) return { error: plan.error, status: 400 };

  if (plan && 'installments' in plan) {
    const months = plan.installments.map((row) => row.payrollMonth);
    const finalized = await prisma.payRun.findMany({
      where: { companyId: existing.companyId, month: { in: months } },
      select: { month: true },
      orderBy: { month: 'asc' },
    });
    if (finalized.length > 0) {
      const labels = finalized.map((run) => formatPayrollMonthLabel(run.month)).join(' and ');
      return { error: `Payroll for ${labels} is already finalized`, status: 409 };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.employeeFine.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        amount: input.amount,
        ...(input.status
          ? {
              status: input.status,
              reviewedById: input.reviewedById,
              reviewedAt: new Date(),
            }
          : {}),
      },
    });
    if (plan && 'installments' in plan) {
      await tx.employeeFineInstallment.createMany({
        data: plan.installments.map((row) => ({
          companyId: existing.companyId,
          fineId: existing.id,
          payrollMonth: row.payrollMonth,
          amount: row.amount.toFixed(2),
          sequence: row.sequence,
        })),
      });
    }
    return tx.employeeFine.findFirst({ where: { id: existing.id }, include: fineInclude });
  });
  if (!updated) return { error: 'Fine could not be saved', status: 500 };
  return { fine: toEmployeeFineDto(updated) };
}

export async function addEmployeeFineFiles(input: {
  id: string;
  companyIds: string[];
  files: File[];
}): Promise<{ fine: EmployeeFineDto; errors: string[] } | { error: string; status: number }> {
  const existing = await findEmployeeFine(input.id, input.companyIds);
  if (!existing) return { error: 'Fine not found', status: 404 };
  const locked = decidedFineError(existing.status);
  if (locked) return locked;
  const fileError = validateFineUploadFiles(input.files);
  if (fileError) return { error: fileError, status: 400 };
  if (input.files.length === 0) return { error: 'Choose at least one file', status: 400 };
  const remaining = FINE_FILE_MAX_COUNT - existing.files.length;
  if (input.files.length > remaining) {
    return { error: `A fine can have at most ${FINE_FILE_MAX_COUNT} files`, status: 400 };
  }

  const uploaded = await storeFineFiles({
    companyId: existing.companyId,
    employeeId: existing.employeeId,
    employeeName: existing.employee.fullName,
    fineId: existing.id,
    files: input.files,
  });
  if (uploaded.created === 0) {
    return { error: uploaded.errors[0] ?? 'Upload failed', status: 400 };
  }
  const fine = await findEmployeeFine(existing.id, input.companyIds);
  if (!fine) return { error: 'Fine not found', status: 404 };
  return { fine: toEmployeeFineDto(fine), errors: uploaded.errors };
}

export async function removeEmployeeFineFile(input: {
  fineId: string;
  fileId: string;
  companyIds: string[];
}): Promise<{ ok: true } | { error: string; status: number }> {
  const fine = await prisma.employeeFine.findFirst({
    where: { id: input.fineId, companyId: { in: input.companyIds } },
    select: { id: true, status: true },
  });
  if (!fine) return { error: 'Fine not found', status: 404 };
  const locked = decidedFineError(fine.status);
  if (locked) return locked;

  const file = await prisma.employeeFineFile.findFirst({
    where: { id: input.fileId, fineId: input.fineId, companyId: { in: input.companyIds } },
    select: { id: true, companyId: true, driveFileId: true },
  });
  if (!file) return { error: 'File not found', status: 404 };
  await prisma.employeeFineFile.delete({ where: { id: file.id } });
  try {
    await deleteFromDrive(file.driveFileId, file.companyId);
  } catch (error) {
    console.error('Failed to delete fine file from Drive:', error);
  }
  return { ok: true };
}

export function readFineFormFields(formData: FormData): {
  employeeId: string;
  fineDate: string | null;
  description: string | null;
  amount: string | null;
  files: File[];
} {
  return {
    employeeId: String(formData.get('employeeId') ?? '').trim(),
    fineDate: parseRecordDate(formData.get('fineDate')),
    description: parseFineDescription(formData.get('description')),
    amount: parseAdvanceAmount(formData.get('amount')),
    files: readUploadFiles(formData),
  };
}
