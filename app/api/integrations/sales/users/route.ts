import { prepareIntegrationRequest, verifyIntegrationCompany } from '@/lib/integrations/integrationRoute';
import { listSalesUsers } from '@/lib/sales/salesUsers';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const prepared = await prepareIntegrationRequest(req, 'sales_user');
  if (!prepared.ok) return prepared.response;

  const url = new URL(req.url);
  const companyExternalId = url.searchParams.get('companyExternalId')?.trim() ?? '';
  if (!companyExternalId) return errorResponse('companyExternalId is required', 422);

  const companyResult = await verifyIntegrationCompany({
    credentialCompanyId: prepared.cred.companyId,
    credentialId: prepared.cred.id,
    idempotencyKey: prepared.idempotencyKey,
    requestHash: prepared.requestHash,
    rawBody: { companyExternalId },
    companyExternalId,
    entityType: 'sales_user',
  });
  if (!companyResult.ok) return companyResult.response;

  const users = await listSalesUsers(companyResult.company.id);
  return successResponse(users.map((user) => ({ id: user.id, name: user.name, email: user.email })));
}
