import { successResponse } from '@/lib/utils/apiResponse';
import { requireSalesSession, salesErrorResponse } from '@/lib/sales/http';
import { changeQuotationSerial, checkQuotationSerial } from '@/lib/sales/service';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const serial = new URL(request.url).searchParams.get('serial') ?? '';
    return successResponse(
      await checkQuotationSerial({
        companyId: session.companyId,
        id,
        access: session.access,
        serial,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSalesSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const serial = body && typeof body === 'object' && 'serial' in body && typeof body.serial === 'string'
      ? body.serial
      : '';
    return successResponse(
      await changeQuotationSerial({
        companyId: session.companyId,
        id,
        access: session.access,
        actorId: session.userId,
        serial,
      }),
    );
  } catch (error) {
    return salesErrorResponse(error);
  }
}
