const RECEIPT_CANCELLED_AT_PREFIX = '[RECEIPT_CANCELLED_AT:';
const RECEIPT_CANCEL_REASON_PREFIX = '[RECEIPT_CANCEL_REASON:';
const RECEIPT_ADJUSTED_AT_PREFIX = '[RECEIPT_ADJUSTED_AT:';
const RECEIPT_ADJUST_REASON_PREFIX = '[RECEIPT_ADJUST_REASON:';
const RECEIPT_CORRECTED_AT_PREFIX = '[RECEIPT_CORRECTED_AT:';
const RECEIPT_CORRECT_REASON_PREFIX = '[RECEIPT_CORRECT_REASON:';

function sanitizeReason(reason?: string | null) {
  return (reason ?? '').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();
}

export function buildReceiptCancellationNotes(
  existingNotes: string | null | undefined,
  cancelledAtIso: string,
  reason?: string | null
) {
  const parts = [existingNotes?.trim(), `${RECEIPT_CANCELLED_AT_PREFIX}${cancelledAtIso}]`];
  const sanitizedReason = sanitizeReason(reason);
  if (sanitizedReason) {
    parts.push(`${RECEIPT_CANCEL_REASON_PREFIX}${sanitizedReason}]`);
  }
  return parts.filter(Boolean).join('\n');
}

export function parseReceiptCancellationMetadata(notes: string | null | undefined) {
  const text = (notes ?? '').trim();
  const cancelledAtMatch = text.match(/\[RECEIPT_CANCELLED_AT:([^\]]+)\]/);
  const reasonMatch = text.match(/\[RECEIPT_CANCEL_REASON:([^\]]+)\]/);

  return {
    isCancelled: Boolean(cancelledAtMatch),
    cancelledAt: cancelledAtMatch?.[1] ?? null,
    cancellationReason: reasonMatch?.[1] ?? null,
  };
}

export function buildReceiptAdjustmentNotes(
  existingNotes: string | null | undefined,
  adjustedAtIso: string,
  reason: string
) {
  const parts = [existingNotes?.trim(), `${RECEIPT_ADJUSTED_AT_PREFIX}${adjustedAtIso}]`];
  const sanitizedReason = sanitizeReason(reason);
  if (sanitizedReason) {
    parts.push(`${RECEIPT_ADJUST_REASON_PREFIX}${sanitizedReason}]`);
  }
  return parts.filter(Boolean).join('\n');
}

export function parseReceiptAdjustmentMetadata(notes: string | null | undefined) {
  const text = (notes ?? '').trim();
  const adjustedAtMatch = text.match(/\[RECEIPT_ADJUSTED_AT:([^\]]+)\]/);
  const reasonMatch = text.match(/\[RECEIPT_ADJUST_REASON:([^\]]+)\]/);

  return {
    isAdjusted: Boolean(adjustedAtMatch),
    adjustedAt: adjustedAtMatch?.[1] ?? null,
    adjustmentReason: reasonMatch?.[1] ?? null,
  };
}

export function buildReceiptCorrectionNotes(
  existingNotes: string | null | undefined,
  correctedAtIso: string,
  reason: string
) {
  const parts = [existingNotes?.trim(), `${RECEIPT_CORRECTED_AT_PREFIX}${correctedAtIso}]`];
  const sanitizedReason = sanitizeReason(reason);
  if (sanitizedReason) {
    parts.push(`${RECEIPT_CORRECT_REASON_PREFIX}${sanitizedReason}]`);
  }
  return parts.filter(Boolean).join('\n');
}

export function parseReceiptCorrectionMetadata(notes: string | null | undefined) {
  const text = (notes ?? '').trim();
  const correctedAtMatch = text.match(/\[RECEIPT_CORRECTED_AT:([^\]]+)\]/);
  const reasonMatch = text.match(/\[RECEIPT_CORRECT_REASON:([^\]]+)\]/);

  return {
    isCorrected: Boolean(correctedAtMatch),
    correctedAt: correctedAtMatch?.[1] ?? null,
    correctionReason: reasonMatch?.[1] ?? null,
  };
}

export function buildReceiptCorrectionTransactionNote(
  receiptNumber: string,
  batchNumber: string,
  reason: string
) {
  const sanitizedReason = sanitizeReason(reason);
  return `Receipt line correction for ${receiptNumber} - batch ${batchNumber}. Reason: ${sanitizedReason}`;
}

export function stripReceiptCancellationMarkers(notes: string | null | undefined) {
  return (notes ?? '')
    .replace(/\[RECEIPT_CANCELLED_AT:[^\]]+\]/g, '')
    .replace(/\[RECEIPT_CANCEL_REASON:[^\]]+\]/g, '')
    .replace(/\[RECEIPT_ADJUSTED_AT:[^\]]+\]/g, '')
    .replace(/\[RECEIPT_ADJUST_REASON:[^\]]+\]/g, '')
    .replace(/\[RECEIPT_CORRECTED_AT:[^\]]+\]/g, '')
    .replace(/\[RECEIPT_CORRECT_REASON:[^\]]+\]/g, '')
    .replace(/\[GRN-CORRECTION:[^\]]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildReceiptCancellationTransactionNote(
  receiptNumber: string,
  batchNumber: string,
  reason?: string | null
) {
  const sanitizedReason = sanitizeReason(reason);
  if (!sanitizedReason) {
    return `Receipt cancellation for ${receiptNumber} - batch ${batchNumber}`;
  }
  return `Receipt cancellation for ${receiptNumber} - batch ${batchNumber}. Reason: ${sanitizedReason}`;
}

export function buildReceiptAdjustmentTransactionNote(
  receiptNumber: string,
  batchNumber: string,
  reason: string
) {
  const sanitizedReason = sanitizeReason(reason);
  return `Receipt adjustment for ${receiptNumber} - batch ${batchNumber}. Reason: ${sanitizedReason}`;
}
