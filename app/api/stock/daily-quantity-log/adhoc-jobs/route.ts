import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  workDate: z.string().min(1),
});

/** Attach a company job to the quantity log for a calendar day without editing the HR schedule. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const parsed = BodySchema.extend({
    jobId: z.string().min(1),
  }).safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const existingLock = await prisma.quantityLogDaySubmission.findUnique({
    where: { companyId_workDate: { companyId, workDate } },
    select: { id: true },
  });
  if (existingLock) {
    return errorResponse('This day is finalized; remove the lock before changing job list.', 403);
  }

  const job = await prisma.job.findFirst({
    where: { id: parsed.data.jobId, companyId },
    select: { id: true },
  });
  if (!job) return errorResponse('Job not found', 404);

  await prisma.quantityLogAdhocJob.upsert({
    where: {
      companyId_workDate_jobId: {
        companyId,
        workDate,
        jobId: parsed.data.jobId,
      },
    },
    create: {
      companyId,
      workDate,
      jobId: parsed.data.jobId,
      createdById: session.user.id,
    },
    update: {},
  });

  return successResponse({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  const jobId = searchParams.get('jobId');
  if (!workDateRaw || !jobId) return errorResponse('workDate and jobId are required', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const existingLock = await prisma.quantityLogDaySubmission.findUnique({
    where: { companyId_workDate: { companyId, workDate } },
    select: { id: true },
  });
  if (existingLock) {
    return errorResponse('This day is finalized; cannot remove ad-hoc jobs.', 403);
  }

  await prisma.quantityLogAdhocJob.deleteMany({
    where: { companyId, workDate, jobId },
  });

  return successResponse({ deleted: true });
}
