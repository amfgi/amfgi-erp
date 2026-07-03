import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { getEmployeePortalLeaveBalance } from '@/lib/hr/leaveBalance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const balance = await getEmployeePortalLeaveBalance(prisma, emp.companyId, emp.id);
  if (!balance) return errorResponse('Employee not found', 404);

  return successResponse(balance);
}
