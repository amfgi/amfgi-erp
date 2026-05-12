import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  workDate: z.string().min(1),
  /** Allow finalizing a day that has no progress entries (e.g. holiday / no work). */
  allowEmpty: z.boolean().optional().default(false),
});

/**
 * Finalize the quantity log for a calendar day. After this, new progress entries
 * cannot be created for that date (edits to existing rows still allowed).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.JOB_EDIT)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(parsed.data.workDate);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const existing = await prisma.quantityLogDaySubmission.findUnique({
    where: { companyId_workDate: { companyId, workDate } },
  });
  if (existing) {
    return errorResponse('This day is already finalized', 409);
  }

  if (!parsed.data.allowEmpty) {
    const entryCount = await prisma.jobItemProgressEntry.count({
      where: { companyId, entryDate: workDate },
    });
    if (entryCount === 0) {
      return errorResponse('Log at least one quantity for this day before finalizing.', 422);
    }
  }

  await prisma.quantityLogDaySubmission.create({
    data: {
      companyId,
      workDate,
      submittedById: session.user.id,
    },
  });

  return successResponse({ ok: true }, 201);
}

/** Remove the finalization lock so jobs or new entries can be added again. */
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
  if (!workDateRaw) return errorResponse('workDate is required', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  const deleted = await prisma.quantityLogDaySubmission.deleteMany({
    where: {
      companyId,
      workDate: dateFromYmd(workDateYmd),
    },
  });

  return successResponse({ unlocked: deleted.count > 0 });
}
