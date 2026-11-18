import { prisma } from '@/lib/db/prisma';
import { parseAdvanceAmount, parseAdvanceNote, parseRecordDate } from '@/lib/hr/employeeRecordValidation';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { dateFromYmd } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function ymd(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; advanceId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_PAYROLL_COMPENSATION });
  if (!ctx.ok) return ctx.response;
  const { id, advanceId } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, ...companyIdWhere(ctx.companyIds) },
    select: { id: true, companyId: true },
  });
  if (!employee) return errorResponse('Employee not found', 404);

  const existing = await prisma.employeeAdvance.findFirst({
    where: { id: advanceId, companyId: employee.companyId, employeeId: employee.id },
  });
  if (!existing) return errorResponse('Advance not found', 404);

  const body = (await req.json().catch(() => null)) as { date?: unknown; amount?: unknown; note?: unknown } | null;
  const date = parseRecordDate(body?.date);
  const amount = parseAdvanceAmount(body?.amount);
  if (!date || !amount) return errorResponse('Enter a date and an amount greater than zero, with at most two decimal places', 400);
  const note = parseAdvanceNote(body?.note);
  if (body?.note != null && body.note !== '' && !note) return errorResponse('Note must be 2000 characters or less', 400);

  const updated = await prisma.employeeAdvance.update({
    where: { id: existing.id },
    data: { advanceDate: dateFromYmd(date), amount, note },
  });
  return successResponse({
    advance: { id: updated.id, date: ymd(updated.advanceDate), amount: Number(updated.amount), note: updated.note },
  });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; advanceId: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_PAYROLL_COMPENSATION });
  if (!ctx.ok) return ctx.response;
  const { id, advanceId } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, ...companyIdWhere(ctx.companyIds) },
    select: { id: true, companyId: true },
  });
  if (!employee) return errorResponse('Employee not found', 404);
  const existing = await prisma.employeeAdvance.findFirst({
    where: { id: advanceId, companyId: employee.companyId, employeeId: employee.id },
    select: { id: true },
  });
  if (!existing) return errorResponse('Advance not found', 404);
  await prisma.employeeAdvance.delete({ where: { id: existing.id } });
  return successResponse({ deleted: true });
}
