import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const dateStr = searchParams.get('date');

  if (!jobId || !dateStr || !DATE_KEY.test(dateStr)) {
    return errorResponse('jobId and date (YYYY-MM-DD) are required', 400);
  }

  try {
    const companyId = session.user.activeCompanyId;
    const jobOk = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: { id: true },
    });
    if (!jobOk) return errorResponse('Job not found', 404);

    const rows = await prisma.dispatchEntryRevision.findMany({
      where: {
        companyId,
        jobId,
        postingDateKey: dateStr,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        postingDateKey: true,
        source: true,
        action: true,
        actorUserId: true,
        actorName: true,
        linesBefore: true,
        linesAfter: true,
        changeSummary: true,
        notesSnippet: true,
        createdAt: true,
      },
    });

    return successResponse({ revisions: rows });
  } catch (err) {
    console.error('Dispatch entry revisions error:', err);
    return errorResponse('Failed to load revision history', 500);
  }
}
