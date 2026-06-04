import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { runCustomerBulkImport } from '@/lib/import-export/runCustomerBulkImport';
import type { CustomerImportRow } from '@/lib/import-export/customerFields';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { partyListPartyFieldsSchema } from '@/lib/partyListRecordPayload';
import { formatZodImportError } from '@/lib/import-export/formatImportErrors';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CustomerImportRowSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(100),
    contactPerson: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .merge(partyListPartyFieldsSchema);

const BulkSchema = z.object({
  newRows: z.array(CustomerImportRowSchema),
  updateRows: z.array(CustomerImportRowSchema),
});

function hasImportPermission(
  perms: string[],
  isSA: boolean,
  kind: 'create' | 'edit'
) {
  if (isSA) return true;
  return perms.includes(kind === 'create' ? 'customer.create' : 'customer.edit');
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const perms = session.user.permissions ?? [];
  const isSA = session.user.isSuperAdmin ?? false;

  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(formatZodImportError(parsed.error, 'Customer import'), 422);
  }

  if (parsed.data.newRows.length > 0 && !hasImportPermission(perms, isSA, 'create')) {
    return errorResponse('Forbidden', 403);
  }
  if (parsed.data.updateRows.length > 0 && !hasImportPermission(perms, isSA, 'edit')) {
    return errorResponse('Forbidden', 403);
  }

  const companyId = session.user.activeCompanyId;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { customerSourceMode: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const normalize = (row: z.infer<typeof CustomerImportRowSchema>): CustomerImportRow => ({
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    address: row.address,
    isActive: row.isActive,
    trade_license_number: row.trade_license_number,
    trade_license_authority: row.trade_license_authority,
    trade_license_expiry: row.trade_license_expiry,
    trn_number: row.trn_number,
    trn_expiry: row.trn_expiry,
    contacts: row.contacts,
  });

  try {
    const result = await runCustomerBulkImport(prisma, {
      companyId,
      customerSourceMode: company.customerSourceMode,
      newRows: parsed.data.newRows.map(normalize),
      updateRows: parsed.data.updateRows.map(normalize),
    });

    if (result.created > 0 || result.updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'customers',
        entity: 'customer',
        action: 'bulk_import',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Customer import failed';
    if (message.includes('Unique constraint')) {
      return errorResponse('A customer name already exists for this company', 409);
    }
    return errorResponse(message, 500);
  }
}
