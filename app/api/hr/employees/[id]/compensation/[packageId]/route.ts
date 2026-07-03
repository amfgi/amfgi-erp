import { prisma } from '@/lib/db/prisma';
import {
  canHrCompensationDelete,
  canHrCompensationEdit,
} from '@/lib/hr/compensationPermissions';
import {
  deleteCompensationPackage,
  listCompensationPackages,
  updateCompensationPackage,
} from '@/lib/hr/payroll/compensationPackages';
import { requireCompanySession } from '@/lib/hr/requireCompanySession';
import { resolveRouteEmployeeId } from '@/lib/hr/resolveRouteEmployeeId';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const AllowanceLineSchema = z.object({
  allowanceTypeId: z.string().min(1),
  amount: z.number().min(0),
});

const UpdateSchema = z.object({
  payTypeId: z.string().min(1),
  monthlyBasic: z.number().min(0).optional().nullable(),
  dailyRate: z.number().min(0).optional().nullable(),
  wpsTransferAmount: z.number().min(0).optional().nullable(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  visaPeriodId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  allowances: z.array(AllowanceLineSchema).optional().default([]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; packageId: string }> }
) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId, session } = ctx;
  if (!canHrCompensationEdit(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  const employeeId = await resolveRouteEmployeeId(req, params);
  if (!employeeId) return errorResponse('Employee id required', 400);
  const { packageId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const row = await updateCompensationPackage(prisma, {
      companyId,
      employeeId,
      packageId,
      payTypeId: parsed.data.payTypeId,
      monthlyBasic: parsed.data.monthlyBasic ?? null,
      dailyRate: parsed.data.dailyRate ?? null,
      wpsTransferAmount: parsed.data.wpsTransferAmount ?? null,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo ?? null,
      visaPeriodId: parsed.data.visaPeriodId ?? null,
      notes: parsed.data.notes ?? null,
      allowances: parsed.data.allowances,
    });

    const packages = await listCompensationPackages(companyId, employeeId);
    const updated = packages.find((p) => p.id === row.id) ?? packages[0];
    return successResponse(updated);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Update failed', 400);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; packageId: string }> }
) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId, session } = ctx;
  if (!canHrCompensationDelete(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  const employeeId = await resolveRouteEmployeeId(req, params);
  if (!employeeId) return errorResponse('Employee id required', 400);
  const { packageId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  try {
    await deleteCompensationPackage(prisma, companyId, employeeId, packageId);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Delete failed', 400);
  }
}
