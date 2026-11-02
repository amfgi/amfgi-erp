import type { Prisma } from '@prisma/client';

import { assignNextDocumentNumber } from '@/lib/sales/nextDocumentSerial';

export function variationSuffixForParent(
  parentJobNumber: string,
  variationSuffix?: string | null,
  jobNumber?: string | null,
): string {
  const explicit = variationSuffix?.trim() ?? '';
  if (explicit) return explicit;
  const full = jobNumber?.trim() ?? '';
  const prefix = `${parentJobNumber.trim()}-`;
  if (!full || !prefix || prefix === '-') return '';
  if (!full.toLowerCase().startsWith(prefix.toLowerCase())) return '';
  return full.slice(prefix.length).trim();
}

export async function allocateJobNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  try {
    return await assignNextDocumentNumber(tx, companyId, 'J');
  } catch (error) {
    if (error instanceof Error && error.message === 'Could not assign the next number') {
      throw new Error('Could not assign the next job number');
    }
    throw error;
  }
}
