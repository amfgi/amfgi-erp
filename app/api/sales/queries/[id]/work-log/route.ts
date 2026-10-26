import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { getSalesRecord } from '@/lib/sales/service';
import { listSalesWorkLog } from '@/lib/sales/workLog';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const record = await getSalesRecord(session.companyId, id, session.access);
    return successResponse(await listSalesWorkLog(session.companyId, record.id));
  } catch (error) {
    return salesErrorResponse(error);
  }
}
