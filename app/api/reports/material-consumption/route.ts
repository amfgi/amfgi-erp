import * as XLSX from 'xlsx';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  buildMaterialConsumptionWorkbook,
  getMaterialConsumptionReport,
  materialConsumptionFilename,
} from '@/lib/reports/materialConsumption';
import type { MaterialLabelMode } from '@/lib/reports/monthlyJobSummary';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

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

  let resolvedFrom = from;
  let resolvedTo = to;
  if (!resolvedFrom && !resolvedTo && month) {
    const [year, monthNum] = month.split('-').map(Number);
    const end = new Date(year, monthNum, 0);
    resolvedFrom = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    resolvedTo = `${year}-${String(monthNum).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  }

  try {
    const report = await getMaterialConsumptionReport(prisma, {
      companyId: session.user.activeCompanyId,
      from: resolvedFrom,
      to: resolvedTo,
      materialLabel,
    });

    if (format === 'xlsx') {
      if (report.rows.length === 0) {
        return errorResponse('No material consumption found for the selected date range', 404);
      }

      const workbook = buildMaterialConsumptionWorkbook(report);
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const filename = materialConsumptionFilename(report.from, report.to);

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
    console.error('[material-consumption]', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to build material consumption report', 500);
  }
}
