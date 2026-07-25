import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { isSundayYmd } from '@/lib/hr/payroll/calendar';

export type PortalAttendanceKind = 'present' | 'absent' | 'leave' | 'sunday' | 'other';

export type PortalAttendanceLike = {
  workDate: string;
  status: string;
  leaveType?: string | null;
  leaveTypeId?: string | null;
  leaveRequestId?: string | null;
  source?: string | null;
  leaveTypeRef?: { name?: string | null; code?: string | null; rules?: unknown } | null;
};

export function portalWorkDateYmd(workDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return workDate;
  const iso = workDate.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return workDate;
}

function leaveTypeLabel(row: PortalAttendanceLike): string | null {
  const name = row.leaveTypeRef?.name?.trim();
  if (name) return name;
  if (row.leaveType) return String(row.leaveType).replaceAll('_', ' ');
  return null;
}

/** Leave for portal display: approved leave / leave types, not the UNPAID marker used for absences. */
export function isPortalLeaveDay(row: PortalAttendanceLike): boolean {
  const code = row.leaveTypeRef?.code?.toUpperCase() ?? '';
  if (row.leaveTypeId && code && code !== 'UNPAID') return true;
  return isPayrollLeaveLine({
    status: row.status,
    leaveType: row.leaveType,
    leaveTypeId: row.leaveTypeId,
    leaveRequestId: row.leaveRequestId,
    source: row.source,
    leaveTypeCode: row.leaveTypeRef?.code ?? null,
    leaveTypeRules: row.leaveTypeRef?.rules,
  });
}

export function portalAttendanceDisplay(row: PortalAttendanceLike): {
  label: string;
  kind: PortalAttendanceKind;
} {
  const status = String(row.status ?? '').toUpperCase();
  const ymd = portalWorkDateYmd(row.workDate);
  const onLeave = isPortalLeaveDay(row);

  if (status === 'PRESENT') {
    return { label: 'Present', kind: 'present' };
  }
  if (status === 'HALF_DAY') {
    return { label: 'Half day', kind: 'present' };
  }
  if (status === 'MISSING_PUNCH') {
    return { label: 'Missing punch', kind: 'other' };
  }

  // Weekly off takes precedence over unpaid/absent markers used on Sundays.
  if (isSundayYmd(ymd) && (status === 'ABSENT' || status === 'LEAVE' || onLeave)) {
    return { label: 'Sunday', kind: 'sunday' };
  }

  if (status === 'LEAVE' || onLeave) {
    return { label: leaveTypeLabel(row) || 'Leave', kind: 'leave' };
  }

  if (status === 'ABSENT') {
    return { label: 'Absent', kind: 'absent' };
  }

  return { label: status.replaceAll('_', ' ') || 'Unknown', kind: 'other' };
}
