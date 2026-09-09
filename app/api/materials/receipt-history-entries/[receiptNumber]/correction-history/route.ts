import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    !session.user.permissions.includes('transaction.stock_in') &&
    !session.user.permissions.includes('transaction.receipt_correction.request') &&
    !session.user.permissions.includes('transaction.receipt_correction.approve') &&
    !session.user.permissions.includes('report.view')
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;
  if (!receiptNumber) return errorResponse('Receipt number is required', 400);

  try {
    const rows = await prisma.stockExceptionApproval.findMany({
      where: {
        companyId,
        referenceNumber: receiptNumber,
        OR: [
          { exceptionType: 'RECEIPT_LINE_CORRECTION' },
          {
            exceptionType: 'RECEIPT_ADJUSTMENT',
            referenceId: { contains: 'line-correction' },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse({
      receiptNumber,
      rows: rows.map((row) => ({
        id: row.id,
        exceptionType: row.exceptionType,
        status: row.status,
        reason: row.reason,
        payload: row.payload,
        createdByName: row.createdByName,
        createdAt: row.createdAt,
        decidedByName: row.decidedByName,
        decidedAt: row.decidedAt,
        decisionNote: row.decisionNote,
      })),
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load receipt correction history',
      500
    );
  }
}
