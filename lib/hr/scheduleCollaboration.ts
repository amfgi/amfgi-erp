export const SCHEDULE_PRESENCE_STALE_MS = 45_000;
export const SCHEDULE_PRESENCE_HEARTBEAT_MS = 20_000;

export type ScheduleLivePart = 'notes' | 'drivers' | 'structure' | 'presence' | `column:${number}`;

export function scheduleLiveEntity(scheduleId: string, part: ScheduleLivePart) {
  return `schedule:${scheduleId}:${part}`;
}

export function parseScheduleLiveEntity(entity: string): { scheduleId: string; part: ScheduleLivePart } | null {
  if (!entity.startsWith('schedule:')) return null;
  const parts = entity.split(':');
  if (parts.length < 3) return null;
  const scheduleId = parts[1];
  const tail = parts.slice(2).join(':');
  if (tail === 'notes' || tail === 'drivers' || tail === 'structure' || tail === 'presence') {
    return { scheduleId, part: tail };
  }
  if (tail.startsWith('column:')) {
    const columnIndex = Number(tail.slice('column:'.length));
    if (!Number.isFinite(columnIndex)) return null;
    return { scheduleId, part: `column:${columnIndex}` };
  }
  return null;
}

export type ScheduleEditorPresenceRow = {
  sessionId: string;
  userId: string;
  displayName: string;
  lastSeenAt: string;
  isSelf: boolean;
};
