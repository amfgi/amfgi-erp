import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import {
  listScheduleEditorPresence,
  pruneStaleScheduleEditorPresence,
  publishSchedulePresenceChanged,
} from '@/lib/hr/schedulePresence';

const HeartbeatSchema = z.object({
  sessionId: z.string().min(8).max(120),
  displayName: z.string().min(1).max(120),
});

async function loadScheduleForPresence(scheduleId: string, companyId: string) {
  return prisma.workSchedule.findFirst({
    where: { id: scheduleId, companyId },
    select: { id: true, status: true },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);
  const { id: scheduleId } = await params;

  const sch = await loadScheduleForPresence(scheduleId, companyId);
  if (!sch) return errorResponse('Not found', 404);

  const rows = await listScheduleEditorPresence(scheduleId);
  return successResponse(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);
  const { id: scheduleId } = await params;

  const sch = await loadScheduleForPresence(scheduleId, companyId);
  if (!sch) return errorResponse('Schedule not found for active company', 404);
  if (sch.status === 'LOCKED') return errorResponse('Schedule is locked', 403);

  const body = await req.json();
  const parsed = HeartbeatSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const existing = await prisma.scheduleEditorPresence.findUnique({
      where: {
        workScheduleId_sessionId: {
          workScheduleId: scheduleId,
          sessionId: parsed.data.sessionId,
        },
      },
      select: { id: true, displayName: true },
    });

    await prisma.scheduleEditorPresence.upsert({
      where: {
        workScheduleId_sessionId: {
          workScheduleId: scheduleId,
          sessionId: parsed.data.sessionId,
        },
      },
      update: {
        displayName: parsed.data.displayName.trim(),
        lastSeenAt: new Date(),
      },
      create: {
        companyId,
        workScheduleId: scheduleId,
        userId: session.user.id,
        displayName: parsed.data.displayName.trim(),
        sessionId: parsed.data.sessionId,
      },
    });

    const pruned = await pruneStaleScheduleEditorPresence(scheduleId);
    const isJoin = !existing;
    const displayNameChanged =
      existing != null && existing.displayName.trim() !== parsed.data.displayName.trim();

    if (isJoin || displayNameChanged || pruned.count > 0) {
      await publishSchedulePresenceChanged(companyId, scheduleId);
    }

    return successResponse({ ok: true, sessionId: parsed.data.sessionId });
  } catch (error) {
    console.error('[schedule-presence] POST failed', { scheduleId, companyId, error });
    return errorResponse('Could not update schedule presence', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  const { id: scheduleId } = await params;

  const sch = await loadScheduleForPresence(scheduleId, companyId);
  if (!sch) return errorResponse('Not found', 404);

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof (body as { sessionId?: unknown }).sessionId === 'string'
    ? (body as { sessionId: string }).sessionId
    : '';

  if (sessionId) {
    const deleted = await prisma.scheduleEditorPresence.deleteMany({
      where: { workScheduleId: scheduleId, sessionId, userId: session.user.id },
    });
    if (deleted.count > 0) {
      await publishSchedulePresenceChanged(companyId, scheduleId);
    }
  }

  return successResponse({ ok: true });
}
