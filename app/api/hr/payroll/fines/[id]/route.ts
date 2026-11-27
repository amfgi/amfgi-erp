import { parseAdvanceAmount } from '@/lib/hr/employeeRecordValidation';
import { parseFineDescription, updateEmployeeFine } from '@/lib/hr/employeeFineService';
import { parseFineRecovery } from '@/lib/hr/payroll/fineInstallments';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => null)) as {
    companyId?: string;
    description?: unknown;
    amount?: unknown;
    status?: unknown;
    recovery?: unknown;
  } | null;
  if (!body) return errorResponse('Invalid request', 400);

  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: body.companyId,
  });
  if (!ctx.ok) return ctx.response;

  const description = parseFineDescription(body.description);
  const amount = parseAdvanceAmount(body.amount);
  if (!description) return errorResponse('Enter a description', 400);
  if (!amount) return errorResponse('Enter a fine amount greater than 0', 400);

  let status: 'APPROVED' | 'REJECTED' | undefined;
  if (body.status != null && body.status !== '') {
    if (body.status !== 'APPROVED' && body.status !== 'REJECTED') {
      return errorResponse('Status must be Approved or Rejected', 400);
    }
    status = body.status;
  }

  let recovery = null;
  if (status === 'APPROVED') {
    const parsed = parseFineRecovery(body.recovery);
    if ('error' in parsed) return errorResponse(parsed.error, 400);
    recovery = parsed.recovery;
  }

  const { id } = await params;
  const result = await updateEmployeeFine({
    id,
    companyIds: ctx.companyIds,
    description,
    amount,
    status,
    recovery,
    reviewedById: ctx.session.user.id ?? null,
  });
  if ('error' in result) return errorResponse(result.error, result.status);
  return successResponse({ fine: result.fine });
}
