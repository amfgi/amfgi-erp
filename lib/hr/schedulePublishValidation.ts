import { parseTimeCell } from '@/lib/hr/dubaiShift';

export type ScheduleTeamDraftForValidation = {
  label: string;
  jobId: string;
  dutyStart: string;
  dutyEnd: string;
  breakStart: string;
  breakEnd: string;
  splitMode: boolean;
  members: { employeeId: string }[];
  subTeams: { members: { employeeId: string }[] }[];
};

export type ScheduleTeamHours = {
  dutyMinutes: number | null;
  breakMinutes: number;
  netMinutes: number | null;
};

export type SchedulePublishLowHourTeam = {
  label: string;
  netHours: number;
};

export type SchedulePublishValidationResult = {
  blockingIssues: string[];
  lowHourTeams: SchedulePublishLowHourTeam[];
};

const LOW_HOUR_THRESHOLD = 5;

export function parseScheduleBreakWindow(raw: string | null | undefined): {
  breakStart: string;
  breakEnd: string;
} {
  if (!raw) return { breakStart: '', breakEnd: '' };
  const match = raw.trim().match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
  return match ? { breakStart: match[1], breakEnd: match[2] } : { breakStart: '', breakEnd: '' };
}

export function dbAssignmentToValidationDraft(assignment: {
  label: string;
  jobId: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  breakWindow: string | null;
  members: { employeeId: string }[];
}): ScheduleTeamDraftForValidation {
  const brk = parseScheduleBreakWindow(assignment.breakWindow);
  return {
    label: assignment.label,
    jobId: assignment.jobId ?? '',
    dutyStart: assignment.shiftStart ?? '',
    dutyEnd: assignment.shiftEnd ?? '',
    breakStart: brk.breakStart,
    breakEnd: brk.breakEnd,
    splitMode: false,
    members: assignment.members.map((member) => ({ employeeId: member.employeeId })),
    subTeams: [],
  };
}

export function scheduleTeamHasAssignedWorkers(draft: ScheduleTeamDraftForValidation): boolean {
  if (draft.splitMode) {
    return draft.subTeams.some((subTeam) =>
      subTeam.members.some((member) => Boolean(member.employeeId)),
    );
  }
  return draft.members.some((member) => Boolean(member.employeeId));
}

export function scheduleTeamHasJobNumber(draft: ScheduleTeamDraftForValidation): boolean {
  return Boolean(String(draft.jobId ?? '').trim());
}

export function scheduleTeamIsEmpty(draft: ScheduleTeamDraftForValidation): boolean {
  return !scheduleTeamHasJobNumber(draft) && !scheduleTeamHasAssignedWorkers(draft);
}

/** Minutes from start → end; adds 24h when end is before start (overnight shift). */
export function scheduleMinutesBetween(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): number | null {
  const start = parseTimeCell(startRaw);
  const end = parseTimeCell(endRaw);
  if (!start || !end) return null;
  let startMin = start.hour * 60 + start.minute;
  let endMin = end.hour * 60 + end.minute;
  if (endMin <= startMin) endMin += 24 * 60;
  return endMin - startMin;
}

function formatHoursFromMinutes(minutes: number): string {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return String(hours);
  return hours.toFixed(1).replace(/\.0$/, '');
}

export function computeScheduleTeamHours(draft: ScheduleTeamDraftForValidation): ScheduleTeamHours {
  const dutyMinutes = scheduleMinutesBetween(draft.dutyStart, draft.dutyEnd);
  const hasBreak = Boolean(String(draft.breakStart ?? '').trim() && String(draft.breakEnd ?? '').trim());
  const breakMinutes = hasBreak
    ? scheduleMinutesBetween(draft.breakStart, draft.breakEnd) ?? 0
    : 0;
  const netMinutes = dutyMinutes == null ? null : dutyMinutes - breakMinutes;
  return { dutyMinutes, breakMinutes, netMinutes };
}

export function formatScheduleHourBreakSummary(draft: ScheduleTeamDraftForValidation): string {
  const { breakMinutes, netMinutes } = computeScheduleTeamHours(draft);
  if (netMinutes == null) return '—';
  const netLabel = formatHoursFromMinutes(netMinutes);
  if (breakMinutes > 0) {
    return `${netLabel} h(exclude break) duty, ${formatHoursFromMinutes(breakMinutes)} h break`;
  }
  return `${netLabel} h(exclude break) duty`;
}

function teamLabel(draft: ScheduleTeamDraftForValidation, index: number): string {
  const label = String(draft.label ?? '').trim();
  return label || `Team ${index + 1}`;
}

export function validateScheduleForPublish(
  drafts: ScheduleTeamDraftForValidation[],
): SchedulePublishValidationResult {
  const blockingIssues: string[] = [];
  const lowHourTeams: SchedulePublishLowHourTeam[] = [];

  if (drafts.length === 0) {
    blockingIssues.push('Add at least one team column before publishing.');
    return { blockingIssues, lowHourTeams };
  }

  drafts.forEach((draft, index) => {
    const label = teamLabel(draft, index);
    const hasJob = scheduleTeamHasJobNumber(draft);
    const hasWorkers = scheduleTeamHasAssignedWorkers(draft);

    if (scheduleTeamIsEmpty(draft)) {
      blockingIssues.push(`${label}: column is empty (no job number and no workers assigned).`);
      return;
    }

    if (hasJob && !hasWorkers) {
      blockingIssues.push(`${label}: job number is selected but no workers are assigned.`);
      return;
    }

    if (hasWorkers && !hasJob) {
      blockingIssues.push(`${label}: workers are assigned but no job number is selected.`);
      return;
    }

    const { netMinutes } = computeScheduleTeamHours(draft);
    if (netMinutes == null) {
      blockingIssues.push(`${label}: duty in/out times are required before publishing.`);
      return;
    }

    const netHours = netMinutes / 60;
    if (netHours <= 0) {
      blockingIssues.push(
        `${label}: total work hours must be greater than 0 (currently ${formatHoursFromMinutes(netMinutes)} h).`,
      );
      return;
    }

    if (netHours <= LOW_HOUR_THRESHOLD) {
      lowHourTeams.push({ label, netHours });
    }
  });

  return { blockingIssues, lowHourTeams };
}

export function assertSchedulePublishable(
  drafts: ScheduleTeamDraftForValidation[],
  options?: { acknowledgeLowHours?: boolean },
): string | null {
  const validation = validateScheduleForPublish(drafts);
  if (validation.blockingIssues.length > 0) {
    return validation.blockingIssues.join(' ');
  }
  if (!options?.acknowledgeLowHours && validation.lowHourTeams.length > 0) {
    return 'Some teams have 5 hours or less of net duty time. Confirm to publish anyway.';
  }
  return null;
}
