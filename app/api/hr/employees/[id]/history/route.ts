import { canHrCompensationView } from '@/lib/hr/compensationPermissions';
import { loadEmployeeHistory } from '@/lib/hr/loadEmployeeHistory';
import { buildEmployeeHistoryWorkbook } from '@/lib/hr/employeeHistoryWorkbook';
import { parseHistorySections } from '@/lib/hr/employeeHistorySections';
import { canHrDocumentView } from '@/lib/hr/documentPermissions';
import { canHrVisaView } from '@/lib/hr/visaPermissions';
import { hasPerm, requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse } from '@/lib/utils/apiResponse';
import { successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_EMPLOYEE_VIEW,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const companyId = ctx.companyId ?? ctx.companyIds[0];
  if (!companyId) return errorResponse('companyId is required', 400);

  const { id } = await params;
  const from = searchParams.get('from')?.trim() || null;
  const to = searchParams.get('to')?.trim() || null;
  const user = ctx.session.user;
  const access = {
    attendanceAndLeave: hasPerm(user, P.HR_ATTENDANCE_VIEW) && hasPerm(user, P.HR_LEAVE_VIEW),
    payroll: hasPerm(user, P.HR_PAYROLL_COMPENSATION),
    compensation: canHrCompensationView(user) || hasPerm(user, P.HR_PAYROLL_COMPENSATION),
    visa: canHrVisaView(user),
    documents: canHrDocumentView(user),
  };
  const includeAttendanceDays = access.attendanceAndLeave;

  const report = await loadEmployeeHistory({
    companyId,
    employeeId: id,
    from,
    to,
    access,
    includeAttendanceDays,
  });
  if ('error' in report) return errorResponse(report.error, report.status);

  if (searchParams.get('format') === 'xlsx') {
    const buffer = buildEmployeeHistoryWorkbook(report, parseHistorySections(searchParams.get('sections')));
    const filename = `${report.employee.employeeCode || 'employee'}-history.xlsx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return successResponse(report);
}
