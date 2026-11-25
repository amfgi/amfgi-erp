import { prisma } from '@/lib/db/prisma';
import { parseAdvanceAmount, parseAdvanceNote, parseRecordDate } from '@/lib/hr/employeeRecordValidation';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { dateFromYmd } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function ymd(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function findEmployee(employeeId: string, companyIds: string[]) {
  return prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
    select: { id: true, companyId: true },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_PAYROLL_COMPENSATION });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const rows = await prisma.employeeAdvance.findMany({
    where: { companyId: employee.companyId, employeeId: employee.id },
    orderBy: [{ advanceDate: 'desc' }, { createdAt: 'desc' }],
  });
  return successResponse({
    advances: rows.map((row) => ({
      id: row.id,
      date: ymd(row.advanceDate),
      amount: Number(row.amount),
      note: row.note,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_PAYROLL_COMPENSATION });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const body = (await req.json().catch(() => null)) as { date?: unknown; amount?: unknown; note?: unknown } | null;
  const date = parseRecordDate(body?.date);
  const amount = parseAdvanceAmount(body?.amount);
  if (!date || !amount) return errorResponse('Enter a date and an amount greater than zero, with at most two decimal places', 400);
  const note = parseAdvanceNote(body?.note);
  if (body?.note != null && body.note !== '' && !note) return errorResponse('Note must be 2000 characters or less', 400);

  const created = await prisma.employeeAdvance.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      advanceDate: dateFromYmd(date),
      amount,
      note,
    },
  });
  return successResponse({
    advance: { id: created.id, date, amount: Number(amount), note },
  });
}
