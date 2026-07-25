import { portalAttendanceDisplay } from '@/lib/hr/portalAttendanceDisplay';

describe('portalAttendanceDisplay', () => {
  it('labels Sunday absences as Sunday, not Absent', () => {
    expect(
      portalAttendanceDisplay({
        workDate: '2026-07-26',
        status: 'ABSENT',
        leaveTypeId: 'lt-unpaid',
        leaveTypeRef: { name: 'Unpaid leave', code: 'UNPAID' },
      })
    ).toEqual({ label: 'Sunday', kind: 'sunday' });
  });

  it('labels paid leave by leave type name', () => {
    expect(
      portalAttendanceDisplay({
        workDate: '2026-07-27',
        status: 'ABSENT',
        leaveTypeId: 'lt-annual',
        leaveTypeRef: {
          name: 'Annual leave',
          code: 'ANNUAL',
          rules: { countsAsPaidLeave: true },
        },
      })
    ).toEqual({ label: 'Annual leave', kind: 'leave' });
  });

  it('labels true weekday absences as Absent', () => {
    expect(
      portalAttendanceDisplay({
        workDate: '2026-07-27',
        status: 'ABSENT',
        leaveTypeId: 'lt-unpaid',
        leaveTypeRef: { name: 'Unpaid leave', code: 'UNPAID' },
      })
    ).toEqual({ label: 'Absent', kind: 'absent' });
  });

  it('keeps present status on Sundays', () => {
    expect(
      portalAttendanceDisplay({
        workDate: '2026-07-26',
        status: 'PRESENT',
      })
    ).toEqual({ label: 'Present', kind: 'present' });
  });
});
