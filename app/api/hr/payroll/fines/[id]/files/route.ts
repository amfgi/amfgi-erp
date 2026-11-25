import { addEmployeeFineFiles, validateFineUploadFiles } from '@/lib/hr/employeeFineService';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const formData = await req.formData();
  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: String(formData.get('companyId') ?? ''),
  });
  if (!ctx.ok) return ctx.response;

  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const fileError = validateFineUploadFiles(files);
  if (fileError) return errorResponse(fileError, 400);

  const { id } = await params;
  const result = await addEmployeeFineFiles({ id, companyIds: ctx.companyIds, files });
  if ('error' in result) return errorResponse(result.error, result.status);
  return successResponse({ fine: result.fine, errors: result.errors });
}
