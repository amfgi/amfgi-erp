import { prisma } from '@/lib/db/prisma';
import { prepareIntegrationRequest, verifyIntegrationCompany } from '@/lib/integrations/integrationRoute';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const prepared = await prepareIntegrationRequest(req, 'sales_customer');
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
    entityType: 'sales_customer',
  });
  if (!companyResult.ok) return companyResult.response;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, companyId: companyResult.company.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      contactPerson: true,
      address: true,
      isActive: true,
      contacts: {
        orderBy: { sortOrder: 'asc' },
        select: { contactName: true, phone: true, email: true },
      },
    },
  });
  if (!customer) return errorResponse('Customer not found', 404);

  const { contacts, ...rest } = customer;
  return successResponse({
    ...rest,
    contacts: contacts.map((contact) => ({
      name: contact.contactName,
      phone: contact.phone,
      email: contact.email,
    })),
  });
}
