import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { prepareIntegrationRequest, verifyIntegrationCompany } from '@/lib/integrations/integrationRoute';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  contactPerson: true,
  address: true,
  isActive: true,
} as const;

async function companyFromKey(req: Request) {
  const prepared = await prepareIntegrationRequest(req, 'sales_customer');
  if (!prepared.ok) return prepared;
  const url = new URL(req.url);
  const companyExternalId = url.searchParams.get('companyExternalId')?.trim() ?? '';
  if (!companyExternalId) return { ok: false as const, response: errorResponse('companyExternalId is required', 422) };
  const companyResult = await verifyIntegrationCompany({
    credentialCompanyId: prepared.cred.companyId,
    credentialId: prepared.cred.id,
    idempotencyKey: prepared.idempotencyKey,
    requestHash: prepared.requestHash,
    rawBody: { companyExternalId },
    companyExternalId,
    entityType: 'sales_customer',
  });
  if (!companyResult.ok) return companyResult;
  return { ok: true as const, companyId: companyResult.company.id, searchParams: url.searchParams };
}

export async function GET(req: Request) {
  const ready = await companyFromKey(req);
  if (!ready.ok) return ready.response;

  const search = ready.searchParams.get('search')?.trim() ?? '';
  const where: Prisma.CustomerWhereInput = {
    companyId: ready.companyId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: { name: 'asc' },
      skip: parseListOffset(ready.searchParams.get('offset')),
      take: parseListLimit(ready.searchParams.get('limit')),
    }),
  ]);
  return successResponse({ items, total });
}
