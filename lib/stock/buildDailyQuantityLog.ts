import type { PrismaClient } from '@prisma/client';
import { dateFromYmd } from '@/lib/hr/workDate';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function isQuantityLogDayFinalized(
  db: PrismaClient,
  companyId: string,
  entryDate: Date
): Promise<boolean> {
  const row = await db.quantityLogDaySubmission.findUnique({
    where: {
      companyId_workDate: {
        companyId,
        workDate: entryDate,
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** A single team posted to the day for a budget contract. */
export type DailyQuantityLogTeamPayload = {
  /** HR work assignment id (or `adhoc-{jobId}`). */
  assignmentId: string;
  columnIndex: number;
  label: string;
  isAdhoc: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  remarks: string | null;
  teamLeader: { id: string; fullName: string } | null;
  members: Array<{ id: string; fullName: string; employeeCode: string }>;
  /** The specific job the team was assigned to (parent contract or one of its variations). */
  job: {
    id: string;
    jobNumber: string;
    isVariation: boolean;
  } | null;
};

export type DailyQuantityLogAssignmentPayload = {
  /** Synthetic group id (`group-{budgetJobId}`) when multiple teams share one contract. */
  assignmentId: string;
  columnIndex: number;
  /** Combined team label (e.g. "Team A · Team B"). */
  label: string;
  /** True only when every team in the group was added ad-hoc (none come from HR). */
  isAdhoc: boolean;
  /** All teams (parent + variations) sharing this contract on this date. Always ≥ 1. */
  teams: DailyQuantityLogTeamPayload[];
  /** The contract job (parent if any) where the budget items live. */
  job: {
    id: string;
    jobNumber: string;
    parentJobId: string | null;
    site: string | null;
    description: string | null;
    customerName: string | null;
    jobNumberSnapshot: string | null;
    siteNameSnapshot: string | null;
    clientNameSnapshot: string | null;
    projectDetailsSnapshot: string | null;
    budgetJobId: string;
  } | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    trackingItems: unknown[];
    existingEntries: Array<{
      id: string;
      trackerId: string | null;
      quantity: number;
      note: string | null;
      entryDate: string;
      createdBy: string;
      createdAt: Date;
    }>;
    /** Cumulative quantity logged across ALL dates, keyed by trackerId. */
    cumulativeByTracker: Record<string, number>;
  }>;
};

export type DailyQuantityLogEligibleJob = {
  id: string;
  jobNumber: string;
  parentJobId: string | null;
  customerName: string | null;
  site: string | null;
  projectName: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
};

export async function buildDailyQuantityLogPayload(
  db: PrismaClient,
  companyId: string,
  workDateYmd: string
): Promise<{
  workDate: string;
  schedule: {
    id: string;
    workDate: Date;
    status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
    title: string | null;
    clientDisplayName: string | null;
    publishedAt: Date | null;
    lockedAt: Date | null;
  } | null;
  submission: {
    submittedAt: Date;
    submittedById: string;
  } | null;
  assignments: DailyQuantityLogAssignmentPayload[];
  eligibleJobs: DailyQuantityLogEligibleJob[];
}> {
  const workDate = dateFromYmd(workDateYmd);

  const [schedule, submission, scheduleAssignments, adhocRows] = await Promise.all([
    db.workSchedule.findFirst({
      where: { companyId, workDate },
      select: {
        id: true,
        workDate: true,
        status: true,
        title: true,
        clientDisplayName: true,
        publishedAt: true,
        lockedAt: true,
      },
    }),
    db.quantityLogDaySubmission.findUnique({
      where: { companyId_workDate: { companyId, workDate } },
      select: { submittedAt: true, submittedById: true },
    }),
    db.workAssignment.findMany({
      where: {
        companyId,
        workSchedule: { workDate },
        jobId: { not: null },
      },
      orderBy: { columnIndex: 'asc' },
      select: {
        id: true,
        columnIndex: true,
        label: true,
        jobId: true,
        jobNumberSnapshot: true,
        siteNameSnapshot: true,
        clientNameSnapshot: true,
        projectDetailsSnapshot: true,
        shiftStart: true,
        shiftEnd: true,
        remarks: true,
        teamLeader: { select: { id: true, fullName: true } },
        job: {
          select: {
            id: true,
            jobNumber: true,
            parentJobId: true,
            site: true,
            description: true,
            customer: { select: { name: true } },
          },
        },
        members: {
          select: {
            employee: { select: { id: true, fullName: true, employeeCode: true } },
          },
        },
      },
    }),
    db.quantityLogAdhocJob.findMany({
      where: { companyId, workDate },
      select: {
        id: true,
        jobId: true,
        job: {
          select: {
            id: true,
            jobNumber: true,
            parentJobId: true,
            site: true,
            description: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  /** Merge schedule assignments + ad hoc jobs (avoid duplicate job ids). */
  const seenJobIds = new Set<string>();
  const mergedRows: Array<{
    assignmentId: string;
    columnIndex: number;
    label: string;
    isAdhoc: boolean;
    shiftStart: string | null;
    shiftEnd: string | null;
    remarks: string | null;
    teamLeader: { id: string; fullName: string } | null;
    members: Array<{ id: string; fullName: string; employeeCode: string }>;
    jobId: string | null;
    jobNumberSnapshot: string | null;
    siteNameSnapshot: string | null;
    clientNameSnapshot: string | null;
    projectDetailsSnapshot: string | null;
    job: typeof scheduleAssignments[number]['job'];
  }> = [];

  for (const row of scheduleAssignments) {
    if (row.jobId) seenJobIds.add(row.jobId);
    mergedRows.push({
      assignmentId: row.id,
      columnIndex: row.columnIndex,
      label: row.label,
      isAdhoc: false,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      remarks: row.remarks,
      teamLeader: row.teamLeader,
      members: row.members.map((m) => m.employee),
      jobId: row.jobId,
      jobNumberSnapshot: row.jobNumberSnapshot,
      siteNameSnapshot: row.siteNameSnapshot,
      clientNameSnapshot: row.clientNameSnapshot,
      projectDetailsSnapshot: row.projectDetailsSnapshot,
      job: row.job,
    });
  }

  let adhocColumn = 1000;
  for (const ad of adhocRows) {
    if (seenJobIds.has(ad.jobId)) continue;
    seenJobIds.add(ad.jobId);
    mergedRows.push({
      assignmentId: `adhoc-${ad.jobId}`,
      columnIndex: adhocColumn++,
      label: 'Ad-hoc job',
      isAdhoc: true,
      shiftStart: null,
      shiftEnd: null,
      remarks: null,
      teamLeader: null,
      members: [],
      jobId: ad.jobId,
      jobNumberSnapshot: null,
      siteNameSnapshot: null,
      clientNameSnapshot: null,
      projectDetailsSnapshot: null,
      job: ad.job,
    });
  }

  mergedRows.sort((a, b) => a.columnIndex - b.columnIndex);

  const eligibleJobs = await loadEligibleJobs(db, companyId);

  if (mergedRows.length === 0) {
    return {
      workDate: workDateYmd,
      schedule,
      submission,
      assignments: [],
      eligibleJobs,
    };
  }

  const uniqueJobIds = Array.from(
    new Set(mergedRows.map((row) => row.jobId).filter((id): id is string => Boolean(id)))
  );
  const budgetContextByJobId = new Map<string, { budgetJobId: string }>();
  await Promise.all(
    uniqueJobIds.map(async (jobId) => {
      const ctx = await resolveJobBudgetContext(db, companyId, jobId);
      if (ctx) budgetContextByJobId.set(jobId, { budgetJobId: ctx.budgetJobId });
    })
  );
  const budgetJobIds = Array.from(new Set(Array.from(budgetContextByJobId.values()).map((e) => e.budgetJobId)));

  const jobItems = budgetJobIds.length
    ? await db.jobItem.findMany({
        where: {
          companyId,
          jobId: { in: budgetJobIds },
          isActive: true,
          trackingEnabled: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          jobId: true,
          name: true,
          description: true,
          trackingItems: true,
          trackingEnabled: true,
        },
      })
    : [];

  const trackingItemsByBudgetJob = new Map<string, typeof jobItems>();
  for (const item of jobItems) {
    const list = trackingItemsByBudgetJob.get(item.jobId) ?? [];
    list.push(item);
    trackingItemsByBudgetJob.set(item.jobId, list);
  }

  const itemIds = jobItems.map((item) => item.id);
  const [entryRows, cumulativeRows] = itemIds.length
    ? await Promise.all([
        db.jobItemProgressEntry.findMany({
          where: {
            companyId,
            jobItemId: { in: itemIds },
            entryDate: workDate,
          },
          select: {
            id: true,
            jobItemId: true,
            trackerId: true,
            quantity: true,
            note: true,
            entryDate: true,
            createdBy: true,
            createdAt: true,
          },
        }),
        db.jobItemProgressEntry.groupBy({
          by: ['jobItemId', 'trackerId'],
          where: { companyId, jobItemId: { in: itemIds } },
          _sum: { quantity: true },
        }),
      ])
    : [[], []];

  const entriesByItemId = new Map<string, typeof entryRows>();
  for (const entry of entryRows) {
    const list = entriesByItemId.get(entry.jobItemId) ?? [];
    list.push(entry);
    entriesByItemId.set(entry.jobItemId, list);
  }

  /** itemId → trackerId → cumulative quantity across all dates. */
  const cumulativeByItem = new Map<string, Record<string, number>>();
  for (const row of cumulativeRows) {
    if (!row.trackerId) continue;
    const map = cumulativeByItem.get(row.jobItemId) ?? {};
    map[row.trackerId] = decimalToNumberOrZero(row._sum.quantity ?? 0);
    cumulativeByItem.set(row.jobItemId, map);
  }

  /** Returns true when every tracker on the item has reached or exceeded its target. */
  function isItemFullyDone(item: typeof jobItems[number]): boolean {
    const trackers = Array.isArray(item.trackingItems) ? item.trackingItems : [];
    if (trackers.length === 0) return false;
    const cumMap = cumulativeByItem.get(item.id) ?? {};
    for (const tracker of trackers) {
      const target = Number((tracker as { targetValue?: unknown }).targetValue || 0);
      const trackerId = String((tracker as { id?: unknown }).id ?? '');
      if (target <= 0) return false; // open-ended trackers are never considered done
      const cum = cumMap[trackerId] ?? 0;
      if (cum < target) return false;
    }
    return true;
  }

  /** Group rows by budgetJobId so a job + its variations across multiple teams collapse into one card. */
  const groupsByBudgetJob = new Map<string, typeof mergedRows>();
  for (const row of mergedRows) {
    const ctx = row.jobId ? budgetContextByJobId.get(row.jobId) : null;
    if (!ctx) continue; // jobs without budget context can't be grouped/logged
    const key = ctx.budgetJobId;
    const list = groupsByBudgetJob.get(key) ?? [];
    list.push(row);
    groupsByBudgetJob.set(key, list);
  }

  /** Fetch parent contract details for groups whose parent isn't directly on the schedule. */
  const directlyKnownJobIds = new Set(mergedRows.map((r) => r.jobId).filter((id): id is string => Boolean(id)));
  const budgetJobsToFetch = Array.from(groupsByBudgetJob.keys()).filter((id) => !directlyKnownJobIds.has(id));
  const extraBudgetJobs = budgetJobsToFetch.length
    ? await db.job.findMany({
        where: { companyId, id: { in: budgetJobsToFetch } },
        select: {
          id: true,
          jobNumber: true,
          parentJobId: true,
          site: true,
          description: true,
          customer: { select: { name: true } },
        },
      })
    : [];
  const budgetJobInfoById = new Map<string, typeof extraBudgetJobs[number]>(
    extraBudgetJobs.map((j) => [j.id, j])
  );

  /** Only show groups that have at least one trackable budget line — empty/done jobs are hidden. */
  const assignments: DailyQuantityLogAssignmentPayload[] = [];
  for (const [budgetJobId, rows] of groupsByBudgetJob.entries()) {
    const allItems = trackingItemsByBudgetJob.get(budgetJobId) ?? [];
    /** Keep an item if it has entries on this date (still need editing) or any tracker still has remaining qty. */
    const items = allItems.filter((item) => {
      if ((entriesByItemId.get(item.id) ?? []).length > 0) return true;
      return !isItemFullyDone(item);
    });
    if (items.length === 0) continue;

    const directRow = rows.find((r) => r.jobId === budgetJobId);
    const displayJob = directRow?.job ?? budgetJobInfoById.get(budgetJobId) ?? null;

    /** Dedupe team members across all teams in the group (rare, but possible). */
    const seenMemberIds = new Set<string>();
    const teams: DailyQuantityLogTeamPayload[] = rows
      .slice()
      .sort((a, b) => a.columnIndex - b.columnIndex)
      .map((r) => {
        const dedupedMembers = r.members.filter((m) => {
          if (seenMemberIds.has(m.id)) return false;
          seenMemberIds.add(m.id);
          return true;
        });
        return {
          assignmentId: r.assignmentId,
          columnIndex: r.columnIndex,
          label: r.label,
          isAdhoc: r.isAdhoc,
          shiftStart: r.shiftStart,
          shiftEnd: r.shiftEnd,
          remarks: r.remarks,
          teamLeader: r.teamLeader,
          members: dedupedMembers,
          job: r.job
            ? {
                id: r.job.id,
                jobNumber: r.job.jobNumber,
                isVariation: Boolean(r.job.parentJobId),
              }
            : null,
        };
      });

    const allAdhoc = rows.every((r) => r.isAdhoc);
    const minColumn = Math.min(...rows.map((r) => r.columnIndex));
    const uniqueLabels = Array.from(new Set(rows.map((r) => r.label).filter(Boolean)));
    const combinedLabel = uniqueLabels.length > 0 ? uniqueLabels.join(' · ') : 'Crew';

    assignments.push({
      assignmentId: `group-${budgetJobId}`,
      columnIndex: minColumn,
      label: combinedLabel,
      isAdhoc: allAdhoc,
      teams,
      job: displayJob
        ? {
            id: displayJob.id,
            jobNumber: displayJob.jobNumber,
            parentJobId: displayJob.parentJobId,
            site: displayJob.site,
            description: displayJob.description,
            customerName: displayJob.customer?.name ?? null,
            jobNumberSnapshot: directRow?.jobNumberSnapshot ?? null,
            siteNameSnapshot: directRow?.siteNameSnapshot ?? null,
            clientNameSnapshot: directRow?.clientNameSnapshot ?? null,
            projectDetailsSnapshot: directRow?.projectDetailsSnapshot ?? null,
            budgetJobId,
          }
        : null,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        trackingItems: Array.isArray(item.trackingItems) ? item.trackingItems : [],
        existingEntries: (entriesByItemId.get(item.id) ?? []).map((entry) => ({
          id: entry.id,
          trackerId: entry.trackerId,
          quantity: decimalToNumberOrZero(entry.quantity),
          note: entry.note,
          entryDate: entry.entryDate.toISOString().slice(0, 10),
          createdBy: entry.createdBy,
          createdAt: entry.createdAt,
        })),
        cumulativeByTracker: cumulativeByItem.get(item.id) ?? {},
      })),
    });
  }

  assignments.sort((a, b) => a.columnIndex - b.columnIndex);

  return {
    workDate: workDateYmd,
    schedule,
    submission,
    assignments,
    eligibleJobs,
  };
}

/** Returns active/on-hold jobs (in the company) that have at least one tracking-enabled
 *  budget item with remaining quantity to log, resolved through the parent contract for variations. */
async function loadEligibleJobs(
  db: PrismaClient,
  companyId: string
): Promise<DailyQuantityLogEligibleJob[]> {
  const [allJobs, items] = await Promise.all([
    db.job.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'ON_HOLD'] } },
      orderBy: { jobNumber: 'asc' },
      select: {
        id: true,
        jobNumber: true,
        parentJobId: true,
        site: true,
        projectName: true,
        status: true,
        customer: { select: { name: true } },
      },
    }),
    db.jobItem.findMany({
      where: { companyId, isActive: true, trackingEnabled: true },
      select: { id: true, jobId: true, trackingItems: true },
    }),
  ]);

  const itemIds = items.map((i) => i.id);
  const cumulativeRows = itemIds.length
    ? await db.jobItemProgressEntry.groupBy({
        by: ['jobItemId', 'trackerId'],
        where: { companyId, jobItemId: { in: itemIds } },
        _sum: { quantity: true },
      })
    : [];

  const cumByItemTracker = new Map<string, number>();
  for (const row of cumulativeRows) {
    if (!row.trackerId) continue;
    cumByItemTracker.set(`${row.jobItemId}::${row.trackerId}`, decimalToNumberOrZero(row._sum.quantity ?? 0));
  }

  /** Budget jobs that still have at least one tracker with remaining qty. */
  const incompleteBudgetJobIds = new Set<string>();
  for (const item of items) {
    const trackers = Array.isArray(item.trackingItems) ? item.trackingItems : [];
    if (trackers.length === 0) continue;
    for (const tracker of trackers) {
      const target = Number((tracker as { targetValue?: unknown }).targetValue || 0);
      const trackerId = String((tracker as { id?: unknown }).id ?? '');
      if (target <= 0) {
        incompleteBudgetJobIds.add(item.jobId);
        break;
      }
      const cum = cumByItemTracker.get(`${item.id}::${trackerId}`) ?? 0;
      if (cum < target) {
        incompleteBudgetJobIds.add(item.jobId);
        break;
      }
    }
  }

  return allJobs
    .filter((job) => incompleteBudgetJobIds.has(job.parentJobId ?? job.id))
    .map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      parentJobId: job.parentJobId,
      customerName: job.customer?.name ?? null,
      site: job.site,
      projectName: job.projectName,
      status: job.status,
    }));
}
