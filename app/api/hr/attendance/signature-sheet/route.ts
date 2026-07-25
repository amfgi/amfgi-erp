import { prisma } from '@/lib/db/prisma';
import {
  loadAttendanceSignatureSheet,
  SignatureSheetNoEmployeesError,
} from '@/lib/hr/buildAttendanceSignatureSheet';
import { ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { requireHrSession, resolveHrWriteCompanyId } from '@/lib/hr/requireHrSession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_SCHEDULE_VIEW,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;

  let companyId = ctx.companyId;
  if (!companyId) {
    companyId = resolveHrWriteCompanyId({
      requestedCompanyId: searchParams.get('companyId'),
      activeCompanyId: ctx.session.user.activeCompanyId,
    });
  }
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  const group = (searchParams.get('group') ?? '').trim();
  const workDateRaw = searchParams.get('workDate');

  if (!group) return errorResponse('group query param is required', 400);
  if (!workDateRaw) return errorResponse('workDate query param is required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  try {
    const payload = await loadAttendanceSignatureSheet(prisma, companyId, workDateYmd, group);
    return successResponse(payload);
  } catch (error) {
    if (error instanceof SignatureSheetNoEmployeesError) {
      return errorResponse(error.message, 404);
    }
    throw error;
  }
}
