import type { Prisma } from '@prisma/client';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { calculateTrackedProgress, parseTrackableItems } from '@/lib/job-costing/progressTracking';

type TxClient = Prisma.TransactionClient;

export async function syncTrackedJobItemProgress(tx: TxClient, companyId: string, itemId: string) {
  const item = await tx.jobItem.findFirst({
    where: {
      id: itemId,
      companyId,
    },
    include: {
      progressEntries: {
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!item) return null;

  const trackers = parseTrackableItems(item.trackingItems);
  if (trackers.length === 0) {
    await tx.jobItem.update({
      where: { id: itemId },
      data: {
        trackingEnabled: false,
        progressUpdatedAt: new Date(),
      },
    });
    return item;
  }

  const jobRow = await tx.job.findFirst({
    where: { id: item.jobId, companyId },
    select: {
      status: true,
      executionProgressStatus: true,
      executionProgressPercent: true,
      executionActualStartDate: true,
    },
  });

  // Status now lives on the Job profile (Job.status). Map to JobItemProgressStatus.
  const derivedJobStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | undefined = jobRow
    ? jobRow.status === 'COMPLETED'
      ? 'COMPLETED'
      : jobRow.status === 'ON_HOLD' || jobRow.status === 'CANCELLED'
        ? 'ON_HOLD'
        : jobRow.executionActualStartDate
          ? 'IN_PROGRESS'
          : (jobRow.executionProgressStatus ?? 'NOT_STARTED')
    : undefined;

  const snapshot = calculateTrackedProgress(
    trackers,
    item.progressEntries.map((entry) => ({
      trackerId: entry.trackerId,
      entryDate: entry.entryDate,
      quantity: decimalToNumberOrZero(entry.quantity),
    })),
    {
      progressStatus: derivedJobStatus ?? item.progressStatus,
      progressPercent: decimalToNumberOrZero(jobRow?.executionProgressPercent ?? item.progressPercent),
    }
  );

  await tx.jobItem.update({
    where: { id: itemId },
    data: {
      progressPercent: snapshot.percentComplete,
      trackingEnabled: snapshot.enabled,
      progressUpdatedAt: new Date(),
    },
  });

  return snapshot;
}
