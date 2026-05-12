import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export const GLOBAL_LIVE_UPDATE_COMPANY_ID = 'GLOBAL';

export type LiveUpdateChannel =
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'jobs'
  | 'settings'
  | 'admin'
  | 'hr';

export interface LiveUpdateEvent {
  id: string;
  companyId: string;
  channel: LiveUpdateChannel;
  entity: string;
  action: 'created' | 'updated' | 'deleted' | 'changed';
  at: string;
}

interface LiveUpdateRow {
  id: bigint;
  companyId: string;
  channel: string;
  entity: string;
  action: string;
  createdAt: Date;
}

const LIVE_UPDATE_RETENTION_HOURS = 24;

/** Reserved `Company` row so `LiveUpdateEvent.companyId` FK accepts `GLOBAL_LIVE_UPDATE_COMPANY_ID`. */
const RESERVED_GLOBAL_COMPANY_NAME = '__system_live_updates';
const RESERVED_GLOBAL_COMPANY_SLUG = '__system_live_updates';

/**
 * `LiveUpdateEvent` references `Company`. Broadcast events use id `GLOBAL`, which is not a normal tenant;
 * ensure that row exists. For real companies, skip publishing if the id is missing (stale session after DB reset).
 */
async function ensureLiveUpdateCompanyFkTarget(companyId: string): Promise<boolean> {
  if (companyId === GLOBAL_LIVE_UPDATE_COMPANY_ID) {
    try {
      await prisma.company.upsert({
        where: { id: GLOBAL_LIVE_UPDATE_COMPANY_ID },
        create: {
          id: GLOBAL_LIVE_UPDATE_COMPANY_ID,
          name: RESERVED_GLOBAL_COMPANY_NAME,
          slug: RESERVED_GLOBAL_COMPANY_SLUG,
          isActive: false,
        },
        update: {},
      });
      return true;
    } catch (e) {
      console.error('[live-updates] failed to ensure GLOBAL company row', e);
      return false;
    }
  }

  const row = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!row) {
    console.warn('[live-updates] skip publish: company not found', companyId);
    return false;
  }
  return true;
}

function mapRowToEvent(row: LiveUpdateRow): LiveUpdateEvent {
  return {
    id: row.id.toString(),
    companyId: row.companyId,
    channel: row.channel as LiveUpdateChannel,
    entity: row.entity,
    action: row.action as LiveUpdateEvent['action'],
    at: row.createdAt.toISOString(),
  };
}

export async function publishLiveUpdate(event: Omit<LiveUpdateEvent, 'id' | 'at'>) {
  const ok = await ensureLiveUpdateCompanyFkTarget(event.companyId);
  if (!ok) return;

  try {
    await prisma.$executeRaw`
      INSERT INTO "LiveUpdateEvent" ("companyId", "channel", "entity", "action")
      VALUES (${event.companyId}, ${event.channel}, ${event.entity}, ${event.action})
    `;
  } catch (e) {
    console.warn('[live-updates] INSERT failed', { companyId: event.companyId, channel: event.channel, e });
  }

  try {
    const cutoff = new Date(Date.now() - LIVE_UPDATE_RETENTION_HOURS * 60 * 60 * 1000);
    await prisma.$executeRaw`
      DELETE FROM "LiveUpdateEvent"
      WHERE "createdAt" < ${cutoff}
    `;
  } catch (e) {
    console.warn('[live-updates] retention DELETE failed', e);
  }
}

export async function getLatestLiveUpdateCursor(companyIds: string[]) {
  if (companyIds.length === 0) {
    return '0';
  }

  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT "id"
    FROM "LiveUpdateEvent"
    WHERE "companyId" IN (${Prisma.join(companyIds)})
    ORDER BY "id" DESC
    LIMIT 1
  `);

  return rows[0]?.id.toString() ?? '0';
}

export async function getLiveUpdatesAfterCursor(
  companyIds: string[],
  afterCursor: string,
  limit = 50
) {
  if (companyIds.length === 0) {
    return [];
  }

  const cursorValue = BigInt(afterCursor || '0');
  const rows = await prisma.$queryRaw<LiveUpdateRow[]>(Prisma.sql`
    SELECT "id", "companyId", "channel", "entity", "action", "createdAt"
    FROM "LiveUpdateEvent"
    WHERE "companyId" IN (${Prisma.join(companyIds)})
      AND "id" > ${cursorValue}
    ORDER BY "id" ASC
    LIMIT ${limit}
  `);

  return rows.map(mapRowToEvent);
}
