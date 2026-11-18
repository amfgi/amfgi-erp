import { prisma } from '@/lib/db/prisma';
import { parseRecordDate, parseWarningNote } from '@/lib/hr/employeeRecordValidation';
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
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_VIEW });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const rows = await prisma.employeeWarning.findMany({
    where: { companyId: employee.companyId, employeeId: employee.id },
    orderBy: [{ warningDate: 'desc' }, { createdAt: 'desc' }],
  });
  return successResponse({
    warnings: rows.map((row) => ({ id: row.id, date: ymd(row.warningDate), note: row.note })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_EMPLOYEE_EDIT });
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const employee = await findEmployee(id, ctx.companyIds);
  if (!employee) return errorResponse('Employee not found', 404);

  const body = (await req.json().catch(() => null)) as { date?: unknown; note?: unknown } | null;
  const date = parseRecordDate(body?.date);
  const note = parseWarningNote(body?.note);
  if (!date || !note) return errorResponse('Enter a date and a note', 400);

  const created = await prisma.employeeWarning.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      warningDate: dateFromYmd(date),
      note,
    },
  });
  return successResponse({ warning: { id: created.id, date, note } });
}
