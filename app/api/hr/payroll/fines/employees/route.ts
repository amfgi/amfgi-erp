import { prisma } from '@/lib/db/prisma';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: searchParams.get('companyId'),
    requireCompanyId: true,
  });
  if (!ctx.ok) return ctx.response;
  if (!ctx.companyId) return errorResponse('companyId is required', 400);

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, employeeCode: true, fullName: true, preferredName: true },
    orderBy: [{ fullName: 'asc' }],
    take: 2000,
  });
  return successResponse({ employees });
}
