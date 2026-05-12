import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const requestedJobIds = searchParams.getAll('jobIds').filter(Boolean);

  const companyId = session.user.activeCompanyId;

  let jobIdsToScope: string[] = [id];
  if (requestedJobIds.length > 0) {
    const validJobs = await prisma.job.findMany({
      where: { companyId, id: { in: requestedJobIds } },
      select: { id: true },
    });
    if (validJobs.length === 0) {
      return errorResponse('No matching jobs found', 404);
    }
    jobIdsToScope = validJobs.map((row) => row.id);
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      jobId: { in: jobIdsToScope },
      companyId,
      type: {
        in: ['STOCK_OUT', 'RETURN'],
      },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
        },
      },
    },
  });

  const materialMap = new Map<string, {
    materialId: string;
    materialName: string;
    unit: string;
    dispatched: number;
    returned: number;
    netConsumed: number;
    availableToReturn: number;
  }>();

  for (const txn of transactions) {
    const key = txn.materialId;
    const existing = materialMap.get(key) || {
      materialId: txn.materialId,
      materialName: txn.material.name,
      unit: txn.material.unit,
      dispatched: 0,
      returned: 0,
      netConsumed: 0,
      availableToReturn: 0,
    };

    if (txn.type === 'STOCK_OUT') {
      existing.dispatched += decimalToNumberOrZero(txn.quantity);
    } else if (txn.type === 'RETURN') {
      existing.returned += decimalToNumberOrZero(txn.quantity);
    }

    existing.netConsumed = existing.dispatched - existing.returned;
    existing.availableToReturn = existing.dispatched - existing.returned;

    materialMap.set(key, existing);
  }

  const result = Array.from(materialMap.values()).sort((a, b) =>
    a.materialName.localeCompare(b.materialName)
  );

  return successResponse(result);
}
