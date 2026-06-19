'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCHEDULE_PRESENCE_HEARTBEAT_MS,
  SCHEDULE_PRESENCE_STALE_MS,
  parseScheduleLiveEntity,
  type ScheduleEditorPresenceRow,
} from '@/lib/hr/scheduleCollaboration';

type LiveUpdateMessage = {
  type?: string;
  channel?: string;
  entity?: string;
  action?: string;
  companyId?: string;
};

type UseScheduleCollaborationOptions = {
  scheduleId: string | null;
  sessionId: string;
  displayName: string;
  enabled: boolean;
  onRemoteNotes?: () => void;
  onRemoteColumn?: (columnIndex: number, action: string) => void;
  onRemoteStructure?: () => void;
  onRemoteDrivers?: () => void;
};

export function useScheduleCollaboration({
  scheduleId,
  sessionId,
  displayName,
  enabled,
  onRemoteNotes,
  onRemoteColumn,
  onRemoteStructure,
  onRemoteDrivers,
}: UseScheduleCollaborationOptions) {
  const [presence, setPresence] = useState<ScheduleEditorPresenceRow[]>([]);
  const callbacksRef = useRef({
    onRemoteNotes,
    onRemoteColumn,
    onRemoteStructure,
    onRemoteDrivers,
  });
  const presenceRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    callbacksRef.current = {
      onRemoteNotes,
      onRemoteColumn,
      onRemoteStructure,
      onRemoteDrivers,
    };
  }, [onRemoteColumn, onRemoteDrivers, onRemoteNotes, onRemoteStructure]);

  const refreshPresence = useCallback(async () => {
    if (!scheduleId || !enabled) return;
    try {
      const response = await fetch(`/api/hr/schedule/${scheduleId}/presence`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const json = (await response.json()) as { data?: ScheduleEditorPresenceRow[] };
      if (!Array.isArray(json.data)) return;
      setPresence(
        json.data.map((row) => ({
          ...row,
          isSelf: row.sessionId === sessionId,
        })),
      );
    } catch {
      // ignore transient network errors
    }
  }, [enabled, scheduleId, sessionId]);

  const schedulePresenceRefresh = useCallback(() => {
    if (presenceRefreshTimerRef.current != null) {
      window.clearTimeout(presenceRefreshTimerRef.current);
    }
    presenceRefreshTimerRef.current = window.setTimeout(() => {
      presenceRefreshTimerRef.current = null;
      void refreshPresence();
    }, 200);
  }, [refreshPresence]);

  const sendHeartbeat = useCallback(async () => {
    if (!scheduleId || !enabled) return;
    try {
      await fetch(`/api/hr/schedule/${scheduleId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, displayName }),
      });
    } catch {
      // ignore transient network errors
    }
  }, [displayName, enabled, scheduleId, sessionId]);

  useEffect(() => {
    if (!scheduleId || !enabled) {
      setPresence([]);
      return;
    }

    void refreshPresence();
    void sendHeartbeat();

    const heartbeatId = window.setInterval(() => {
      void sendHeartbeat();
    }, SCHEDULE_PRESENCE_HEARTBEAT_MS);

    const staleSweepId = window.setInterval(() => {
      schedulePresenceRefresh();
    }, SCHEDULE_PRESENCE_STALE_MS);

    const leave = () => {
      void fetch(`/api/hr/schedule/${scheduleId}/presence`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => undefined);
    };

    window.addEventListener('beforeunload', leave);
    return () => {
      window.clearInterval(heartbeatId);
      window.clearInterval(staleSweepId);
      if (presenceRefreshTimerRef.current != null) {
        window.clearTimeout(presenceRefreshTimerRef.current);
        presenceRefreshTimerRef.current = null;
      }
      window.removeEventListener('beforeunload', leave);
      leave();
    };
  }, [enabled, refreshPresence, scheduleId, schedulePresenceRefresh, sendHeartbeat, sessionId]);

  useEffect(() => {
    if (!scheduleId || !enabled) return;

    const source = new EventSource('/api/live-updates');
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as LiveUpdateMessage;
        if (payload.type === 'connected' || !payload.entity) return;
        if (payload.channel !== 'hr') return;
        const parsed = parseScheduleLiveEntity(payload.entity);
        if (!parsed || parsed.scheduleId !== scheduleId) return;

        if (parsed.part === 'presence') {
          schedulePresenceRefresh();
          return;
        }
        if (parsed.part === 'notes') {
          callbacksRef.current.onRemoteNotes?.();
          return;
        }
        if (parsed.part === 'drivers') {
          callbacksRef.current.onRemoteDrivers?.();
          return;
        }
        if (parsed.part === 'structure') {
          callbacksRef.current.onRemoteStructure?.();
          return;
        }
        if (typeof parsed.part === 'string' && parsed.part.startsWith('column:')) {
          const columnIndex = Number(parsed.part.slice('column:'.length));
          if (Number.isFinite(columnIndex)) {
            callbacksRef.current.onRemoteColumn?.(columnIndex, payload.action ?? 'updated');
          }
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => source.close();
  }, [enabled, scheduleId, schedulePresenceRefresh]);

  return { presence };
}
