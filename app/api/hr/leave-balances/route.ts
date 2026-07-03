import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import {
  applyLeaveBalanceAdjustment,
  getOrCreateLeaveBalance,
  listLeaveBalances,
  recalculateLeaveBalanceEntitlement,
  remainingLeaveDays,
} from '@/lib/hr/leaveBalance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpsertSchema = z.object({
  employeeId: z.string().min(1),
  entitlementDays: z.number().min(0).max(3650).optional(),
  adjustedDays: z.number().min(-365).max(365).optional(),
  adjustmentDelta: z.number().min(-365).max(365).optional(),
  recalculateEntitlement: z.boolean().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_LEAVE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get('employeeId') ?? undefined;
  const includeAllEmployees = searchParams.get('includeAllEmployees') === '1';

  const rows = await listLeaveBalances(prisma, companyId, {
    employeeId,
    includeAllEmployees,
  });

  return successResponse(rows);
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_LEAVE_APPROVE)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { employeeId, entitlementDays, adjustedDays, adjustmentDelta, recalculateEntitlement } =
    parsed.data;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true },
  });
  if (!employee) return errorResponse('Employee not found', 404);

  let balance;
  if (recalculateEntitlement) {
    balance = await recalculateLeaveBalanceEntitlement(prisma, companyId, employeeId);
  } else if (adjustmentDelta != null) {
    balance = await applyLeaveBalanceAdjustment(prisma, companyId, employeeId, adjustmentDelta);
  } else if (entitlementDays != null) {
    const existing = await getOrCreateLeaveBalance(prisma, companyId, employeeId);
    balance = await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: {
        entitlementDays,
        ...(adjustedDays !== undefined ? { adjustedDays } : {}),
      },
    });
  } else if (adjustedDays !== undefined) {
    const existing = await getOrCreateLeaveBalance(prisma, companyId, employeeId);
    balance = await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: { adjustedDays },
    });
  } else {
    return errorResponse(
      'Provide entitlementDays, adjustedDays, adjustmentDelta, or recalculateEntitlement',
      422,
    );
  }

  const [row] = await listLeaveBalances(prisma, companyId, {
    employeeId,
    includeAllEmployees: true,
  });
  if (row) {
    return successResponse({
      ...row,
      remainingDays: remainingLeaveDays(balance),
    });
  }

  return successResponse({
    ...balance,
    remainingDays: remainingLeaveDays(balance),
  });
}
