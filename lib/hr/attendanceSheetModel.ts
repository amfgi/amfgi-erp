import type {
  AttendanceGridDraftRow,
  AttendanceGridEmployee,
  AttendanceScheduleTimingBaseline,
} from '@/components/hr/AttendanceEntryGrid';
import {
  defaultUnpaidLeaveTypeId,
  isDraftNonWorking,
  normalizeDraftStatusFromApi,
  type LeaveTypeOption,
} from '@/lib/hr/attendanceDraftStatus';
import { employeeSortLabel } from '@/lib/hr/employeeListQuery';
import { combineDateAndTimeToIsoAllowOvernight } from '@/lib/hr/attendanceDuration';
import { parseTimeCell } from '@/lib/hr/dubaiShift';

export type AttendanceSheetEmployee = AttendanceGridEmployee & {
  profileExtension?: unknown;
  defaultTiming?: {
    dutyStart?: string;
    dutyEnd?: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
};

export type AttendanceAssignmentRow = {
  id: string;
  label: string;
  jobId: string | null;
  jobNumberSnapshot: string | null;
  siteNameSnapshot: string | null;
  customerName: string | null;
  siteName: string | null;
  projectDetails: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  breakWindow: string | null;
  teamLeaderEmployeeId?: string | null;
  driver1EmployeeId?: string | null;
  driver2EmployeeId?: string | null;
  members?: Array<{ employeeId?: string }>;
};

export const DAY_SHEET_FIELD_CLASS =
  'h-7 min-h-7 rounded-md border border-border bg-background px-2 py-0 text-xs leading-7 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

export const TOOLBAR_TAG_CLASS =
  'inline-flex h-auto shrink-0 items-center rounded border px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function attendanceDraftRowKey(draft: AttendanceGridDraftRow): string {
  return draft.workDate?.trim() || draft.employeeId;
}

export function cloneDraftRows(rows: AttendanceGridDraftRow[]): AttendanceGridDraftRow[] {
  return rows.map((row) => ({ ...row }));
}

export function draftsEqual(a: AttendanceGridDraftRow[], b: AttendanceGridDraftRow[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function employeeDisplayName(employee: AttendanceSheetEmployee | undefined): string {
  if (!employee) return '';
  return employeeSortLabel(employee);
}

export function formatWorkDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function toDateYmd(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function toLocalTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const dubaiMs = dt.getTime() + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dubai.getUTCHours())}:${pad(dubai.getUTCMinutes())}`;
}

export function parseBreakWindow(raw: string | null | undefined): { breakInAt: string; breakOutAt: string } {
  if (!raw) return { breakInAt: '', breakOutAt: '' };
  const m = raw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
  if (!m) return { breakInAt: '', breakOutAt: '' };
  return { breakInAt: m[1].padStart(5, '0'), breakOutAt: m[2].padStart(5, '0') };
}

function normalizeTimeCell(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return raw;
}

export function scheduleTimingBaselineFromPunchTimes(times: {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  breakInAt?: string | null;
  breakOutAt?: string | null;
}): AttendanceScheduleTimingBaseline {
  return {
    checkInAt: normalizeTimeCell(times.checkInAt),
    checkOutAt: normalizeTimeCell(times.checkOutAt),
    breakInAt: normalizeTimeCell(times.breakInAt),
    breakOutAt: normalizeTimeCell(times.breakOutAt),
  };
}

export function scheduleTimingBaselineHasTimes(
  baseline: AttendanceScheduleTimingBaseline | null | undefined
): boolean {
  if (!baseline) return false;
  return [baseline.checkInAt, baseline.checkOutAt, baseline.breakInAt, baseline.breakOutAt].some(
    (value) => String(value ?? '').trim() !== ''
  );
}

/**
 * Expected punch times from schedule assignment + employee default timing.
 * `daySheet` matches /hr/attendance/create defaults; `employeeMonth` matches
 * buildDraftForNewEmployeeDate (office/driver may use assignment shift).
 */
export function resolveScheduleDefaultPunchTimes(
  employee: Pick<AttendanceSheetEmployee, 'employeeType' | 'defaultTiming'>,
  assigned?: Pick<AttendanceAssignmentRow, 'shiftStart' | 'shiftEnd' | 'breakWindow'> | null,
  mode: 'daySheet' | 'employeeMonth' = 'daySheet'
): AttendanceScheduleTimingBaseline {
  const employeeType = employee.employeeType ?? 'LABOUR_WORKER';
  const defaultTiming = employee.defaultTiming ?? null;
  const scheduledBreak = parseBreakWindow(assigned?.breakWindow);

  if (employeeType === 'OFFICE_STAFF' || employeeType === 'DRIVER') {
    if (mode === 'employeeMonth') {
      return scheduleTimingBaselineFromPunchTimes({
        checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
        checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
        breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
        breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
      });
    }
    // Day sheet loads office/driver from employee defaults (not assignment shift).
    return scheduleTimingBaselineFromPunchTimes({
      checkInAt: defaultTiming?.dutyStart || '',
      checkOutAt: defaultTiming?.dutyEnd || '',
      breakInAt: defaultTiming?.breakStart || '',
      breakOutAt: defaultTiming?.breakEnd || '',
    });
  }

  if (employeeType === 'HYBRID_STAFF') {
    return scheduleTimingBaselineFromPunchTimes({
      checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
      checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
      breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
      breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
    });
  }

  return scheduleTimingBaselineFromPunchTimes({
    checkInAt: assigned?.shiftStart || '',
    checkOutAt: assigned?.shiftEnd || '',
    breakInAt: scheduledBreak.breakInAt,
    breakOutAt: scheduledBreak.breakOutAt,
  });
}

export function attachScheduleTimingBaseline(
  draft: AttendanceGridDraftRow,
  baseline?: AttendanceScheduleTimingBaseline | null
): AttendanceGridDraftRow {
  // One-arg call snapshots the draft's current times. Explicit `null` clears the baseline.
  if (baseline !== undefined) {
    return attachScheduleBaselines(draft, { timingBaseline: baseline });
  }
  return attachScheduleBaselines(draft);
}

export function resolveScheduleDefaultStatus(
  employee: Pick<AttendanceSheetEmployee, 'employeeType' | 'status'>,
  hasAssignment: boolean
): 'PRESENT' | 'ABSENT' {
  if (employee.status === 'ON_LEAVE') return 'ABSENT';
  if (hasAssignment) return 'PRESENT';
  const employeeType = employee.employeeType ?? 'LABOUR_WORKER';
  if (employeeType === 'OFFICE_STAFF' || employeeType === 'DRIVER' || employeeType === 'HYBRID_STAFF') {
    return 'PRESENT';
  }
  return 'ABSENT';
}

export function attachScheduleBaselines(
  draft: AttendanceGridDraftRow,
  options?: {
    timingBaseline?: AttendanceScheduleTimingBaseline | null;
    statusBaseline?: 'PRESENT' | 'ABSENT' | null;
  }
): AttendanceGridDraftRow {
  const statusBaseline = options?.statusBaseline ?? draft.status;
  const hasExplicitTimingBaseline = Boolean(options && 'timingBaseline' in options);

  if (isDraftNonWorking(draft)) {
    return {
      ...draft,
      scheduleTimingBaseline: hasExplicitTimingBaseline ? options?.timingBaseline ?? null : null,
      scheduleStatusBaseline: statusBaseline,
    };
  }

  const nextTimingBaseline = hasExplicitTimingBaseline
    ? options?.timingBaseline ?? null
    : scheduleTimingBaselineFromPunchTimes({
        checkInAt: draft.checkInAt,
        checkOutAt: draft.checkOutAt,
        breakInAt: draft.breakInAt,
        breakOutAt: draft.breakOutAt,
      });

  return {
    ...draft,
    scheduleTimingBaseline: scheduleTimingBaselineHasTimes(nextTimingBaseline)
      ? nextTimingBaseline
      : null,
    scheduleStatusBaseline: statusBaseline,
  };
}

export function draftTimingDiffersFromScheduleBaseline(draft: AttendanceGridDraftRow): boolean {
  if (isDraftNonWorking(draft)) return false;
  const baseline = draft.scheduleTimingBaseline;
  if (!scheduleTimingBaselineHasTimes(baseline) || !baseline) return false;
  return (
    normalizeTimeCell(draft.checkInAt) !== baseline.checkInAt ||
    normalizeTimeCell(draft.checkOutAt) !== baseline.checkOutAt ||
    normalizeTimeCell(draft.breakInAt) !== baseline.breakInAt ||
    normalizeTimeCell(draft.breakOutAt) !== baseline.breakOutAt
  );
}

export function draftStatusDiffersFromScheduleBaseline(draft: AttendanceGridDraftRow): boolean {
  const baseline = draft.scheduleStatusBaseline;
  if (baseline !== 'PRESENT' && baseline !== 'ABSENT') return false;
  return draft.status !== baseline;
}

export function draftDiffersFromScheduleBaseline(draft: AttendanceGridDraftRow): boolean {
  return draftTimingDiffersFromScheduleBaseline(draft) || draftStatusDiffersFromScheduleBaseline(draft);
}

export function combineDateAndTimeToIso(
  workDate: string,
  timeVal: string,
  after?: Date | null
): string | null {
  return combineDateAndTimeToIsoAllowOvernight(workDate, timeVal, after);
}

/** Build duty/break ISO timestamps with overnight roll for times after midnight. */
export function combineAttendancePunchTimesToIso(
  workDate: string,
  times: {
    checkInAt: string;
    checkOutAt: string;
    breakInAt: string;
    breakOutAt: string;
  }
): {
  checkInAt: string | null;
  checkOutAt: string | null;
  breakInAt: string | null;
  breakOutAt: string | null;
} {
  const checkInAt = combineDateAndTimeToIso(workDate, times.checkInAt);
  const checkInDate = checkInAt ? new Date(checkInAt) : null;
  const breakInAt = combineDateAndTimeToIso(workDate, times.breakInAt, checkInDate);
  const breakInDate = breakInAt ? new Date(breakInAt) : checkInDate;
  const breakOutAt = combineDateAndTimeToIso(workDate, times.breakOutAt, breakInDate);
  const checkOutAt = combineDateAndTimeToIso(workDate, times.checkOutAt, checkInDate);
  return { checkInAt, checkOutAt, breakInAt, breakOutAt };
}

export function sanitizeAbsentDraft(draft: AttendanceGridDraftRow): AttendanceGridDraftRow {
  if (!isDraftNonWorking(draft)) return draft;
  return {
    ...draft,
    workAssignmentId: '',
    externalJobId: null,
    jobNumber: '',
    checkInAt: '',
    checkOutAt: '',
    breakInAt: '',
    breakOutAt: '',
  };
}

export function assignmentFromAttendanceWorkAssignment(raw: Record<string, unknown>): AttendanceAssignmentRow {
  const costing = (raw.costingSnapshot as Record<string, unknown> | null) ?? null;
  const job = (raw.job as Record<string, unknown> | null) ?? null;
  const customerName =
    String(costing?.customerName ?? raw.clientNameSnapshot ?? '').trim() || null;
  const siteName = String(costing?.siteName ?? raw.siteNameSnapshot ?? '').trim() || null;
  const projectDetails =
    String(costing?.projectDetails ?? raw.projectDetailsSnapshot ?? '').trim() || null;
  const jobNumber = String(costing?.jobNumber ?? raw.jobNumberSnapshot ?? '').trim() || null;

  return {
    id: String(raw.id),
    label: String(raw.label ?? ''),
    jobId: String(raw.jobId ?? job?.id ?? '').trim() || null,
    jobNumberSnapshot: jobNumber,
    siteNameSnapshot: raw.siteNameSnapshot != null ? String(raw.siteNameSnapshot) : null,
    customerName,
    siteName,
    projectDetails,
    shiftStart: (raw.shiftStart as string | null | undefined) ?? null,
    shiftEnd: (raw.shiftEnd as string | null | undefined) ?? null,
    breakWindow: (raw.breakWindow as string | null | undefined) ?? null,
    teamLeaderEmployeeId: null,
    driver1EmployeeId: null,
    driver2EmployeeId: null,
    members: [],
  };
}

export function buildDraftFromExistingAttendanceRow(
  employee: AttendanceSheetEmployee,
  row: Record<string, unknown>,
  leaveTypes: LeaveTypeOption[]
): AttendanceGridDraftRow {
  const existingAssignment = (row.workAssignment as Record<string, unknown> | null) ?? null;
  const storedStatus =
    (row.status as AttendanceGridDraftRow['status'] | 'LEAVE' | 'HALF_DAY' | 'MISSING_PUNCH') ?? 'PRESENT';
  const normalized = normalizeDraftStatusFromApi(storedStatus, leaveTypes);
  const shouldClearTiming = isDraftNonWorking(normalized);

  const snapBasic = Number(row.basicHours);
  const basicHours =
    Number.isFinite(snapBasic) && snapBasic > 0 ? snapBasic : employee.basicHoursPerDay ?? 8;

  const assignmentForBaseline = existingAssignment
    ? {
        shiftStart: (existingAssignment.shiftStart as string | null | undefined) ?? null,
        shiftEnd: (existingAssignment.shiftEnd as string | null | undefined) ?? null,
        breakWindow: (existingAssignment.breakWindow as string | null | undefined) ?? null,
      }
    : null;

  // Existing rows must show stored punches only — do not refill from schedule/default
  // timing, or cleared break/duty times reappear after save + reload.
  const workAssignmentId = String((existingAssignment?.id as string | undefined) ?? '');
  return attachScheduleBaselines(
    sanitizeAbsentDraft({
      employeeId: employee.id,
      workDate: toDateYmd((row.workDate as string | Date) ?? ''),
      entryId: String(row.id ?? '') || null,
      workAssignmentId,
      jobNumber: String((existingAssignment?.jobNumberSnapshot as string | undefined) ?? ''),
      status: normalized.status,
      leaveTypeId: normalized.leaveTypeId,
      basicHours,
      checkInAt: shouldClearTiming ? '' : toLocalTimeInput((row.checkInAt as string | null) ?? null),
      checkOutAt: shouldClearTiming ? '' : toLocalTimeInput((row.checkOutAt as string | null) ?? null),
      breakInAt: shouldClearTiming ? '' : toLocalTimeInput((row.breakStartAt as string | null) ?? null),
      breakOutAt: shouldClearTiming ? '' : toLocalTimeInput((row.breakEndAt as string | null) ?? null),
      remarks: String((row.remarks as string | null | undefined) ?? ''),
      source: 'existing',
      leaveRequestId: (row.leaveRequestId as string | null | undefined) ?? null,
      attendanceSource: (row.source as string | null | undefined) ?? null,
    }),
    {
      timingBaseline: shouldClearTiming
        ? null
        : resolveScheduleDefaultPunchTimes(employee, assignmentForBaseline, 'employeeMonth'),
      statusBaseline: resolveScheduleDefaultStatus(employee, Boolean(workAssignmentId)),
    }
  );
}

export function buildDraftForNewEmployeeDate(
  employee: AttendanceSheetEmployee,
  workDate: string,
  leaveTypes: LeaveTypeOption[],
  assigned?: AttendanceAssignmentRow
): AttendanceGridDraftRow {
  const employeeType = employee.employeeType ?? 'LABOUR_WORKER';
  const defaultTiming = employee.defaultTiming ?? null;
  const scheduledBreak = parseBreakWindow(assigned?.breakWindow);
  const basicHours = employee.basicHoursPerDay ?? 8;

  if (employee.status === 'ON_LEAVE') {
    return attachScheduleTimingBaseline(
      sanitizeAbsentDraft({
        employeeId: employee.id,
        workDate,
        entryId: null,
        workAssignmentId: '',
        jobNumber: '',
        status: 'ABSENT',
        leaveTypeId: defaultUnpaidLeaveTypeId(leaveTypes),
        basicHours,
        checkInAt: '',
        checkOutAt: '',
        breakInAt: '',
        breakOutAt: '',
        remarks: '',
        source: 'manual',
      }),
      null
    );
  }

  if (employeeType === 'OFFICE_STAFF' || employeeType === 'DRIVER') {
    return attachScheduleTimingBaseline({
      employeeId: employee.id,
      workDate,
      entryId: null,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: employeeType === 'DRIVER' ? assigned?.jobNumberSnapshot ?? '' : '',
      status: 'PRESENT',
      basicHours,
      checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
      checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
      breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
      breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
      remarks: '',
      source: assigned ? 'schedule' : 'manual',
    });
  }

  if (employeeType === 'HYBRID_STAFF') {
    return attachScheduleTimingBaseline({
      employeeId: employee.id,
      workDate,
      entryId: null,
      workAssignmentId: assigned?.id ?? '',
      jobNumber: assigned?.jobNumberSnapshot ?? '',
      status: 'PRESENT',
      basicHours,
      checkInAt: assigned?.shiftStart || defaultTiming?.dutyStart || '',
      checkOutAt: assigned?.shiftEnd || defaultTiming?.dutyEnd || '',
      breakInAt: assigned ? scheduledBreak.breakInAt : defaultTiming?.breakStart || '',
      breakOutAt: assigned ? scheduledBreak.breakOutAt : defaultTiming?.breakEnd || '',
      remarks: '',
      source: assigned ? 'schedule' : 'manual',
    });
  }

  return attachScheduleTimingBaseline({
    employeeId: employee.id,
    workDate,
    entryId: null,
    workAssignmentId: assigned?.id ?? '',
    jobNumber: assigned?.jobNumberSnapshot ?? '',
    status: assigned ? 'PRESENT' : 'ABSENT',
    leaveTypeId: assigned ? undefined : defaultUnpaidLeaveTypeId(leaveTypes),
    basicHours,
    checkInAt: assigned?.shiftStart || '',
    checkOutAt: assigned?.shiftEnd || '',
    breakInAt: scheduledBreak.breakInAt,
    breakOutAt: scheduledBreak.breakOutAt,
    remarks: '',
    source: assigned ? 'schedule' : 'manual',
  });
}

function minutesFromTimeValue(timeVal: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(timeVal)) return null;
  const [hours, minutes] = timeVal.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function diffMinutes(start: string, end: string): number {
  const startMinutes = minutesFromTimeValue(start);
  const endMinutes = minutesFromTimeValue(end);
  if (startMinutes == null || endMinutes == null) return 0;
  if (endMinutes === startMinutes) return 0;
  return endMinutes > startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes;
}

export function calculateWorkedMinutes(draft: AttendanceGridDraftRow): number {
  if (isDraftNonWorking(draft)) return 0;
  const dutyMinutes = diffMinutes(draft.checkInAt, draft.checkOutAt);
  const breakMinutes = diffMinutes(draft.breakInAt, draft.breakOutAt);
  return Math.max(0, dutyMinutes - breakMinutes);
}

export function formatHourValue(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} h`;
}

function draftHasTimingFields(draft: AttendanceGridDraftRow): boolean {
  return [draft.checkInAt, draft.checkOutAt, draft.breakInAt, draft.breakOutAt].some(
    (value) => String(value ?? '').trim() !== ''
  );
}

function isTimeFilled(value: string | null | undefined): boolean {
  return String(value ?? '').trim() !== '';
}

/**
 * Allowed punch patterns for present rows:
 * - no times
 * - Duty in + Duty out only
 * - all four: Duty in, Break out, Break in, Duty out
 *
 * Any other combination (1 field, 3 fields, partial break, etc.) is invalid.
 * Grid mapping: breakInAt = Break out, breakOutAt = Break in.
 */
export function incompletePunchPatternReason(
  draft: Pick<AttendanceGridDraftRow, 'status' | 'checkInAt' | 'checkOutAt' | 'breakInAt' | 'breakOutAt'>
): string | null {
  if (draft.status === 'ABSENT' || isDraftNonWorking(draft)) return null;

  const dutyIn = isTimeFilled(draft.checkInAt);
  const dutyOut = isTimeFilled(draft.checkOutAt);
  const breakOut = isTimeFilled(draft.breakInAt);
  const breakIn = isTimeFilled(draft.breakOutAt);
  const filledCount = [dutyIn, dutyOut, breakOut, breakIn].filter(Boolean).length;

  if (filledCount === 0) return null;
  if (dutyIn && dutyOut && !breakOut && !breakIn) return null;
  if (dutyIn && dutyOut && breakOut && breakIn) return null;

  if (filledCount === 1) {
    return 'Only one time filled — use Duty in + Duty out, or fill all four times';
  }
  if (filledCount === 3) {
    return 'Three times filled — complete all four, or clear both break times';
  }
  if (breakOut !== breakIn) {
    return 'Break out and Break in must both be filled or both empty';
  }
  if (dutyIn !== dutyOut) {
    return 'Duty in and Duty out must both be filled';
  }
  if ((breakOut || breakIn) && !(dutyIn && dutyOut)) {
    return 'Break times require Duty in and Duty out';
  }
  return 'Incomplete times — use Duty in + Duty out, or fill all four times';
}

type HourIndicatorKind = 'under_6' | 'over_12' | 'over_14';

function presentHourIndicatorWarning(
  draft: AttendanceGridDraftRow
): { kind: HourIndicatorKind; label: string; workedMinutes: number } | null {
  if (isDraftNonWorking(draft)) return null;
  const workedMinutes = calculateWorkedMinutes(draft);
  const hasTiming = draftHasTimingFields(draft);
  if (!hasTiming && workedMinutes === 0) return null;

  const hours = workedMinutes / 60;
  if (hours > 14) return { kind: 'over_14', label: 'More than 14 hours', workedMinutes };
  if (hours > 12) return { kind: 'over_12', label: 'More than 12 hours', workedMinutes };
  if (hours < 6) return { kind: 'under_6', label: 'Less than 6 hours', workedMinutes };
  return null;
}

export type SaveValidationIssueRow = {
  rowKey: string;
  label: string;
  secondaryLabel?: string;
  workedLabel?: string;
  indicatorLabel?: string;
  indicatorKind?: HourIndicatorKind;
};

export type SaveValidationIssues = {
  /** Hard block — incomplete duty/break punch patterns. */
  incompletePunchTimes: SaveValidationIssueRow[];
  absentWithTiming: SaveValidationIssueRow[];
  presentHourWarnings: SaveValidationIssueRow[];
  onLeaveMarkedPresent: SaveValidationIssueRow[];
};

export function hasBlockingSaveIssues(issues: SaveValidationIssues): boolean {
  return issues.incompletePunchTimes.length > 0;
}

export function hasSoftSaveWarnings(issues: SaveValidationIssues): boolean {
  return (
    issues.absentWithTiming.length > 0 ||
    issues.presentHourWarnings.length > 0 ||
    issues.onLeaveMarkedPresent.length > 0
  );
}

export function collectSaveValidationIssues(
  drafts: AttendanceGridDraftRow[],
  options: {
    labelForDraft: (draft: AttendanceGridDraftRow) => string;
    secondaryForDraft?: (draft: AttendanceGridDraftRow) => string | undefined;
    isOnLeaveRow?: (draft: AttendanceGridDraftRow) => boolean;
    leaveLabelForDraft?: (draft: AttendanceGridDraftRow) => string | undefined;
  }
): SaveValidationIssues {
  const incompletePunchTimes: SaveValidationIssueRow[] = [];
  const absentWithTiming: SaveValidationIssueRow[] = [];
  const presentHourWarnings: SaveValidationIssueRow[] = [];
  const onLeaveMarkedPresent: SaveValidationIssueRow[] = [];

  for (const draft of drafts) {
    const rowKey = attendanceDraftRowKey(draft);
    const row: SaveValidationIssueRow = {
      rowKey,
      label: options.labelForDraft(draft),
      secondaryLabel: options.secondaryForDraft?.(draft),
    };

    const punchReason = incompletePunchPatternReason(draft);
    if (punchReason) {
      incompletePunchTimes.push({ ...row, indicatorLabel: punchReason });
    }

    if (draft.status === 'ABSENT' && draftHasTimingFields(draft)) {
      absentWithTiming.push(row);
    }

    if (options.isOnLeaveRow?.(draft) && draft.status === 'PRESENT') {
      const approvedLeave = options.leaveLabelForDraft?.(draft);
      onLeaveMarkedPresent.push({
        ...row,
        indicatorLabel: approvedLeave
          ? `Approved leave · ${approvedLeave}`
          : 'On leave / assigned leave',
      });
    }

    const hourWarning = presentHourIndicatorWarning(draft);
    if (hourWarning) {
      presentHourWarnings.push({
        ...row,
        workedLabel: formatHourValue(hourWarning.workedMinutes),
        indicatorLabel: hourWarning.label,
        indicatorKind: hourWarning.kind,
      });
    }
  }

  incompletePunchTimes.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  absentWithTiming.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  presentHourWarnings.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  onLeaveMarkedPresent.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return { incompletePunchTimes, absentWithTiming, presentHourWarnings, onLeaveMarkedPresent };
}

export function hourIndicatorDotClass(kind: HourIndicatorKind | undefined): string {
  if (kind === 'over_14') return 'bg-destructive';
  if (kind === 'over_12') return 'bg-amber-500';
  return 'bg-sky-600 dark:bg-sky-400';
}
