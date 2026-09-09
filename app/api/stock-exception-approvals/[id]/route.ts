import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { buildStockCountSessionSnapshot } from '@/lib/utils/stockCountSessionServer';
import {
  applyManualStockAdjustmentApproval,
  type ManualStockAdjustmentLinePayload,
} from '@/lib/utils/manualStockAdjustmentExecution';
import {
  validateManualStockAdjustmentRequest,
} from '@/lib/utils/manualStockAdjustmentPolicy';
import {
  applyReceiptLineCorrections,
  type ReceiptLineCorrectionInput,
} from '@/lib/utils/receiptLineCorrection';
import { readStockControlSettingsFromCompanySettings } from '@/lib/stock-control/settings';
import { z } from 'zod';

const PatchSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  decisionNote: z.string().trim().max(500).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const { id } = await params;
  const actorName = session.user.name || session.user.email || session.user.id || null;

  try {
    const existing = await prisma.stockExceptionApproval.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!existing) return errorResponse('Stock exception approval not found', 404);
    if (existing.status !== 'PENDING') {
      return errorResponse('Only pending stock exception approvals can be updated', 409);
    }

    const canApproveReceiptCorrection =
      session.user.isSuperAdmin ||
      session.user.permissions.includes('transaction.receipt_correction.approve');

    if (existing.exceptionType === 'RECEIPT_LINE_CORRECTION') {
      if (!canApproveReceiptCorrection) {
        return errorResponse('You do not have permission to approve receipt line corrections', 403);
      }
    } else if (!session.user.isSuperAdmin) {
      return errorResponse('Only super admins can approve stock exceptions', 403);
    }

    if (
      parsed.data.status === 'APPROVED' &&
      existing.exceptionType === 'RECEIPT_LINE_CORRECTION'
    ) {
      const payload = existing.payload as {
        receiptNumber?: string;
        inputLines?: ReceiptLineCorrectionInput[];
        lines?: Array<{ batchId: string; after?: { quantityReceived?: number; unitCost?: number } }>;
      } | null;

      const receiptNumber = payload?.receiptNumber || existing.referenceNumber;
      if (!receiptNumber) {
        throw new Error('Receipt number is missing from the correction request');
      }

      const inputLines: ReceiptLineCorrectionInput[] = payload?.inputLines?.length
        ? payload.inputLines
        : (payload?.lines ?? []).map((line) => ({
            batchId: line.batchId,
            quantityReceived: line.after?.quantityReceived,
            unitCost: line.after?.unitCost,
            displayQuantity: line.after?.quantityReceived,
            displayUnitCost: line.after?.unitCost,
          }));

      if (!inputLines.length) {
        throw new Error('Receipt line correction payload is missing');
      }

      await prisma.$transaction(async (tx) =>
        applyReceiptLineCorrections({
          tx,
          companyId,
          receiptNumber,
          reason: existing.reason,
          lines: inputLines,
          approvalId: existing.id,
          actor: {
            id: session.user.id ?? null,
            name: actorName,
            isSuperAdmin: session.user.isSuperAdmin,
          },
          decidedBy: {
            id: session.user.id ?? null,
            name: actorName,
          },
          decisionNote: parsed.data.decisionNote || 'Approved receipt line correction.',
        })
      );

      publishLiveUpdate({
        companyId,
        channel: 'stock',
        entity: 'receipt',
        action: 'changed',
      });

      const updatedApproval = await prisma.stockExceptionApproval.findUnique({ where: { id } });
      return successResponse({
        id: updatedApproval?.id ?? id,
        status: updatedApproval?.status ?? 'APPROVED',
        decidedById: updatedApproval?.decidedById ?? null,
        decidedByName: updatedApproval?.decidedByName ?? null,
        decidedAt: updatedApproval?.decidedAt?.toISOString() ?? null,
        decisionNote: updatedApproval?.decisionNote ?? null,
      });
    }

    const decidedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      let appliedTransactionId: string | null = null;
      let appliedTransactionIds: string[] = [];
      let policySummary:
        | {
            positiveLineCount: number;
            negativeLineCount: number;
            highEvidenceNegativeLineCount: number;
            largestNegativeQty: number;
            requiresEnhancedEvidence: boolean;
            requiresDecisionNote: boolean;
          }
        | null = null;

      if (parsed.data.status === 'APPROVED' && existing.exceptionType === 'MANUAL_STOCK_ADJUSTMENT') {
        const payload = existing.payload as {
          lines?: ManualStockAdjustmentLinePayload[];
          notes?: string | null;
          evidenceType?: 'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER';
          evidenceNotes?: string | null;
          sourceType?: string | null;
          sourceSessionId?: string | null;
          appliedTransactionIds?: string[];
        } | null;
        const companySettings = await tx.company.findUnique({
          where: { id: companyId },
          select: { jobCostingSettings: true },
        });
        const stockControlSettings = readStockControlSettingsFromCompanySettings(companySettings?.jobCostingSettings);
        if (!payload?.lines?.length) {
          throw new Error('Manual stock adjustment payload is missing');
        }

        policySummary = validateManualStockAdjustmentRequest({
          lines: payload.lines,
          evidenceType: payload.evidenceType ?? 'OTHER',
          evidenceNotes: payload.evidenceNotes ?? null,
          settings: stockControlSettings,
        });
        if (policySummary.requiresDecisionNote && !parsed.data.decisionNote?.trim()) {
          throw new Error(
            `Negative adjustments of ${stockControlSettings.negativeDecisionNoteQtyThreshold.toFixed(0)} or more require an approval decision note.`
          );
        }

        for (const line of payload.lines) {
          const transaction = await applyManualStockAdjustmentApproval({
            tx,
            companyId,
            approvalId: existing.referenceId,
            reason: existing.reason,
            payload: line,
            requestNotes: payload.notes ?? null,
            actor: buildTransactionActorFields(session.user),
            appliedAt: decidedAt,
          });
          appliedTransactionIds.push(transaction.id);
        }
        appliedTransactionId = appliedTransactionIds[0] ?? null;
      }

      const updatedApproval = await tx.stockExceptionApproval.update({
        where: { id },
        data: {
          status: parsed.data.status,
          decidedById: session.user.id ?? null,
          decidedByName: actorName,
          decidedAt,
          decisionNote: parsed.data.decisionNote || null,
          payload:
            appliedTransactionId && existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
              ? {
                  ...(existing.payload as Record<string, unknown>),
                  appliedTransactionId,
                  appliedTransactionIds,
                  policySummary,
                }
              : existing.payload ?? undefined,
        },
      });

      const payloadSource = existing.payload as {
        sourceType?: string | null;
        sourceSessionId?: string | null;
      } | null;
      if (
        existing.exceptionType === 'MANUAL_STOCK_ADJUSTMENT' &&
        payloadSource?.sourceType === 'STOCK_COUNT_SESSION' &&
        payloadSource.sourceSessionId
      ) {
        const sessionRow = await tx.stockCountSession.findUnique({
          where: { id: payloadSource.sourceSessionId },
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        });

        if (sessionRow) {
          const nextStatus = parsed.data.status === 'APPROVED' ? 'ADJUSTMENT_APPROVED' : 'ADJUSTMENT_REJECTED';
          const nextRevision = sessionRow.currentRevision + 1;
          const updatedSession = await tx.stockCountSession.update({
            where: { id: sessionRow.id },
            data: {
              status: nextStatus,
              currentRevision: nextRevision,
              reviewedById: session.user.id ?? null,
              reviewedByName: actorName,
              reviewedAt: decidedAt,
              linkedAdjustmentApprovalId: updatedApproval.id,
              linkedAdjustmentReferenceNumber:
                updatedApproval.referenceNumber ?? updatedApproval.referenceId,
            },
            include: {
              lines: { orderBy: { sortOrder: 'asc' } },
            },
          });

          await tx.stockCountSessionRevision.create({
            data: {
              sessionId: updatedSession.id,
              revisionNumber: nextRevision,
              action: parsed.data.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
              savedById: session.user.id ?? null,
              savedByName: actorName,
              snapshot: buildStockCountSessionSnapshot({
                title: updatedSession.title,
                warehouseId: updatedSession.warehouseId,
                evidenceReference: updatedSession.evidenceReference,
                evidenceNotes: updatedSession.evidenceNotes,
                notes: updatedSession.notes,
                status: updatedSession.status,
                lines: updatedSession.lines.map((line) => ({
                  materialId: line.materialId,
                  materialName: line.materialName,
                  unit: line.unit,
                  warehouseId: line.warehouseId,
                  systemQty: Number(line.systemQty),
                  countedQty: line.countedQty == null ? null : Number(line.countedQty),
                  varianceQty: Number(line.varianceQty),
                  unitCost: Number(line.unitCost),
                  sortOrder: line.sortOrder,
                })),
              }),
            },
          });
        }
      }

      return updatedApproval;
    });

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'stock-exception-approval',
      action: 'changed',
    });

    return successResponse({
      id: updated.id,
      status: updated.status,
      decidedById: updated.decidedById,
      decidedByName: updated.decidedByName,
      decidedAt: updated.decidedAt?.toISOString() ?? null,
      decisionNote: updated.decisionNote,
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to update stock exception approval',
      500
    );
  }
}
