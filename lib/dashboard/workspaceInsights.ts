import type { EmployeeStatus, JobStatus } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { employeeDocumentDisplayName } from '@/lib/hr/employeeDocumentDisplay';
import { P } from '@/lib/permissions';
import { canViewJobsListApi } from '@/lib/permissions/stockModuleAccess';
import { nullableDecimalToNumber } from '@/lib/utils/decimal';

type SessionLike = {
  isSuperAdmin?: boolean;
  permissions?: string[];
};

function hasPerm(user: SessionLike, key: string) {
  return Boolean(user.isSuperAdmin) || (user.permissions ?? []).includes(key);
}

function canViewHrCalendar(user: SessionLike) {
  return (
    hasPerm(user, P.HR_EMPLOYEE_VIEW) ||
    hasPerm(user, P.HR_ATTENDANCE_VIEW) ||
    hasPerm(user, P.HR_SCHEDULE_VIEW)
  );
}

function utcTodayStart() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function addUtcDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ymdFromDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysUntil(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export interface WorkspaceJobSummary {
  id: string;
  jobNumber: string;
  customerName: string | null;
  site: string | null;
  status: JobStatus;
  executionProgressPercent: number | null;
  executionProgressStatus: string | null;
}

export interface WorkspaceJobInsights {
  counts: Record<JobStatus, number>;
  activeTotal: number;
  activeJobs: WorkspaceJobSummary[];
}

export interface WorkspaceEmployeeJoinRow {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  designation: string | null;
  hireDate: string;
}

export interface WorkspaceEmployeeOffboardingRow {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  status: Extract<EmployeeStatus, 'SUSPENDED' | 'EXITED'>;
  terminationDate: string | null;
  updatedAt: string;
}

export interface WorkspaceHolidayRow {
  id: string;
  holidayDate: string;
  name: string;
  isPaid: boolean;
}

export interface WorkspaceExpiringDocumentRow {
  id: string;
  displayName: string;
  documentNumber: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
  };
}

export interface WorkspaceHrInsights {
  recentJoins: WorkspaceEmployeeJoinRow[];
  recentOffboarding: WorkspaceEmployeeOffboardingRow[];
  upcomingHolidays: WorkspaceHolidayRow[];
  expiringDocuments: WorkspaceExpiringDocumentRow[];
}

export interface WorkspaceDashboardInsights {
  jobs?: WorkspaceJobInsights;
  hr?: WorkspaceHrInsights;
}

const EMPTY_JOB_COUNTS: Record<JobStatus, number> = {
  ACTIVE: 0,
  ON_HOLD: 0,
  COMPLETED: 0,
  CANCELLED: 0,
};

export async function loadWorkspaceDashboardInsights(
  companyId: string,
  user: SessionLike,
): Promise<WorkspaceDashboardInsights> {
  const result: WorkspaceDashboardInsights = {};
  const today = utcTodayStart();

  if (canViewJobsListApi(user.permissions ?? [], Boolean(user.isSuperAdmin))) {
    const parentWhere = { companyId, parentJobId: null };

    const [statusGroups, activeJobs] = await Promise.all([
      prisma.job.groupBy({
        by: ['status'],
        where: parentWhere,
        _count: { _all: true },
      }),
      prisma.job.findMany({
        where: { ...parentWhere, status: 'ACTIVE' },
        orderBy: [{ updatedAt: 'desc' }],
        take: 8,
        select: {
          id: true,
          jobNumber: true,
          site: true,
          status: true,
          executionProgressPercent: true,
          executionProgressStatus: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    const counts = { ...EMPTY_JOB_COUNTS };
    for (const row of statusGroups) {
      counts[row.status] = row._count._all;
    }

    result.jobs = {
      counts,
      activeTotal: counts.ACTIVE,
      activeJobs: activeJobs.map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        customerName: job.customer?.name ?? null,
        site: job.site,
        status: job.status,
        executionProgressPercent: nullableDecimalToNumber(job.executionProgressPercent),
        executionProgressStatus: job.executionProgressStatus,
      })),
    };
  }

  const canViewEmployees = hasPerm(user, P.HR_EMPLOYEE_VIEW);
  const canViewDocuments = hasPerm(user, P.HR_DOCUMENT_VIEW);
  const canViewCalendar = canViewHrCalendar(user);

  if (canViewEmployees || canViewDocuments || canViewCalendar) {
    const hr: WorkspaceHrInsights = {
      recentJoins: [],
      recentOffboarding: [],
      upcomingHolidays: [],
      expiringDocuments: [],
    };

    const loaders: Promise<void>[] = [];

    if (canViewEmployees) {
      loaders.push(
        (async () => {
          const [recentJoins, recentOffboarding] = await Promise.all([
            prisma.employee.findMany({
              where: { companyId, hireDate: { not: null } },
              orderBy: { hireDate: 'desc' },
              take: 8,
              select: {
                id: true,
                employeeCode: true,
                fullName: true,
                preferredName: true,
                designation: true,
                hireDate: true,
              },
            }),
            prisma.employee.findMany({
              where: { companyId, status: { in: ['SUSPENDED', 'EXITED'] } },
              orderBy: { updatedAt: 'desc' },
              take: 8,
              select: {
                id: true,
                employeeCode: true,
                fullName: true,
                preferredName: true,
                status: true,
                terminationDate: true,
                updatedAt: true,
              },
            }),
          ]);

          hr.recentJoins = recentJoins
            .filter((row) => row.hireDate)
            .map((row) => ({
              id: row.id,
              employeeCode: row.employeeCode,
              fullName: row.fullName,
              preferredName: row.preferredName,
              designation: row.designation,
              hireDate: ymdFromDate(row.hireDate!),
            }));

          hr.recentOffboarding = recentOffboarding.map((row) => ({
            id: row.id,
            employeeCode: row.employeeCode,
            fullName: row.fullName,
            preferredName: row.preferredName,
            status: row.status as Extract<EmployeeStatus, 'SUSPENDED' | 'EXITED'>,
            terminationDate: row.terminationDate ? ymdFromDate(row.terminationDate) : null,
            updatedAt: row.updatedAt.toISOString(),
          }));
        })(),
      );
    }

    if (canViewCalendar) {
      loaders.push(
        (async () => {
          const horizon = addUtcDays(today, 120);
          const holidays = await prisma.companyHoliday.findMany({
            where: {
              companyId,
              holidayDate: { gte: today, lte: horizon },
            },
            orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
            take: 10,
            select: {
              id: true,
              holidayDate: true,
              name: true,
              isPaid: true,
            },
          });

          hr.upcomingHolidays = holidays.map((row) => ({
            id: row.id,
            holidayDate: ymdFromDate(row.holidayDate),
            name: row.name,
            isPaid: row.isPaid,
          }));
        })(),
      );
    }

    if (canViewDocuments) {
      loaders.push(
        (async () => {
          const end = addUtcDays(today, 60);
          const docs = await prisma.employeeDocument.findMany({
            where: {
              companyId,
              expiryDate: { not: null, gte: today, lte: end },
            },
            include: {
              employee: { select: { id: true, fullName: true, employeeCode: true } },
              documentType: { select: { name: true, slug: true } },
            },
            orderBy: { expiryDate: 'asc' },
            take: 10,
          });

          hr.expiringDocuments = docs
            .filter((doc) => doc.expiryDate)
            .map((doc) => ({
              id: doc.id,
              displayName: employeeDocumentDisplayName(doc),
              documentNumber: doc.documentNumber,
              expiryDate: ymdFromDate(doc.expiryDate!),
              daysUntilExpiry: daysUntil(today, doc.expiryDate!),
              employee: doc.employee,
            }));
        })(),
      );
    }

    await Promise.all(loaders);
    result.hr = hr;
  }

  return result;
}
