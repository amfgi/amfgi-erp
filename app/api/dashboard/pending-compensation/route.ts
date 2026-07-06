import { loadEmployeesPendingCompensation } from '@/lib/hr/payroll/employeesPendingCompensation';
import { P } from '@/lib/permissions';
import { hasPerm, requireCompanySession } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function currentMonthYmd() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseMonthParam(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
  const [, month] = normalized.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  return normalized;
}

function canViewPendingCompensationDashboard(
  user: Parameters<typeof hasPerm>[0],
) {
  const canSeeAttendance =
    hasPerm(user, P.HR_ATTENDANCE_VIEW) || hasPerm(user, P.HR_ATTENDANCE_EDIT);
  const canManageCompensation =
    hasPerm(user, P.HR_COMPENSATION_VIEW) ||
    hasPerm(user, P.HR_COMPENSATION_CREATE) ||
    hasPerm(user, P.HR_COMPENSATION_EDIT) ||
    hasPerm(user, P.HR_PAYROLL_COMPENSATION);

  return canSeeAttendance && canManageCompensation;
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;

  if (!canViewPendingCompensationDashboard(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const month = parseMonthParam(searchParams.get('month')) ?? currentMonthYmd();

  const employees = await loadEmployeesPendingCompensation(companyId, month);
  return successResponse({ month, employees });
}
