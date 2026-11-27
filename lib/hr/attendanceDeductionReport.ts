import { absentDateRows, selectCurrentVisaPeriod } from '@/lib/hr/employeeHistory';
import { leaveTypeCountNote, type EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { HISTORY_SECTIONS, sectionSelected, type HistorySection, type HistorySectionSelection } from '@/lib/hr/employeeHistorySections';
import { computeEmployeeTenure } from '@/lib/hr/employeeTenure';
import { dubaiTodayYmd } from '@/lib/hr/leaveReturn';

export type AttendanceReportIncident = {
  id: string;
  date: string;
  reason: string;
  fine: string;
};

export type AttendanceReportPersonalRow = {
  key: string;
  label: string;
  value: string;
};

export type AttendanceReportDraft = {
  company: string;
  employee: string;
  period: string;
  generated: string;
  joinDate: string;
  service: string;
  currentSalary: string;
  unauthorizedLeave: string;
  totalLeave: string;
  absentDays: string;
  lateDays: string;
  timeLate: string;
  fineTotal: string;
  eidIssue: string;
  eidExpiry: string;
  visaExpiresWithin: string;
  visaAbsentDays: string;
  personal: AttendanceReportPersonalRow[];
  incidents: AttendanceReportIncident[];
};

export type HistoryBlock = {
  title: string;
  notes: string[];
  headers: string[];
  rows: string[][];
  empty: string;
};

function show(sections: HistorySectionSelection, section: Parameters<typeof sectionSelected>[1]) {
  return sectionSelected(sections, section);
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatLateDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

export function formatMoneyAed(amount: number): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} AED`;
}

export function dayCountLabel(count: number, trailingPeriod = false): string {
  const unit = count === 1 ? 'Day' : 'Days';
  return `${count} ${unit}${trailingPeriod ? '.' : ''}`;
}

export function displayFine(value: string): string {
  return value.trim() ? value : '-';
}

function prettyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function servicePhrase(report: EmployeeHistoryReport, today: string): string {
  const tenure = computeEmployeeTenure(report.employee.hireDate, {
    terminationDate: report.employee.terminationDate,
    status: report.employee.status,
    referenceDate: new Date(`${today}T12:00:00`),
  });
  if (!tenure || tenure.isFuture) return '';
  const parts: string[] = [];
  if (tenure.years > 0) parts.push(`${tenure.years} ${tenure.years === 1 ? 'Year' : 'Years'}`);
  if (tenure.months > 0) parts.push(`${tenure.months} ${tenure.months === 1 ? 'Month' : 'Months'}`);
  if (tenure.days > 0) parts.push(`${tenure.days} ${tenure.days === 1 ? 'Day' : 'Days'}`);
  return parts.length ? `${parts.join(', ')}.` : '0 Days.';
}

function monthsAndDays(from: string, to: string): { months: number; days: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return null;
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5, 7));
  const fromDay = Number(from.slice(8, 10));
  const toYear = Number(to.slice(0, 4));
  const toMonth = Number(to.slice(5, 7));
  const toDay = Number(to.slice(8, 10));
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  let days = toDay - fromDay;
  if (days < 0) {
    months -= 1;
    const previousMonthDays = new Date(toYear, toMonth - 1, 0).getDate();
    days += previousMonthDays;
  }
  if (months < 0) return null;
  return { months, days };
}

export function visaRemainingLabel(today: string, endDate: string): string {
  const span = monthsAndDays(today, endDate);
  if (!span) return '';
  const parts: string[] = [];
  if (span.months > 0) parts.push(`${span.months} Mo`);
  if (span.days > 0 || parts.length === 0) parts.push(`${span.days} ${span.days === 1 ? 'Day' : 'Days'}`);
  return `${parts.join(', ')}.`;
}

function currentVisa(report: EmployeeHistoryReport, today: string) {
  return selectCurrentVisaPeriod(report.visaPeriods ?? [], today);
}

function emiratesId(report: EmployeeHistoryReport) {
  return report.documents?.records.find((row) => /emirates\s*id/i.test(row.typeName)) ?? null;
}

function totalLeaveDays(block: NonNullable<EmployeeHistoryReport['attendanceAndLeave']>): number {
  const other = block.otherLeave.reduce((sum, row) => sum + row.days, 0);
  return block.sickDays + block.paidDays + block.unpaidDays + block.annualDays + other;
}

function personalRows(report: EmployeeHistoryReport): AttendanceReportPersonalRow[] {
  const employee = report.employee;
  return [
    { key: 'email', label: 'Email', value: employee.email ?? '' },
    { key: 'phone', label: 'Phone', value: employee.phone ?? '' },
    { key: 'nationality', label: 'Nationality', value: employee.nationality ?? '' },
    { key: 'dateOfBirth', label: 'Date of birth', value: displayDate(employee.dateOfBirth) },
    { key: 'gender', label: 'Gender', value: employee.gender ?? '' },
    { key: 'bloodGroup', label: 'Blood group', value: employee.bloodGroup ?? '' },
    { key: 'emergencyContactName', label: 'Emergency contact', value: employee.emergencyContactName ?? '' },
    { key: 'emergencyContactPhone', label: 'Emergency phone', value: employee.emergencyContactPhone ?? '' },
  ];
}

export function appendixSections(sections: HistorySectionSelection): HistorySectionSelection {
  if (sections === 'all') return sections;
  return sections.filter((section) => section !== 'personal');
}

/** Attendance sheet prints visa periods under Current Visa Info, so the appendix must not repeat them. */
export function attendanceSheetAppendix(sections: HistorySectionSelection): HistorySection[] {
  const base = appendixSections(sections);
  const list = base === 'all' ? HISTORY_SECTIONS : base;
  return list.filter((section) => section !== 'personal' && section !== 'visa');
}

function absentDays(report: EmployeeHistoryReport) {
  const block = report.attendanceAndLeave;
  if (!block) return [];
  return [...block.exceptions.unauthorised, ...block.exceptions.overstay].sort((a, b) => a.date.localeCompare(b.date));
}

export type AttendanceSummaryRow = {
  label: string;
  value: string;
  field?: 'absentDays' | 'totalLeave' | 'fineTotal';
  fine?: boolean;
};

export function attendanceSummaryRows(
  report: EmployeeHistoryReport,
  draft: AttendanceReportDraft,
  sections: HistorySectionSelection,
): AttendanceSummaryRow[] {
  const rows: AttendanceSummaryRow[] = [];
  if (sectionSelected(sections, 'absent')) rows.push({ label: 'Absent', value: draft.absentDays, field: 'absentDays' });
  if (sectionSelected(sections, 'leave')) rows.push({ label: 'Leave', value: draft.totalLeave, field: 'totalLeave' });
  if (sectionSelected(sections, 'salary')) rows.push({ label: 'Salary', value: draft.currentSalary });
  if (sectionSelected(sections, 'deductions')) {
    const assigned = report.salaryStructure?.packages.reduce((sum, pkg) => sum + pkg.deductions.length, 0) ?? 0;
    const payLines = report.pay?.lines.length ?? 0;
    rows.push({ label: 'Deductions', value: String(assigned + payLines) });
  }
  if (sectionSelected(sections, 'pay')) rows.push({ label: 'Pay runs', value: String(report.pay?.lines.length ?? 0) });
  if (sectionSelected(sections, 'advances')) {
    rows.push({ label: 'Advances', value: report.advances ? formatMoneyAed(report.advances.total) : '' });
  }
  if (sectionSelected(sections, 'fines')) rows.push({ label: 'Fines', value: draft.fineTotal, field: 'fineTotal', fine: true });
  if (sectionSelected(sections, 'visa')) rows.push({ label: 'Visa', value: String(report.visaPeriods?.length ?? 0) });
  if (sectionSelected(sections, 'documents')) {
    const docs = report.documents;
    rows.push({ label: 'Documents', value: String((docs?.records.length ?? 0) + (docs?.extraFiles.length ?? 0)) });
  }
  if (sectionSelected(sections, 'warnings')) rows.push({ label: 'Warnings', value: String(report.warnings.length) });
  return rows;
}

export function attendanceReportFileName(report: EmployeeHistoryReport, extension: 'pdf' | 'docx', today = dubaiTodayYmd()): string {
  const name = report.employee.fullName.trim() || 'Employee';
  const id = report.employee.employeeCode.trim() || report.employee.id;
  const safe = `${name} ${id} ${today}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe}.${extension}`;
}

export function buildAttendanceReportDraft(input: {
  report: EmployeeHistoryReport;
  sections: HistorySectionSelection;
  today?: string;
}): AttendanceReportDraft {
  const { report, sections } = input;
  const today = input.today ?? dubaiTodayYmd();
  const block = report.attendanceAndLeave;
  const absentOn = show(sections, 'absent') && Boolean(block);
  const leaveOn = show(sections, 'leave') && Boolean(block);
  const salaryOn = show(sections, 'salary') && Boolean(report.salaryStructure);
  const personalOn = show(sections, 'personal');
  const finesOn = show(sections, 'fines') && Boolean(report.fines);
  const visaOn = show(sections, 'visa') && Boolean(report.visaPeriods);
  const documentsOn = show(sections, 'documents') && Boolean(report.documents);
  const openPackage = report.salaryStructure?.packages.find((pkg) => pkg.effectiveTo == null) ?? null;
  const visa = visaOn ? currentVisa(report, today) : null;
  const eid = documentsOn ? emiratesId(report) : null;
  const absent = absentOn && block ? absentDays(report) : [];
  const late = absentOn && block ? [...block.exceptions.late].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const visaAbsent =
    absentOn && visa
      ? absent.filter((day) => day.date >= visa.startDate && day.date <= visa.endDate).length
      : null;

  return {
    company: report.employee.companyName,
    employee: report.employee.fullName,
    period: report.range ? `${displayDate(report.range.from)} – ${displayDate(report.range.to)}` : 'All Time',
    generated: displayDate(today),
    joinDate: displayDate(report.employee.hireDate),
    service: servicePhrase(report, today),
    currentSalary: salaryOn && openPackage?.monthlyBasic != null ? `${openPackage.monthlyBasic} AED.` : '',
    unauthorizedLeave: absentOn && block && block.unauthorisedDays > 0 ? dayCountLabel(block.unauthorisedDays, true) : '',
    totalLeave: leaveOn && block ? dayCountLabel(totalLeaveDays(block), true) : '',
    personal: personalOn ? personalRows(report) : [],
    absentDays: absentOn && block ? String(block.absentDays) : '',
    lateDays: absentOn && block ? String(block.lateDays) : '',
    timeLate: absentOn && block ? formatLateDuration(block.lateMinutes) : '',
    fineTotal: finesOn && report.fines ? formatMoneyAed(report.fines.total) : '',
    eidIssue: eid ? displayDate(eid.issueDate) : '',
    eidExpiry: eid ? displayDate(eid.expiryDate) : '',
    visaExpiresWithin: visa ? visaRemainingLabel(today, visa.endDate) : '',
    visaAbsentDays: visaAbsent != null && visaAbsent > 0 ? dayCountLabel(visaAbsent) : '',
    incidents: [
      ...absent.map((day) => ({
        sort: day.date,
        id: `absent-${day.date}`,
        date: displayDate(day.date),
        reason: day.remark?.trim() || 'Absent',
        fine: '',
      })),
      ...late.map((day) => ({
        sort: day.date,
        id: `late-${day.date}`,
        date: displayDate(day.date),
        reason: `${day.lateMinutes} min Late – Arrived on duty.`,
        fine: '',
      })),
    ]
      .sort((a, b) => a.sort.localeCompare(b.sort) || a.id.localeCompare(b.id))
      .map(({ sort: _sort, ...row }) => row),
  };
}

function text(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

export function historyAppendix(report: EmployeeHistoryReport, sections: HistorySectionSelection): HistoryBlock[] {
  if (sections !== 'all' && sections.length === 0) return [];
  const blocks: HistoryBlock[] = [];
  const employee = report.employee;
  const block = report.attendanceAndLeave;
  if (employee.terminationDate || report.rangeNote || employee.adminNotes) {
    blocks.push({
      title: 'Notes',
      notes: [
        employee.terminationDate ? `Termination ${displayDate(employee.terminationDate)}` : '',
        report.rangeNote ?? '',
        employee.adminNotes ?? '',
      ].filter(Boolean),
      headers: [],
      rows: [],
      empty: '',
    });
  }

  if (show(sections, 'personal')) {
    const values = [
      employee.email,
      employee.phone,
      employee.nationality,
      employee.dateOfBirth,
      employee.gender,
      employee.bloodGroup,
      employee.emergencyContactName,
      employee.emergencyContactPhone,
    ];
    blocks.push({
      title: 'Personal',
      notes: [],
      headers: ['Email', 'Phone', 'Nationality', 'Date of birth', 'Gender', 'Blood group', 'Emergency contact', 'Emergency phone'],
      rows: values.some(Boolean) ? [values.map((value) => value ?? '')] : [],
      empty: 'No personal details recorded.',
    });
  }

  if (report.attendanceAndLeaveMessage && (show(sections, 'absent') || show(sections, 'leave'))) {
    blocks.push({
      title: 'Attendance and leave',
      notes: [report.attendanceAndLeaveMessage],
      headers: [],
      rows: [],
      empty: '',
    });
  }

  if (block && show(sections, 'absent')) {
    const dates = absentDateRows(block);
    blocks.push({
      title: 'Absent date',
      notes: show(sections, 'leave') ? [] : ['Approved leave is not counted as absent.'],
      headers: dates.length > 0 ? ['Absent date', 'Note'] : [],
      rows: dates.map((row) => [row.date, row.note]),
      empty: '',
    });
  }

  if (block && show(sections, 'leave')) {
    blocks.push({
      title: 'Leave',
      notes: [
        leaveTypeCountNote(block),
        block.otherLeave.length > 0 ? `Other leave: ${block.otherLeave.map((row) => `${row.name} ${row.days}`).join(', ')}` : '',
      ].filter(Boolean),
      headers: ['Type', 'Start', 'End', 'Days', 'Reason'],
      rows: block.leaves.map((row) => [
        row.typeName,
        row.startDate,
        row.endDate,
        String(row.days),
        row.notes.map((note) => `${note.date} ${note.note}`).join('; '),
      ]),
      empty: 'No approved leave in this period.',
    });
  }

  if (show(sections, 'pay') && report.pay) {
    blocks.push({
      title: 'Finalized pay',
      notes: [
        report.pay.wholeMonths || report.pay.lines.length === 0 ? '' : 'Full finalized month, not cut to the selected days.',
        'Pay-run absent days are not the day-sheet total. Gross is stored. Assigned deduction rates are not subtracted again.',
      ].filter(Boolean),
      headers: ['Month', 'Absent days in this pay run', 'Overtime pay', 'Gross'],
      rows: report.pay.lines.map((row) => [
        row.month,
        row.unpaidAbsentDays == null ? '—' : text(row.unpaidAbsentDays),
        row.otPay == null ? '—' : text(row.otPay),
        text(row.gross),
      ]),
      empty: 'No finalized pay run in this period.',
    });
  }

  if (show(sections, 'salary') && report.salaryStructure) {
    blocks.push({
      title: 'Salary structure',
      notes: ['Rate history for this period.'],
      headers: ['Pay type', 'From', 'To', 'Basic', 'Daily'],
      rows: report.salaryStructure.packages.map((pkg) => [
        pkg.payTypeName,
        pkg.effectiveFrom,
        pkg.effectiveTo ?? 'open',
        pkg.monthlyBasic == null ? '' : text(pkg.monthlyBasic),
        pkg.dailyRate == null ? '' : text(pkg.dailyRate),
      ]),
      empty: 'No salary package in this period.',
    });
  }

  if (show(sections, 'deductions') && (report.salaryStructure || report.pay)) {
    blocks.push({
      title: 'Deductions',
      notes: ['Assigned rates stay separate from the amount stored on a pay run.'],
      headers: ['Source', 'From', 'Name', 'Amount', 'Mode'],
      rows: [
        ...(report.salaryStructure?.packages ?? []).flatMap((pkg) =>
          pkg.deductions.map((row) => [
            pkg.payTypeName,
            pkg.effectiveFrom,
            row.name,
            text(row.amount),
            row.applicationMode === 'FIXED_MONTHLY' ? 'fixed monthly' : 'attendance',
          ])
        ),
        ...(report.pay?.lines ?? []).map((row) => [
          row.month,
          '',
          'Attendance deduction in this pay run',
          row.deductionDetailStored ? text(row.componentDeduction ?? 0) : 'Not stored',
          'pay run',
        ]),
      ],
      empty: 'No deductions in this period.',
    });
  }

  if (show(sections, 'advances') && report.advances) {
    blocks.push({
      title: 'Advances taken',
      notes: [`Total ${report.advances.total.toFixed(2)}. Not a remaining balance.`],
      headers: ['Date', 'Amount', 'Note'],
      rows: report.advances.rows.map((row) => [row.date, row.amount.toFixed(2), row.note ?? '']),
      empty: 'No advances in this period.',
    });
  }

  if (show(sections, 'fines') && report.fines) {
    blocks.push({
      title: 'Fines',
      notes: [`Approved total ${report.fines.total.toFixed(2)}.`],
      headers: ['Date', 'Amount', 'Description'],
      rows: report.fines.rows.map((row) => [row.date, row.amount.toFixed(2), row.description]),
      empty: 'No approved fines in this period.',
    });
  }

  if (show(sections, 'warnings')) {
    blocks.push({
      title: 'Warnings',
      notes: [],
      headers: ['Date', 'Note'],
      rows: report.warnings.map((row) => [row.date, row.note]),
      empty: 'No warnings in this period.',
    });
  }

  if (show(sections, 'visa') && report.visaPeriods) {
    blocks.push({
      title: 'Visa periods',
      notes: [],
      headers: ['Label', 'Start', 'End', 'Status'],
      rows: report.visaPeriods.map((row) => [row.label, row.startDate, row.endDate, prettyLabel(row.status)]),
      empty: 'No visa period in this range.',
    });
  }

  if (show(sections, 'documents') && report.documents) {
    const visaColumn = Boolean(report.visaPeriods);
    blocks.push({
      title: 'Documents',
      notes: [],
      headers: ['Name', 'Number', 'Issue or upload', 'Expiry', 'Authority', ...(visaColumn ? ['Visa'] : [])],
      rows: [
        ...report.documents.records.map((row) => [
          row.typeName,
          row.number ?? '',
          row.issueDate ?? '',
          row.expiryDate ?? '',
          row.authority ?? '',
          ...(visaColumn ? [row.visaLabel ?? ''] : []),
        ]),
        ...report.documents.extraFiles.map((row) => [
          row.fileName,
          '',
          row.uploadedOn,
          '',
          '',
          ...(visaColumn ? [''] : []),
        ]),
      ],
      empty: 'No documents in this period.',
    });
  }

  return blocks;
}
