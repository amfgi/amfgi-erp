import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import {
  SCHEDULE_PRESENCE_STALE_MS,
  scheduleLiveEntity,
  type ScheduleEditorPresenceRow,
} from '@/lib/hr/scheduleCollaboration';

export async function pruneStaleScheduleEditorPresence(workScheduleId: string) {
  const cutoff = new Date(Date.now() - SCHEDULE_PRESENCE_STALE_MS);
  return prisma.scheduleEditorPresence.deleteMany({
    where: { workScheduleId, lastSeenAt: { lt: cutoff } },
  });
}

export async function listScheduleEditorPresence(
  workScheduleId: string,
  selfSessionId?: string,
): Promise<ScheduleEditorPresenceRow[]> {
  await pruneStaleScheduleEditorPresence(workScheduleId);

  const rows = await prisma.scheduleEditorPresence.findMany({
    where: {
      workScheduleId,
      lastSeenAt: { gte: new Date(Date.now() - SCHEDULE_PRESENCE_STALE_MS) },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      sessionId: true,
      userId: true,
      displayName: true,
      lastSeenAt: true,
    },
  });

  return rows.map((row) => ({
    sessionId: row.sessionId,
    userId: row.userId,
    displayName: row.displayName,
    lastSeenAt: row.lastSeenAt.toISOString(),
    isSelf: selfSessionId ? row.sessionId === selfSessionId : false,
  }));
}

export async function publishSchedulePresenceChanged(companyId: string, scheduleId: string) {
  await publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: scheduleLiveEntity(scheduleId, 'presence'),
    action: 'changed',
  });
}
