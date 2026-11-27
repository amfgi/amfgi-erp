import { prisma } from '@/lib/db/prisma';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { createLeaveRequest } from '@/lib/hr/leaveRequestService';
import { addCalendarDays, assessLeaveReturn, dubaiTodayYmd } from '@/lib/hr/leaveReturn';
import { countLeaveDaysInclusive } from '@/lib/hr/leaveTypes';
import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';
import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';
import { resolveCompensationPackageForDate } from '@/lib/hr/payroll/resolveCompensationForPayroll';
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

const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
const LEAVE_SORTS = ['submitted', 'startDesc', 'startAsc'] as const;

function ymdFromDb(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

const emptyReturn = { returnDate: null, returnResult: null, extraDays: null };

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
  if (status && !LEAVE_STATUSES.includes(status as (typeof LEAVE_STATUSES)[number])) {
    return errorResponse('Invalid status', 400);
  }
  const sort = searchParams.get('sort') || 'submitted';
  if (!LEAVE_SORTS.includes(sort as (typeof LEAVE_SORTS)[number])) {
    return errorResponse('Invalid sort', 400);
  }
  const employeeId = searchParams.get('employeeId');
  const leaveTypeId = searchParams.get('leaveTypeId')?.trim() || '';
  const includeReturn = searchParams.get('includeReturn') === '1';

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
      if (from.getTime() > to.getTime()) {
        return errorResponse('From date must be on or before the to date', 400);
      }
      workDateFilter = { startDate: { lte: to }, endDate: { gte: from } };
    } catch {
      return errorResponse('Invalid from/to date', 400);
    }
  }

  const orderBy =
    sort === 'startDesc'
      ? { startDate: 'desc' as const }
      : sort === 'startAsc'
        ? { startDate: 'asc' as const }
        : { submittedAt: 'desc' as const };

  const rows = await prisma.leaveRequest.findMany({
    where: {
      ...companyIdWhere(companyIds),
      ...workDateFilter,
      ...(status ? { status: status as (typeof LEAVE_STATUSES)[number] } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(leaveTypeId ? { leaveTypeId } : {}),
    },
    include: {
      company: { select: companySelect },
      employee: {
        select: { id: true, fullName: true, preferredName: true, employeeCode: true },
      },
      reviewedBy: { select: { id: true, name: true } },
      leaveTypeRef: { select: { id: true, name: true, code: true, rules: true } },
    },
    orderBy,
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

  if (!includeReturn) return successResponse(enriched);

  const today = dubaiTodayYmd();
  const approved = enriched.filter((row) => row.status === 'APPROVED' && ymdFromDb(row.endDate) < today);
  if (approved.length === 0) {
    return successResponse(enriched.map((row) => ({ ...row, ...assessLeaveReturn({
      status: row.status,
      endDate: ymdFromDb(row.endDate),
      today,
      attendance: [],
    }) })));
  }

  const employeeIds = [...new Set(approved.map((row) => row.employeeId))];
  const from = addCalendarDays(
    approved.map((row) => ymdFromDb(row.endDate)).sort()[0] ?? today,
    1
  );
  const scope = companyIdWhere(companyIds);
  const [attendanceRows, compensationRows, otherLeaveRows] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: {
        ...scope,
        employeeId: { in: employeeIds },
        workDate: { gte: dateFromYmd(from), lte: dateFromYmd(today) },
      },
      select: { companyId: true, employeeId: true, workDate: true, status: true },
    }),
    prisma.employeeCompensation.findMany({
      where: { ...scope, employeeId: { in: employeeIds } },
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        payType: { select: { config: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        ...scope,
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: dateFromYmd(today) },
        endDate: { gte: dateFromYmd(from) },
      },
      select: { id: true, companyId: true, employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  const attendanceByEmployee = new Map<string, Array<{ workDate: string; status: string }>>();
  for (const row of attendanceRows) {
    const key = `${row.companyId}:${row.employeeId}`;
    const list = attendanceByEmployee.get(key) ?? [];
    list.push({ workDate: ymdFromDb(row.workDate), status: row.status });
    attendanceByEmployee.set(key, list);
  }

  const packagesByEmployee = new Map<string, typeof compensationRows>();
  for (const row of compensationRows) {
    const key = `${row.companyId}:${row.employeeId}`;
    const list = packagesByEmployee.get(key) ?? [];
    list.push(row);
    packagesByEmployee.set(key, list);
  }

  const leaveByEmployee = new Map<string, Array<{ id: string; startDate: string; endDate: string }>>();
  for (const row of otherLeaveRows) {
    const key = `${row.companyId}:${row.employeeId}`;
    const list = leaveByEmployee.get(key) ?? [];
    list.push({ id: row.id, startDate: ymdFromDb(row.startDate), endDate: ymdFromDb(row.endDate) });
    leaveByEmployee.set(key, list);
  }

  const excludedCache = new Map<string, number[]>();
  const withReturn = enriched.map((row) => {
    if (row.status !== 'APPROVED') return { ...row, ...emptyReturn };
    const key = `${row.companyId}:${row.employeeId}`;
    const packages = packagesByEmployee.get(key) ?? [];
    return {
      ...row,
      ...assessLeaveReturn({
        status: row.status,
        endDate: ymdFromDb(row.endDate),
        today,
        attendance: attendanceByEmployee.get(key) ?? [],
        otherApprovedLeave: (leaveByEmployee.get(key) ?? []).filter((leave) => leave.id !== row.id),
        excludedWeekdaysForDate: (workDate) => {
          const active = resolveCompensationPackageForDate(packages, workDate);
          const cacheKey = active ? active.id : `${key}:none`;
          const cached = excludedCache.get(cacheKey);
          if (cached) return cached;
          let excluded = [0];
          if (active) {
            try {
              excluded = resolveExcludedWeekdays(parsePayTypeConfig(active.payType.config));
            } catch {
              excluded = [0];
            }
          }
          excludedCache.set(cacheKey, excluded);
          return excluded;
        },
      }),
    };
  });

  return successResponse(withReturn);
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
