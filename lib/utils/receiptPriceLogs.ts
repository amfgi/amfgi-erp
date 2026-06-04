import { Prisma } from '@prisma/client';
import { decimalEqualsNullable, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { recalculateAssemblyAncestorsTx } from '@/lib/utils/materialAssembly';

type TxClient = Prisma.TransactionClient;

export function buildReceiptPriceLogNote(receiptNumber: string) {
  return `Updated via goods receipt: ${receiptNumber}`;
}

/** Removes price-log rows from a goods receipt and reverts material unit cost when still at the receipt price. */
export async function reverseReceiptPriceLogUpdates(
  tx: TxClient,
  args: {
    companyId: string;
    receiptNumber: string;
    changedBy: string;
  }
) {
  const note = buildReceiptPriceLogNote(args.receiptNumber);
  const logs = await tx.priceLog.findMany({
    where: {
      companyId: args.companyId,
      notes: note,
    },
    orderBy: { timestamp: 'asc' },
  });

  if (logs.length === 0) return;

  const revertedMaterialIds = new Set<string>();

  for (const log of logs) {
    const material = await tx.material.findUnique({
      where: { id: log.materialId },
      select: { unitCost: true },
    });
    if (!material) continue;

    const currentCost = decimalToNumberOrZero(material.unitCost);
    const receiptSetCost = decimalToNumberOrZero(log.currentPrice);
    if (!decimalEqualsNullable(currentCost, receiptSetCost)) continue;

    const previousPrice = decimalToNumberOrZero(log.previousPrice);
    await tx.material.update({
      where: { id: log.materialId },
      data: { unitCost: previousPrice },
    });
    revertedMaterialIds.add(log.materialId);
  }

  await tx.priceLog.deleteMany({
    where: {
      companyId: args.companyId,
      notes: note,
    },
  });

  for (const materialId of revertedMaterialIds) {
    await recalculateAssemblyAncestorsTx(tx, args.companyId, materialId, args.changedBy);
  }
}
