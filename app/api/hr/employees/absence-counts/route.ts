import { loadCompanyAbsenceCounts } from '@/lib/hr/companyAbsenceCounts';
import { hasPerm, requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_EMPLOYEE_VIEW,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const user = ctx.session.user;
  if (!hasPerm(user, P.HR_ATTENDANCE_VIEW) || !hasPerm(user, P.HR_LEAVE_VIEW)) {
    return errorResponse('Forbidden', 403);
  }
  const companyId = ctx.companyId ?? ctx.companyIds[0];
  if (!companyId) return errorResponse('companyId is required', 400);

  const from = searchParams.get('from')?.trim() || null;
  const to = searchParams.get('to')?.trim() || null;
  if (Boolean(from) !== Boolean(to)) return errorResponse('Choose both dates, or leave both empty.', 400);
  if (from && to && from > to) return errorResponse('From date must be on or before the to date.', 400);

  const counts = await loadCompanyAbsenceCounts({ companyId, from, to });
  return successResponse({ items: counts });
}
