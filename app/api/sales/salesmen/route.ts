import { prisma } from '@/lib/db/prisma';
import { successResponse } from '@/lib/utils/apiResponse';
import { ensureSalesPipelineRoles } from '@/lib/sales/roles';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { canListSales } from '@/lib/sales/access';
import { listSalesmen, SalesError } from '@/lib/sales/service';

export async function GET() {
  try {
    await ensureSalesPipelineRoles(prisma);
    const session = await requireSalesSession();
    if (!canListSales(session.access) && !session.access.queryManage) {
      throw new SalesError('Forbidden', 403);
    }
    return successResponse(await listSalesmen(session.companyId));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
