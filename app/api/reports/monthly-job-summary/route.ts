import * as XLSX from 'xlsx';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  buildMonthlyJobSummaryWorkbook,
  getMonthlyJobSummaryReport,
  monthlyJobSummaryFilename,
  type JobSummaryGroupBy,
  type MaterialLabelMode,
} from '@/lib/reports/monthlyJobSummary';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function parseBooleanParam(value: string | null, defaultValue: boolean) {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return defaultValue;
}

function mergeJobIdParams(searchParams: URLSearchParams) {
  return [...new Set([...searchParams.getAll('jobId'), ...searchParams.getAll('jobId[]')].map((id) => id.trim()).filter(Boolean))];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const format = String(searchParams.get('format') ?? 'json').trim();
  const from = String(searchParams.get('from') ?? '').trim() || null;
  const to = String(searchParams.get('to') ?? '').trim() || null;
  const month = String(searchParams.get('month') ?? '').trim();

  const materialLabelRaw = String(searchParams.get('materialLabel') ?? 'name').trim();
  const materialLabel: MaterialLabelMode = materialLabelRaw === 'external' ? 'external' : 'name';
  const groupByRaw = String(searchParams.get('groupBy') ?? 'parent').trim();
  const groupBy: JobSummaryGroupBy = groupByRaw === 'variation' ? 'variation' : 'parent';
  const jobIds = mergeJobIdParams(searchParams);

  const include = {
    consumption: parseBooleanParam(searchParams.get('includeConsumption'), true),
    production: parseBooleanParam(searchParams.get('includeProduction'), true),
    costing: parseBooleanParam(searchParams.get('includeCosting'), true),
    workHours: parseBooleanParam(searchParams.get('includeWorkHours'), true),
  };

  if (!include.consumption && !include.production && !include.costing && !include.workHours) {
    return errorResponse('At least one include section must be enabled', 400);
  }

  let resolvedFrom = from;
  let resolvedTo = to;
  if (!resolvedFrom && !resolvedTo && month) {
    const [year, monthNum] = month.split('-').map(Number);
    const start = new Date(year, monthNum - 1, 1);
    const end = new Date(year, monthNum, 0);
    resolvedFrom = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    resolvedTo = `${year}-${String(monthNum).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  }

  try {
    const report = await getMonthlyJobSummaryReport(prisma, {
      companyId: session.user.activeCompanyId,
      from: resolvedFrom,
      to: resolvedTo,
      jobIds: jobIds.length > 0 ? jobIds : undefined,
      groupBy,
      materialLabel,
      include,
    });

    if (format === 'xlsx') {
      if (report.sheets.length === 0) {
        return errorResponse('No job activity found for the selected date range and filters', 404);
      }

      const workbook = buildMonthlyJobSummaryWorkbook(report);
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const filename = monthlyJobSummaryFilename(report.from, report.to);

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return successResponse(report);
  } catch (error) {
    console.error('[monthly-job-summary]', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to build job summary', 500);
  }
}
