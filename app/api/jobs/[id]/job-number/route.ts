import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { changeJobSerial, checkJobSerial, JobSerialError } from '@/lib/jobs/changeJobSerial';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

async function authorize() {
  const session = await auth();
  if (!session?.user) return { error: errorResponse('Unauthorized', 401) };
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.edit')) {
    return { error: errorResponse('Forbidden', 403) };
  }
  if (!session.user.activeCompanyId) return { error: errorResponse('No active company selected', 400) };
  return { session, companyId: session.user.activeCompanyId, userId: session.user.id };
}

function failure(error: unknown) {
  if (error instanceof JobSerialError) return errorResponse(error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return errorResponse('Not available, try another', 409);
  }
  const message = error instanceof Error ? error.message : 'Could not change the job number';
  console.error('Job serial error:', message, error);
  return errorResponse(message, 500);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorize();
  if ('error' in authResult && authResult.error) return authResult.error;
  if (!('companyId' in authResult)) return errorResponse('Unauthorized', 401);

  try {
    const { id } = await params;
    const serial = new URL(request.url).searchParams.get('serial') ?? '';
    return successResponse(await checkJobSerial(prisma, { companyId: authResult.companyId, id, serial }));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorize();
  if ('error' in authResult && authResult.error) return authResult.error;
  if (!('companyId' in authResult)) return errorResponse('Unauthorized', 401);

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const serial = body && typeof body === 'object' && 'serial' in body && typeof body.serial === 'string'
      ? body.serial
      : '';
    const result = await changeJobSerial(prisma, {
      companyId: authResult.companyId,
      id,
      userId: authResult.userId,
      serial,
    });
    publishLiveUpdate({
      companyId: authResult.companyId,
      channel: 'jobs',
      entity: 'job',
      action: 'updated',
    });
    publishLiveUpdate({
      companyId: authResult.companyId,
      channel: 'hr',
      entity: 'job',
      action: 'updated',
    });
    return successResponse(result);
  } catch (error) {
    return failure(error);
  }
}
