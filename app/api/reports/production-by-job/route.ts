import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseTrackableItems } from '@/lib/job-costing/progressTracking';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function mergeJobIdParams(searchParams: URLSearchParams): string[] {
  const raw = [...searchParams.getAll('jobId'), ...searchParams.getAll('jobId[]')];
  return [...new Set(raw.map((id) => id.trim()).filter(Boolean))];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const jobIds = mergeJobIdParams(searchParams);

  try {
    const companyId = session.user.activeCompanyId;

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

    const entries = await prisma.jobItemProgressEntry.findMany({
      where: {
        companyId,
        entryDate: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        jobItem: {
          jobId: jobIds.length > 0 ? { in: jobIds } : undefined,
        },
      },
      select: {
        quantity: true,
        entryDate: true,
        trackerId: true,
        jobItem: {
          select: {
            id: true,
            name: true,
            trackingItems: true,
            trackingUnit: true,
            job: {
              select: {
                id: true,
                jobNumber: true,
                site: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const trackerCache = new Map<string, ReturnType<typeof parseTrackableItems>>();
    function trackersForItem(jobItemId: string, trackingItems: unknown) {
      let list = trackerCache.get(jobItemId);
      if (!list) {
        list = parseTrackableItems(trackingItems);
        trackerCache.set(jobItemId, list);
      }
      return list;
    }

    type Agg = {
      jobId: string;
      jobNumber: string;
      customerName: string;
      site: string | null;
      jobItemId: string;
      jobItemName: string;
      trackerId: string | null;
      trackerLabel: string;
      unit: string | null;
      targetValue: number | null;
      totalProduced: number;
      entryCount: number;
      firstEntry: Date | null;
      lastEntry: Date | null;
    };

    const grouped = new Map<string, Agg>();

    for (const row of entries) {
      const ji = row.jobItem;
      const job = ji.job;
      const tid = row.trackerId ? String(row.trackerId).trim() : null;
      const key = `${job.id}|${ji.id}|${tid ?? ''}`;

      const trackers = trackersForItem(ji.id, ji.trackingItems);
      const tracker = tid ? trackers.find((t) => t.id === tid) : null;
      const trackerLabel = tracker?.label ?? (tid || '—');
      const unit = tracker?.unit?.trim() || ji.trackingUnit?.trim() || null;
      const targetValue = tracker ? tracker.targetValue : null;

      const qty = decimalToNumberOrZero(row.quantity);
      const ed = row.entryDate instanceof Date ? row.entryDate : new Date(row.entryDate);

      let agg = grouped.get(key);
      if (!agg) {
        agg = {
          jobId: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer?.name ?? '',
          site: job.site ?? null,
          jobItemId: ji.id,
          jobItemName: ji.name,
          trackerId: tid,
          trackerLabel,
          unit,
          targetValue,
          totalProduced: 0,
          entryCount: 0,
          firstEntry: null,
          lastEntry: null,
        };
        grouped.set(key, agg);
      }

      agg.totalProduced += qty;
      agg.entryCount += 1;
      if (!agg.firstEntry || ed.getTime() < agg.firstEntry.getTime()) agg.firstEntry = ed;
      if (!agg.lastEntry || ed.getTime() > agg.lastEntry.getTime()) agg.lastEntry = ed;
    }

    const rows = Array.from(grouped.values()).map((agg) => ({
      jobId: agg.jobId,
      jobNumber: agg.jobNumber,
      customerName: agg.customerName,
      site: agg.site,
      jobItemId: agg.jobItemId,
      jobItemName: agg.jobItemName,
      trackerId: agg.trackerId,
      trackerLabel: agg.trackerLabel,
      unit: agg.unit,
      targetValue: agg.targetValue,
      totalProduced: agg.totalProduced,
      entryCount: agg.entryCount,
      firstEntryDate: agg.firstEntry ? agg.firstEntry.toISOString().slice(0, 10) : null,
      lastEntryDate: agg.lastEntry ? agg.lastEntry.toISOString().slice(0, 10) : null,
    }));

    rows.sort((a, b) => {
      if (a.jobNumber !== b.jobNumber) return a.jobNumber.localeCompare(b.jobNumber);
      if (a.jobItemName !== b.jobItemName) return a.jobItemName.localeCompare(b.jobItemName);
      return a.trackerLabel.localeCompare(b.trackerLabel);
    });

    return successResponse(rows);
  } catch (err) {
    console.error('Production by job report error:', err);
    return errorResponse('Failed to fetch production data', 500);
  }
}
