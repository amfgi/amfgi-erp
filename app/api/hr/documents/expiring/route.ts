import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { companyIdWhere, requireHrSession } from '@/lib/hr/requireHrSession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

const companySelect = { id: true, name: true, slug: true } as const;

/** Documents with expiryDate within the next `days` (inclusive of today). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await requireHrSession({
    permission: P.HR_DOCUMENT_VIEW,
    companyId: searchParams.get('companyId'),
  });
  if (!ctx.ok) return ctx.response;
  const { companyIds } = ctx;

  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10) || 30));

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);

  const docs = await prisma.employeeDocument.findMany({
    where: {
      ...companyIdWhere(companyIds),
      expiryDate: { not: null, gte: start, lte: end },
    },
    include: {
      company: { select: companySelect },
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      documentType: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { expiryDate: 'asc' },
    take: 500,
  });
  return successResponse(docs);
}
