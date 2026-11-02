import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { canAccessSettingsEmail } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

type SentMailRow = {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  status: string;
  error: string | null;
  provider: string | null;
  createdAt: Date;
  companyName: string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !canAccessSettingsEmail({
      isSuperAdmin: session.user.isSuperAdmin,
      permissions: session.user.permissions,
    })
  ) {
    return errorResponse('Forbidden', 403);
  }

  try {
    // Raw SQL so this list still loads if the running server has a Prisma client
    // generated before the OutboundEmail model existed.
    const rows = await prisma.$queryRaw<SentMailRow[]>(Prisma.sql`
      SELECT
        e."id",
        e."kind",
        e."toEmail",
        e."subject",
        e."status",
        e."error",
        e."provider",
        e."createdAt",
        c."name" AS "companyName"
      FROM "OutboundEmail" e
      JOIN "Company" c ON c."id" = e."companyId"
      ORDER BY e."createdAt" DESC
      LIMIT 100
    `);

    return successResponse({
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        toEmail: row.toEmail,
        subject: row.subject,
        status: row.status,
        error: row.error,
        provider: row.provider,
        createdAt: row.createdAt,
        companyName: row.companyName,
      })),
    });
  } catch (error) {
    console.error('[mail] could not list sent mail:', error);
    return errorResponse('Could not load sent mail', 500);
  }
}
