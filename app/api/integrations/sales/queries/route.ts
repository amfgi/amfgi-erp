import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { prepareIntegrationRequest, verifyIntegrationCompany } from '@/lib/integrations/integrationRoute';
import { createIntegratedSalesQuery, integrationSalesQuerySchema } from '@/lib/sales/integrationSales';
import { SalesError } from '@/lib/sales/service';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request) {
  const prepared = await prepareIntegrationRequest(req, 'sales_query');
  if (!prepared.ok) return prepared.response;

  const parsed = integrationSalesQuerySchema.safeParse(prepared.rawBody);
  if (!parsed.success) {
    await prisma.integrationSyncLog.create({
      data: {
        companyId: prepared.cred.companyId,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'sales_query',
        status: 'validation_error',
        httpStatus: 422,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        errorMessage: parsed.error.issues[0]?.message ?? 'Validation error',
      },
    });
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyResult = await verifyIntegrationCompany({
    credentialCompanyId: prepared.cred.companyId,
    credentialId: prepared.cred.id,
    idempotencyKey: prepared.idempotencyKey,
    requestHash: prepared.requestHash,
    rawBody: prepared.rawBody,
    companyExternalId: parsed.data.companyExternalId,
    entityType: 'sales_query',
    entityKey: parsed.data.salesmanId,
  });
  if (!companyResult.ok) return companyResult.response;

  try {
    const result = await createIntegratedSalesQuery(companyResult.company.id, parsed.data);
    await prisma.integrationSyncLog.create({
      data: {
        companyId: companyResult.company.id,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'sales_query',
        entityKey: result.queryNumber,
        status: 'success',
        httpStatus: 201,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        responseBody: result as Prisma.InputJsonValue,
      },
    });
    return successResponse(result, 201);
  } catch (error) {
    const status = error instanceof SalesError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Sales query could not be created';
    await prisma.integrationSyncLog.create({
      data: {
        companyId: companyResult.company.id,
        credentialId: prepared.cred.id,
        idempotencyKey: prepared.idempotencyKey,
        requestHash: prepared.requestHash,
        direction: 'inbound',
        entityType: 'sales_query',
        status: status >= 500 ? 'error' : 'validation_error',
        httpStatus: status,
        requestBody: prepared.rawBody as Prisma.InputJsonValue,
        errorMessage: message,
      },
    });
    return errorResponse(message, status);
  }
}
