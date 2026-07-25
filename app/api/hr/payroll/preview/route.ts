import { P } from '@/lib/permissions';
import { requireHrSession, requirePerm } from '@/lib/hr/requireHrSession';
import { buildPayrollPreview } from '@/lib/hr/payroll/buildPayPreview';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
    return errorResponse('Forbidden', 403);
  }

  const month = String(searchParams.get('month') ?? '').trim();
  if (!month) return errorResponse('month query required (YYYY-MM)', 400);

  const employeeId = String(searchParams.get('employeeId') ?? '').trim() || null;

  try {
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

    const previews = await Promise.all(
      companyIds.map(async (companyId) => {
        try {
          const preview = await buildPayrollPreview(companyId, month, employeeId);
          return {
            companyId,
            companyName: companyNameById.get(companyId) ?? companyId,
            employees: preview.employees,
          };
        } catch (error) {
          // Single-employee filter: skip companies where the employee does not exist.
          if (employeeId && error instanceof Error && error.message === 'Employee not found') {
            return { companyId, companyName: companyNameById.get(companyId) ?? companyId, employees: [] };
          }
          throw error;
        }
      }),
    );

    const employees = previews.flatMap((preview) =>
      preview.employees.map((row) => ({
        ...row,
        companyId: preview.companyId,
        companyName: preview.companyName,
      })),
    );
    const totalGross = employees
      .filter((e) => !e.skipped)
      .reduce((sum, e) => sum + e.gross, 0);

    return successResponse({
      month,
      employees,
      totalGross: Math.round(totalGross * 100) / 100,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Preview failed', 400);
  }
}
