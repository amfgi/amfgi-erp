import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { requestReceiptLineCorrection } from '@/lib/utils/receiptLineCorrection';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CorrectReceiptLinesSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  dryRun: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        batchId: z.string().trim().min(1),
        quantityReceived: z.number().positive().optional(),
        unitCost: z.number().positive().optional(),
        displayQuantity: z.number().positive().optional(),
        displayUnitCost: z.number().positive().optional(),
      })
    )
    .min(1, 'At least one line correction is required'),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ receiptNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canRequest =
    session.user.isSuperAdmin ||
    session.user.permissions.includes('transaction.receipt_correction.request') ||
    session.user.permissions.includes('transaction.stock_in');
  if (!canRequest) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = CorrectReceiptLinesSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const { receiptNumber } = await params;
  const dryRun = parsed.data.dryRun ?? false;

  if (!receiptNumber) {
    return errorResponse('Receipt number is required', 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) =>
      requestReceiptLineCorrection({
        tx,
        companyId,
        receiptNumber,
        reason: parsed.data.reason,
        lines: parsed.data.lines,
        dryRun,
        actor: {
          id: session.user.id ?? null,
          name: session.user.name || session.user.email || session.user.id || null,
        },
      })
    );

    if (!dryRun) {
      publishLiveUpdate({
        companyId,
        channel: 'stock',
        entity: 'receipt',
        action: 'changed',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to request receipt line correction';
    const status =
      message.includes('not found')
        ? 404
        : message.includes('pending correction')
          ? 409
          : 409;
    return errorResponse(message, status);
  }
}
