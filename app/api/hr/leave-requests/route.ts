import { prisma } from '@/lib/db/prisma';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { createLeaveRequest } from '@/lib/hr/leaveRequestService';
import { countLeaveDaysInclusive } from '@/lib/hr/leaveTypes';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import {
  companyIdWhere,
  requireHrSession,
  resolveHrWriteCompanyId,
} from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const companySelect = { id: true, name: true, slug: true } as const;

const CreateSchema = z.object({
  companyId: z.string().min(1).optional(),
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(2000).optional(),
  autoApprove: z.boolean().optional(),
  reviewNote: z.string().max(2000).optional(),
  allowInsufficientBalance: z.boolean().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');

  const canPreviewForAttendance = Boolean(workDateRaw) || (Boolean(fromRaw) && Boolean(toRaw));

  const permOrder = canPreviewForAttendance
    ? [
        P.HR_LEAVE_VIEW,
        P.HR_LEAVE_APPROVE,
        P.HR_LEAVE_EDIT,
        P.HR_LEAVE_DELETE,
        P.HR_ATTENDANCE_VIEW,
        P.HR_ATTENDANCE_EDIT,
      ]
    : [P.HR_LEAVE_VIEW, P.HR_LEAVE_APPROVE, P.HR_LEAVE_EDIT, P.HR_LEAVE_DELETE];

  let ctx: Awaited<ReturnType<typeof requireHrSession>> | null = null;
  for (const permission of permOrder) {
    const attempt = await requireHrSession({
      permission,
      companyId: searchParams.get('companyId'),
    });
    ctx = attempt;
    if (attempt.ok) break;
  }
  if (!ctx?.ok) return ctx?.response ?? errorResponse('Forbidden', 403);
  const { companyIds } = ctx;

  const status = searchParams.get('status');
  const employeeId = searchParams.get('employeeId');

  let workDateFilter: { startDate?: { lte: Date }; endDate?: { gte: Date } } = {};
  if (workDateRaw) {
    try {
      const d = dateFromYmd(ymdFromInput(workDateRaw));
      workDateFilter = { startDate: { lte: d }, endDate: { gte: d } };
    } catch {
      return errorResponse('Invalid workDate', 400);
    }
  } else if (fromRaw && toRaw) {
    try {
      const from = dateFromYmd(ymdFromInput(fromRaw));
      const to = dateFromYmd(ymdFromInput(toRaw));
      workDateFilter = { startDate: { lte: to }, endDate: { gte: from } };
    } catch {
      return errorResponse('Invalid from/to date', 400);
    }
  }

  const rows = await prisma.leaveRequest.findMany({
    where: {
      ...companyIdWhere(companyIds),
      ...workDateFilter,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      company: { select: companySelect },
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
      reviewedBy: { select: { id: true, name: true } },
      leaveTypeRef: { select: { id: true, name: true, code: true, rules: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });

  for (const companyId of companyIds) {
    await ensureLeaveTypesReady(prisma, companyId);
  }

  const balanceCache = new Map<string, Awaited<ReturnType<typeof getOrCreateLeaveBalance>>>();
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const cacheKey = `${row.companyId}:${row.employeeId}`;
      let balance = balanceCache.get(cacheKey);
      if (!balance) {
        balance = await getOrCreateLeaveBalance(prisma, row.companyId, row.employeeId);
        balanceCache.set(cacheKey, balance);
      }
      return {
        ...row,
        dayCount: countLeaveDaysInclusive(row.startDate, row.endDate),
        balance: {
          entitlementDays: Number(balance.entitlementDays),
          usedDays: Number(balance.usedDays),
          adjustedDays: Number(balance.adjustedDays),
          remainingDays: remainingLeaveDays(balance),
        },
      };
    })
  );

  return successResponse(enriched);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const ctx = await requireHrSession({ permission: P.HR_LEAVE_APPROVE });
  if (!ctx.ok) return ctx.response;
  const { session } = ctx;

  const companyId = resolveHrWriteCompanyId({
    requestedCompanyId: parsed.data.companyId,
    activeCompanyId: ctx.session.user.activeCompanyId,
  });
  if (!companyId || !ctx.companyIds.includes(companyId)) {
    return errorResponse('companyId is required', 400);
  }

  try {
    const row = await createLeaveRequest(prisma, {
      companyId,
      employeeId: parsed.data.employeeId,
      leaveTypeId: parsed.data.leaveTypeId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      reason: parsed.data.reason,
      status: 'PENDING',
    });

    if (parsed.data.autoApprove) {
      const { approveLeaveRequest } = await import('@/lib/hr/leaveRequestService');
      await approveLeaveRequest(prisma, {
        companyId,
        requestId: row.id,
        reviewerId: session.user.id,
        reviewNote: parsed.data.reviewNote,
        allowInsufficientBalance: parsed.data.allowInsufficientBalance,
      });
    }

    const created = await prisma.leaveRequest.findFirst({
      where: { id: row.id, ...companyIdWhere([companyId]) },
      include: {
        company: { select: companySelect },
        employee: {
          select: { id: true, fullName: true, preferredName: true, employeeCode: true },
        },
        reviewedBy: { select: { id: true, name: true } },
        leaveTypeRef: { select: { id: true, name: true, code: true } },
      },
    });
    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to create leave request', 422);
  }
}
