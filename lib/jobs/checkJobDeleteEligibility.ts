import type { JobRecordSource, JobStatus, PrismaClient } from '@prisma/client';

export type JobDeleteLinkCategory =
  | 'variations'
  | 'transactions'
  | 'dispatch'
  | 'delivery'
  | 'referenceDelivery'
  | 'schedule'
  | 'attendance'
  | 'quantityLog'
  | 'budget'
  | 'progress';

export interface JobDeleteLinkSummary {
  category: JobDeleteLinkCategory;
  label: string;
  count: number;
}

export interface JobDeleteCheckResult {
  canDelete: boolean;
  isVariation: boolean;
  isParent: boolean;
  source: JobRecordSource;
  jobNumber: string;
  status: JobStatus;
  deleteBlockedReason?: 'external_api' | 'linked_data';
  links: JobDeleteLinkSummary[];
  totalLinkedCount: number;
  /** @deprecated use links — kept for older clients */
  linkedTransactionsCount: number;
}

type PrismaLike = Pick<
  PrismaClient,
  | 'job'
  | 'transaction'
  | 'dispatchEntryRevision'
  | 'deliveryNote'
  | 'workAssignment'
  | 'attendanceEntry'
  | 'quantityLogAdhocJob'
  | 'jobCostingSnapshot'
  | 'jobItemProgressEntry'
>;

function pushLink(
  links: JobDeleteLinkSummary[],
  category: JobDeleteLinkCategory,
  label: string,
  count: number,
) {
  if (count > 0) links.push({ category, label, count });
}

export async function checkJobDeleteEligibility(
  prisma: PrismaLike,
  companyId: string,
  jobId: string,
): Promise<JobDeleteCheckResult> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId },
    select: {
      id: true,
      parentJobId: true,
      source: true,
      jobNumber: true,
      status: true,
    },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  const isVariation = Boolean(job.parentJobId);
  const isParent = !job.parentJobId;

  if (job.source === 'EXTERNAL_API') {
    return {
      canDelete: false,
      isVariation,
      isParent,
      source: job.source,
      jobNumber: job.jobNumber,
      status: job.status,
      deleteBlockedReason: 'external_api',
      links: [],
      totalLinkedCount: 0,
      linkedTransactionsCount: 0,
    };
  }

  const [
    variationCount,
    transactionCount,
    dispatchCount,
    deliveryCount,
    deliveryReferenceCount,
    scheduleCount,
    attendanceCount,
    quantityLogCount,
    budgetSnapshotCount,
    progressEntryCount,
  ] = await Promise.all([
    isParent
      ? prisma.job.count({ where: { companyId, parentJobId: jobId } })
      : Promise.resolve(0),
    prisma.transaction.count({ where: { companyId, jobId } }),
    prisma.dispatchEntryRevision.count({ where: { companyId, jobId } }),
    prisma.deliveryNote.count({ where: { companyId, jobId } }),
    prisma.deliveryNote.count({ where: { companyId, referenceJobId: jobId } }),
    prisma.workAssignment.count({ where: { companyId, jobId } }),
    prisma.attendanceEntry.count({
      where: { companyId, workAssignment: { jobId } },
    }),
    prisma.quantityLogAdhocJob.count({ where: { companyId, jobId } }),
    prisma.jobCostingSnapshot.count({ where: { companyId, jobId } }),
    prisma.jobItemProgressEntry.count({
      where: { companyId, jobItem: { jobId } },
    }),
  ]);

  const links: JobDeleteLinkSummary[] = [];
  pushLink(links, 'variations', 'Job variation', variationCount);
  pushLink(links, 'transactions', 'Stock transaction', transactionCount);
  pushLink(links, 'dispatch', 'Dispatch entry', dispatchCount);
  pushLink(links, 'delivery', 'Delivery note', deliveryCount);
  pushLink(links, 'referenceDelivery', 'Delivery note reference', deliveryReferenceCount);
  pushLink(links, 'schedule', 'Schedule assignment', scheduleCount);
  pushLink(links, 'attendance', 'Attendance entry', attendanceCount);
  pushLink(links, 'quantityLog', 'Daily quantity log', quantityLogCount);
  pushLink(links, 'budget', 'Budget snapshot', budgetSnapshotCount);
  pushLink(links, 'progress', 'Budget progress entry', progressEntryCount);

  const totalLinkedCount = links.reduce((sum, link) => sum + link.count, 0);

  return {
    canDelete: totalLinkedCount === 0,
    isVariation,
    isParent,
    source: job.source,
    jobNumber: job.jobNumber,
    status: job.status,
    deleteBlockedReason: totalLinkedCount > 0 ? 'linked_data' : undefined,
    links,
    totalLinkedCount,
    linkedTransactionsCount: transactionCount,
  };
}
