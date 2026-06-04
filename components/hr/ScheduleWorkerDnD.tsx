'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SCHEDULE_WORKER_DRAG_PREFIX = 'schedule-worker:';

export function scheduleWorkerDragId(employeeId: string) {
  return `${SCHEDULE_WORKER_DRAG_PREFIX}${employeeId}`;
}

export function scheduleTeamDropId(colIdx: number, subTeamIndex: number | null = null) {
  return subTeamIndex === null ? `schedule-team:${colIdx}` : `schedule-team:${colIdx}:sub:${subTeamIndex}`;
}

export function parseScheduleWorkerDragId(id: string | number): string | null {
  const value = String(id);
  return value.startsWith(SCHEDULE_WORKER_DRAG_PREFIX)
    ? value.slice(SCHEDULE_WORKER_DRAG_PREFIX.length)
    : null;
}

export function parseScheduleTeamDropId(
  id: string | number,
): { colIdx: number; subTeamIndex: number | null } | null {
  const match = String(id).match(/^schedule-team:(\d+)(?::sub:(\d+))?$/);
  if (!match) return null;
  return {
    colIdx: Number(match[1]),
    subTeamIndex: match[2] !== undefined ? Number(match[2]) : null,
  };
}

export type ScheduleWorkerDnDEmployee = {
  id: string;
  preferredName: string | null;
  fullName: string;
  workforce: { expertises: string[] };
};

type WorkerCardProps = {
  employee: ScheduleWorkerDnDEmployee;
  disabled?: boolean;
  isOverlay?: boolean;
};

export function ScheduleWorkerDraggableCard({ employee, disabled, isOverlay }: WorkerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: scheduleWorkerDragId(employee.id),
    disabled,
  });

  const style = !isOverlay && transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-background px-2 py-2 transition-colors touch-none',
        !disabled && 'cursor-grab hover:bg-muted/50 active:cursor-grabbing',
        disabled && 'cursor-not-allowed opacity-60',
        isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/30',
      )}
      title={disabled ? 'Editing disabled' : 'Drag onto a team column to assign'}
    >
      <div className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground" aria-hidden>
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">
          {employee.preferredName || employee.fullName}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {employee.workforce.expertises.length > 0
            ? employee.workforce.expertises.join(', ')
            : 'No expertise set'}
        </p>
      </div>
    </div>
  );
}

type DropZoneProps = {
  dropId: string;
  label: string;
  hint?: string;
  isHighlighted?: boolean;
  className?: string;
};

export function ScheduleTeamDropZone({
  dropId,
  label,
  hint = 'Drop worker here',
  isHighlighted,
  className,
}: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const active = Boolean(isHighlighted || isOver);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-16 flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-center transition-all',
        active
          ? 'border-primary bg-primary/15 shadow-sm ring-2 ring-primary/40'
          : 'border-border bg-background/90',
        className,
      )}
    >
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

type FlatDropProps = {
  colIdx: number;
  isHighlighted?: boolean;
};

export function ScheduleFlatTeamDropSurface({ colIdx, isHighlighted }: FlatDropProps) {
  const { setNodeRef, isOver } = useDroppable({ id: scheduleTeamDropId(colIdx) });
  const active = Boolean(isHighlighted || isOver);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md border-2 border-dashed px-3 py-6 text-center transition-all',
        active
          ? 'border-primary bg-primary/15 shadow-sm ring-2 ring-primary/40'
          : 'border-border/80 bg-background/60',
      )}
    >
      <p className="text-xs font-semibold text-foreground">Drop worker on this team</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">Fills the next empty worker slot</p>
    </div>
  );
}
