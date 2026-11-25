import { prisma } from '@/lib/db/prisma';
import { parseRecordDate, parseWarningNote } from '@/lib/hr/employeeRecordValidation';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { dateFromYmd } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function ymd(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; warningId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { id, warningId } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, ...companyIdWhere(ctx.companyIds) },
    select: { id: true, companyId: true },
  });
  if (!employee) return errorResponse('Employee not found', 404);
  const existing = await prisma.employeeWarning.findFirst({
    where: { id: warningId, companyId: employee.companyId, employeeId: employee.id },
  });
  if (!existing) return errorResponse('Warning not found', 404);

  const body = (await req.json().catch(() => null)) as { date?: unknown; note?: unknown } | null;
  const date = parseRecordDate(body?.date);
  const note = parseWarningNote(body?.note);
  if (!date || !note) return errorResponse('Enter a date and a note', 400);

  const updated = await prisma.employeeWarning.update({
    where: { id: existing.id },
    data: { warningDate: dateFromYmd(date), note },
  });
  return successResponse({ warning: { id: updated.id, date: ymd(updated.warningDate), note: updated.note } });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; warningId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { id, warningId } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, ...companyIdWhere(ctx.companyIds) },
    select: { id: true, companyId: true },
  });
  if (!employee) return errorResponse('Employee not found', 404);
  const existing = await prisma.employeeWarning.findFirst({
    where: { id: warningId, companyId: employee.companyId, employeeId: employee.id },
    select: { id: true },
  });
  if (!existing) return errorResponse('Warning not found', 404);
  await prisma.employeeWarning.delete({ where: { id: existing.id } });
  return successResponse({ deleted: true });
}
