import { removeEmployeeFineFile } from '@/lib/hr/employeeFineService';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;

  const { id, fileId } = await params;
  const result = await removeEmployeeFineFile({ fineId: id, fileId, companyIds: ctx.companyIds });
  if ('error' in result) return errorResponse(result.error, result.status);
  return successResponse({ ok: true });
}
