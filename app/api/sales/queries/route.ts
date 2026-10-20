import { successResponse } from '@/lib/utils/apiResponse';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { ensureSalesPipelineRoles } from '@/lib/sales/roles';
import { prisma } from '@/lib/db/prisma';
import { createSalesSchema } from '@/lib/sales/schemas';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { canListSales } from '@/lib/sales/access';
import { createSalesQuery, listSalesRecords, SalesError } from '@/lib/sales/service';
import type { SalesClosure, SalesStage } from '@prisma/client';

const STAGES = new Set(['QUERY', 'QUOTATION', 'PURCHASE_ORDER']);
const CLOSURES = new Set(['OPEN', 'LOST', 'CANCELLED', 'REJECTED']);

export async function GET(req: Request) {
  try {
    const session = await requireSalesSession();
    if (!canListSales(session.access)) throw new SalesError('Forbidden', 403);
    const url = new URL(req.url);
    const stageRaw = url.searchParams.get('stage');
    const closureRaw = url.searchParams.get('closure');
    const result = await listSalesRecords({
      companyId: session.companyId,
      access: session.access,
      limit: parseListLimit(url.searchParams.get('limit')),
      offset: parseListOffset(url.searchParams.get('offset')),
      search: url.searchParams.get('search')?.trim() ?? '',
      stage: stageRaw && STAGES.has(stageRaw) ? (stageRaw as SalesStage) : null,
      closure: closureRaw && CLOSURES.has(closureRaw) ? (closureRaw as SalesClosure) : null,
      excludeClosure:
        url.searchParams.get('excludeClosure') && CLOSURES.has(url.searchParams.get('excludeClosure') ?? '')
          ? (url.searchParams.get('excludeClosure') as SalesClosure)
          : null,
      withoutJob: url.searchParams.get('withoutJob') === '1',
    });
    return successResponse(result);
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSalesPipelineRoles(prisma);
    const session = await requireSalesSession();
    const parsed = createSalesSchema.safeParse(await req.json());
    if (!parsed.success) {
      return salesErrorResponse(new SalesError(parsed.error.issues[0]?.message ?? 'Check the query fields and try again'));
    }
    const record = await createSalesQuery({
      companyId: session.companyId,
      userId: session.userId,
      access: session.access,
      ...parsed.data,
    });
    return successResponse(record, 201);
  } catch (error) {
    return salesErrorResponse(error);
  }
}
