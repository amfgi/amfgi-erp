import {
  createEmployeeFine,
  listEmployeeFines,
  readFineFormFields,
} from '@/lib/hr/employeeFineService';
import { requireHrSession } from '@/lib/hr/requireHrSession';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED']);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status')?.trim().toUpperCase() ?? '';
  const status = STATUSES.has(statusParam)
    ? (statusParam as 'PENDING' | 'APPROVED' | 'REJECTED')
    : null;
  if (statusParam && statusParam !== 'ALL' && !status) {
    return errorResponse('Status must be All, Pending, Approved, or Rejected', 400);
  }

  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;

  const fines = await listEmployeeFines({ companyIds: ctx.companyIds, status });
  return successResponse({ fines });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const companyId = String(formData.get('companyId') ?? '').trim();
  const ctx = await requireHrSession({
    permission: P.HR_PAYROLL_COMPENSATION,
    companyId,
    requireCompanyId: true,
  });
  if (!ctx.ok) return ctx.response;
  if (!ctx.companyId) return errorResponse('companyId is required', 400);

  const fields = readFineFormFields(formData);
  if (!fields.employeeId) return errorResponse('Select an employee', 400);
  if (!fields.description) return errorResponse('Enter a description', 400);
  if (!fields.amount) return errorResponse('Enter a fine amount greater than 0', 400);

  const result = await createEmployeeFine({
    companyId: ctx.companyId,
    employeeId: fields.employeeId,
    description: fields.description,
    amount: fields.amount,
    createdById: ctx.session.user.id ?? null,
    files: fields.files,
  });
  if ('error' in result) return errorResponse(result.error, result.status);
  return successResponse({ fine: result.fine }, 201);
}
