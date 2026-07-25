import { prisma } from '@/lib/db/prisma';
import { canHrDocumentCreate } from '@/lib/hr/documentPermissions';
import { normalizePortalDocumentFlags } from '@/lib/hr/employeeDocumentPortal';
import { EMPLOYEE_DOC_OTHER_SLUG, resolveEmployeeDocumentCustomFields } from '@/lib/hr/employeeDocumentDisplay';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const DocSchema = z.object({
  documentTypeId: z.string().min(1),
  customTitle: z.string().max(200).optional().nullable(),
  visaPeriodId: z.string().optional().nullable(),
  documentNumber: z.string().max(120).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  issuingAuthority: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.any().optional().nullable(),
  mediaUrl: z.string().max(2000).optional().nullable(),
  portalViewEnabled: z.boolean().optional(),
  portalDownloadEnabled: z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_VIEW });
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
  });
  if (!emp) return errorResponse('Employee not found', 404);

  const docs = await prisma.employeeDocument.findMany({
    where: { employeeId, companyId: emp.companyId },
    include: {
      company: { select: { id: true, name: true, slug: true } },
      documentType: true,
      visaPeriod: { select: { id: true, label: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });
  return successResponse(docs);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHrSession({ permission: P.HR_DOCUMENT_CREATE });
  if (!ctx.ok) return ctx.response;
  const { session, companyIds } = ctx;
  if (!canHrDocumentCreate(session.user)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, ...companyIdWhere(companyIds) },
  });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = DocSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const dt = await prisma.employeeDocumentType.findFirst({
    where: { id: d.documentTypeId, companyId: emp.companyId },
  });
  if (!dt) return errorResponse('Invalid document type', 422);

  const customTitle = d.customTitle?.trim() || null;
  if (dt.slug === EMPLOYEE_DOC_OTHER_SLUG && !customTitle) {
    return errorResponse('Custom title is required for custom documents', 422);
  }
  if (customTitle && dt.slug !== EMPLOYEE_DOC_OTHER_SLUG) {
    return errorResponse('Custom title is only allowed for custom documents', 422);
  }

  if (d.visaPeriodId) {
    const vp = await prisma.visaPeriod.findFirst({
      where: { id: d.visaPeriodId, employeeId, companyId: emp.companyId },
    });
    if (!vp) return errorResponse('Invalid visa period', 422);
  }

  const portalFlags = normalizePortalDocumentFlags(d.portalViewEnabled, d.portalDownloadEnabled);

  const doc = await prisma.employeeDocument.create({
    data: {
      companyId: emp.companyId,
      employeeId,
      documentTypeId: d.documentTypeId,
      visaPeriodId: d.visaPeriodId ?? null,
      documentNumber: d.documentNumber?.trim() || null,
      issueDate: d.issueDate ? new Date(d.issueDate) : null,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
      issuingAuthority: d.issuingAuthority?.trim() || null,
      notes: d.notes?.trim() || null,
      customFields:
        d.customFields !== undefined
          ? d.customFields
          : resolveEmployeeDocumentCustomFields(d.customTitle ?? null),
      mediaUrl: d.mediaUrl?.trim() || null,
      portalViewEnabled: portalFlags.portalViewEnabled,
      portalDownloadEnabled: portalFlags.portalDownloadEnabled,
    },
  });
  return successResponse(doc, 201);
}
