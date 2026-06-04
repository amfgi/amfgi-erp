import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { runJobVariationBulkImport } from '@/lib/import-export/runJobVariationBulkImport';
import type { JobVariationImportRow } from '@/lib/import-export/jobVariationFields';
import { runParentJobBulkImport } from '@/lib/import-export/runParentJobBulkImport';
import type { ParentJobImportRow } from '@/lib/import-export/parentJobFields';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const SharedJobFieldsSchema = {
  id: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  customerName: z.string().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
  description: z.string().max(1000).optional(),
  site: z.string().max(200).optional(),
  address: z.string().max(2000).optional(),
  startDate: z.string().max(40).optional(),
  endDate: z.string().max(40).optional(),
  quotationNumber: z.string().max(100).optional(),
  quotationDate: z.string().max(40).optional(),
  lpoNumber: z.string().max(100).optional(),
  lpoDate: z.string().max(40).optional(),
  lpoValue: z.number().finite().optional(),
  projectName: z.string().max(200).optional(),
  projectDetails: z.string().max(2000).optional(),
  contactPerson: z.string().max(200).optional(),
  salesPerson: z.string().max(200).optional(),
  jobWorkValue: z.number().positive().finite().optional(),
  requiredExpertises: z.array(z.string().min(1).max(120)).optional(),
  contactsJson: z.array(z.any()).optional(),
};

const ParentJobImportRowSchema = z.object({
  ...SharedJobFieldsSchema,
  jobNumber: z.string().min(1).max(50),
});

const JobVariationImportRowSchema = z.object({
  ...SharedJobFieldsSchema,
  parentJobId: z.string().min(1).optional(),
  parentJobNumber: z.string().min(1).max(50).optional(),
  variationSuffix: z.string().min(1).max(50).optional(),
  jobNumber: z.string().min(1).max(50).optional(),
});

const BulkSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('parent'),
    newRows: z.array(ParentJobImportRowSchema),
    updateRows: z.array(ParentJobImportRowSchema),
  }),
  z.object({
    scope: z.literal('variation'),
    newRows: z.array(JobVariationImportRowSchema),
    updateRows: z.array(JobVariationImportRowSchema),
  }),
]);

function hasImportPermission(perms: string[], isSA: boolean, kind: 'create' | 'edit') {
  if (isSA) return true;
  return perms.includes(kind === 'create' ? 'job.create' : 'job.edit');
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
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
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
    select: { jobSourceMode: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  try {
    const result =
      parsed.data.scope === 'parent'
        ? await runParentJobBulkImport(prisma, {
            companyId,
            userId: session.user.id,
            jobSourceMode: company.jobSourceMode,
            newRows: parsed.data.newRows as ParentJobImportRow[],
            updateRows: parsed.data.updateRows as ParentJobImportRow[],
          })
        : await runJobVariationBulkImport(prisma, {
            companyId,
            userId: session.user.id,
            newRows: parsed.data.newRows as JobVariationImportRow[],
            updateRows: parsed.data.updateRows as JobVariationImportRow[],
          });

    if (result.created > 0 || result.updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'jobs',
        entity: 'job',
        action: 'bulk_import',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Job import failed';
    if (message.includes('Unique constraint')) {
      return errorResponse('A job number already exists for this company', 409);
    }
    return errorResponse(message, 500);
  }
}
