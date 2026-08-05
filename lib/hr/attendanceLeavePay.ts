import { isPaidLeaveType } from '@/lib/hr/leaveTypes';
import { isPaidLeaveFromRules, parseLeaveTypeRules } from '@/lib/hr/leaveTypeRules';

export function isStoredLeaveStatus(status: string): boolean {
  return status === 'LEAVE';
}

export function isLeaveManagedAttendance(entry: {
  leaveRequestId?: string | null;
  source?: string | null;
}): boolean {
  return Boolean(entry.leaveRequestId) || entry.source === 'LEAVE_REQUEST';
}

/** True when payroll should treat the day as leave (paid or unpaid), not a normal present day. */
export function isPayrollLeaveLine(line: {
  status: string;
  leaveType?: string | null;
  leaveTypeId?: string | null;
  leaveRequestId?: string | null;
  source?: string | null;
  leaveTypeCode?: string | null;
  leaveTypeRules?: unknown;
}): boolean {
  if (isStoredLeaveStatus(line.status)) return true;
  if (isLeaveManagedAttendance(line)) return true;
  if (line.leaveTypeId) {
    const code = line.leaveTypeCode?.toUpperCase() ?? '';
    if (code === 'UNPAID') return false;
    const rules = parseLeaveTypeRules(line.leaveTypeRules);
    if (isPaidLeaveFromRules(rules)) return true;
  }
  if (line.leaveType && isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY')) {
    return true;
  }
  return false;
}

/** Fraction of a normal day's pay a leave line earns (1 = full, 0.5 = half-pay tier, 0 = unpaid). */
export function leavePayFraction(line: {
  status: string;
  leaveType?: string | null;
  leaveTypeId?: string | null;
  leaveRequestId?: string | null;
  leaveTypeCode?: string | null;
  leaveTypeRules?: unknown;
  leavePayPercent?: number;
}): number {
  if (!isPayrollLeaveLine(line)) return 0;
  if (line.leavePayPercent != null) return Math.max(0, line.leavePayPercent) / 100;
  return isPaidLeaveType(line.leaveType as 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY') ? 1 : 0;
}

/** True when payroll should pay this leave day (fully or partially). */
export function isLeavePaidForPay(line: {
  status: string;
  leaveType?: string | null;
  leaveTypeId?: string | null;
  leaveRequestId?: string | null;
  leaveTypeCode?: string | null;
  leaveTypeRules?: unknown;
  leavePayPercent?: number;
}): boolean {
  return leavePayFraction(line) > 0;
}
