'use client';

import { createPortal } from 'react-dom';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { EmployeeHistoryReportView } from '@/components/hr/EmployeeHistoryReportView';
import {
  attendanceSheetAppendix,
  attendanceSummaryRows,
  displayFine,
  type AttendanceReportDraft,
} from '@/lib/hr/attendanceDeductionReport';
import { buildAttendanceReportDraft } from '@/lib/hr/attendanceDeductionReport';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { sectionSelected, type HistorySection } from '@/lib/hr/employeeHistorySections';

type FieldKey = Exclude<keyof AttendanceReportDraft, 'incidents' | 'personal'>;

type PairRow = {
  label: string;
  field: FieldKey;
  labelFill: string;
  valueFill: string;
  labelColor: string;
  valueColor: string;
};

const LABEL = '#4B5563';
const INK = '#1F2937';
const GREEN = '#166534';
const RED = '#EE0000';

const HEADER_ROWS: PairRow[] = [
  { label: 'Employee', field: 'employee', labelFill: '#F3F4F6', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
  { label: 'Period', field: 'period', labelFill: '#F3F4F6', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
  { label: 'Report Generated', field: 'generated', labelFill: '#F3F4F6', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
];

const SERVICE_ROWS: PairRow[] = [
  { label: 'First Join Date', field: 'joinDate', labelFill: '#F9FAFB', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
  { label: 'Service Duration', field: 'service', labelFill: '#DCFCE7', valueFill: '#DCFCE7', labelColor: GREEN, valueColor: GREEN },
  { label: 'Current Salary', field: 'currentSalary', labelFill: '#DCFCE7', valueFill: '#DCFCE7', labelColor: GREEN, valueColor: GREEN },
];

const UNAUTHORIZED_ROW: PairRow = {
  label: 'Unauthorized Leave During Service Period',
  field: 'unauthorizedLeave',
  labelFill: '#F9FAFB',
  valueFill: '#FFFFFF',
  labelColor: LABEL,
  valueColor: RED,
};

const TOTAL_LEAVE_ROW: PairRow = {
  label: 'Total Leave in Service Period',
  field: 'totalLeave',
  labelFill: '#FEE2E2',
  valueFill: '#FEE2E2',
  labelColor: '#991B1B',
  valueColor: '#991B1B',
};

const PERSONAL_ROW = {
  labelFill: '#F3F4F6',
  valueFill: '#FFFFFF',
  labelColor: LABEL,
  valueColor: LABEL,
};

const VISA_ROWS: PairRow[] = [
  { label: 'Eid Issue', field: 'eidIssue', labelFill: '#F9FAFB', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
  { label: 'Eid Will Expire', field: 'eidExpiry', labelFill: '#F9FAFB', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
  { label: 'Visa will expire within', field: 'visaExpiresWithin', labelFill: '#F9FAFB', valueFill: '#FFFFFF', labelColor: LABEL, valueColor: LABEL },
];

const VISA_ABSENT_ROW: PairRow = {
  label: 'Unauthorized Absent Days (Current Visa)',
  field: 'visaAbsentDays',
  labelFill: '#C00000',
  valueFill: '#C00000',
  labelColor: '#FFFFFF',
  valueColor: '#FFFFFF',
};

const sheetStyle = `
  .attendance-report-sheet { font-family: Calibri, "Segoe UI", sans-serif; background: #ffffff; color: #1F2937; }
  .attendance-report-sheet table { width: 100%; border-collapse: collapse; margin: 0; }
  .attendance-report-sheet td,
  .attendance-report-sheet th { border: 1px solid #000000; padding: 4px 8px; font-weight: 700; vertical-align: middle; line-height: 1.2; }
  .attendance-report-sheet input { width: 100%; height: auto; min-height: 0; border: 0; margin: 0; padding: 0; background: transparent; font: inherit; font-weight: 700; line-height: inherit; color: inherit; outline: none; }
  html.dark .attendance-report-sheet { background-color: #ffffff !important; color: #1F2937 !important; }
  html.dark .attendance-report-sheet input { background-color: transparent !important; }
  .attendance-report-appendix,
  .attendance-report-appendix section,
  .attendance-report-appendix .bg-white { background: #ffffff !important; color: #1F2937 !important; border-color: #000000 !important; }
  .attendance-report-appendix h3,
  .attendance-report-appendix p,
  .attendance-report-appendix .text-slate-900,
  .attendance-report-appendix .text-slate-800,
  .attendance-report-appendix .text-slate-700,
  .attendance-report-appendix .text-slate-600,
  .attendance-report-appendix .text-slate-500,
  .attendance-report-appendix .text-slate-400 { color: #1F2937 !important; }
  .attendance-report-appendix h3 { border-bottom-color: #000000 !important; font-size: 12px !important; }
  .attendance-report-appendix th,
  .attendance-report-appendix th.text-slate-700 { background: #4B5563 !important; color: #ffffff !important; border: 1px solid #000000 !important; padding: 4px 8px !important; text-transform: none !important; letter-spacing: 0 !important; font-size: 12px !important; }
  .attendance-report-appendix td { background: #ffffff !important; color: #1F2937 !important; border: 1px solid #000000 !important; padding: 4px 8px !important; }
`;

function sourceKey(report: EmployeeHistoryReport, sections: HistorySection[]) {
  return [report.employee.id, report.range?.from ?? '', report.range?.to ?? '', sections.join(',')].join('|');
}

function CellValue({
  value,
  color,
  editable,
  onChange,
  blankAsDash = false,
}: {
  value: string;
  color: string;
  editable: boolean;
  onChange?: (value: string) => void;
  blankAsDash?: boolean;
}) {
  if (editable && onChange) {
    return (
      <input
        value={value}
        placeholder={blankAsDash ? '-' : undefined}
        onChange={(event) => onChange(event.target.value)}
        style={{ color }}
        aria-label="Value"
      />
    );
  }
  const shown = blankAsDash ? displayFine(value) : value;
  return <span style={{ color }}>{shown || '\u00a0'}</span>;
}

function PairCells({
  row,
  draft,
  editable,
  onField,
  labelWidth,
  colSpan = 1,
}: {
  row: PairRow;
  draft: AttendanceReportDraft;
  editable: boolean;
  onField: (field: FieldKey, value: string) => void;
  labelWidth: string;
  colSpan?: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ width: labelWidth, background: row.labelFill, color: row.labelColor, fontSize: 13 }}>{row.label}</td>
      <td colSpan={colSpan} style={{ background: row.valueFill, color: row.valueColor, fontSize: 13 }}>
        <CellValue
          value={draft[row.field]}
          color={row.valueColor}
          editable={editable}
          onChange={(value) => onField(row.field, value)}
        />
      </td>
    </tr>
  );
}

function prettyStatus(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function VisaPeriodRows({ periods }: { periods: NonNullable<EmployeeHistoryReport['visaPeriods']> }) {
  const headers = ['Label', 'Start', 'End', 'Status'];
  return (
    <>
      <tr>
        {headers.map((header) => (
          <th key={header} style={{ background: '#4B5563', color: '#FFFFFF', border: '1px solid #000', fontSize: 12, fontWeight: 700, textAlign: 'left' }}>
            {header}
          </th>
        ))}
      </tr>
      {periods.length === 0 ? (
        <tr>
          <td colSpan={4} style={{ color: INK, fontSize: 12 }}>No visa period.</td>
        </tr>
      ) : (
        periods.map((row) => (
          <tr key={row.id}>
            {[row.label, row.startDate, row.endDate, prettyStatus(row.status)].map((value, index) => (
              <td key={headers[index]} style={{ color: INK, fontSize: 12 }}>{value}</td>
            ))}
          </tr>
        ))
      )}
    </>
  );
}

function picked(sections: HistorySection[], section: HistorySection) {
  return sectionSelected(sections, section);
}

function ReportDocument({
  draft,
  report,
  sections,
  editable,
  onField,
  onPersonal,
}: {
  draft: AttendanceReportDraft;
  report: EmployeeHistoryReport;
  sections: HistorySection[];
  editable: boolean;
  onField: (field: FieldKey, value: string) => void;
  onPersonal: (key: string, value: string) => void;
}) {
  const absentOn = picked(sections, 'absent');
  const leaveOn = picked(sections, 'leave');
  const salaryOn = picked(sections, 'salary');
  const visaOn = picked(sections, 'visa');
  const documentsOn = picked(sections, 'documents');
  const serviceRows = [
    SERVICE_ROWS[0],
    SERVICE_ROWS[1],
    ...(salaryOn ? [SERVICE_ROWS[2]] : []),
    ...(absentOn ? [UNAUTHORIZED_ROW] : []),
    ...(leaveOn ? [TOTAL_LEAVE_ROW] : []),
  ];
  const visaRows = [
    ...(documentsOn ? VISA_ROWS.slice(0, 2) : []),
    ...(visaOn ? [VISA_ROWS[2]] : []),
  ];
  const showVisaAbsent = visaOn && absentOn;
  const summaryRows = attendanceSummaryRows(report, draft, sections);
  const detailList = attendanceSheetAppendix(sections);
  const visaPeriods = report.visaPeriods ?? [];

  return (
    <div>
      <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: INK }}>{draft.company || '\u00a0'}</p>
      <p style={{ margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #D1D5DB', fontSize: 13, fontWeight: 700, color: LABEL }}>
        Employee Attendance & Deduction Report
      </p>

      <table>
        <tbody>
          {HEADER_ROWS.map((row) => (
            <PairCells key={row.field} row={row} draft={draft} editable={editable} onField={onField} labelWidth="28%" />
          ))}
          {draft.personal.map((row) => (
            <tr key={row.key}>
              <td style={{ width: '28%', background: PERSONAL_ROW.labelFill, color: PERSONAL_ROW.labelColor, fontSize: 13 }}>{row.label}</td>
              <td style={{ background: PERSONAL_ROW.valueFill, color: PERSONAL_ROW.valueColor, fontSize: 13 }}>
                <CellValue
                  value={row.value}
                  color={PERSONAL_ROW.valueColor}
                  editable={editable}
                  onChange={(value) => onPersonal(row.key, value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ height: 10 }} />

      <table>
        <tbody>
          {serviceRows.map((row) => (
            <PairCells key={row.field} row={row} draft={draft} editable={editable} onField={onField} labelWidth="55%" />
          ))}
        </tbody>
      </table>

      {visaRows.length > 0 || showVisaAbsent ? (
        <>
          <div style={{ height: 10 }} />
          <table>
            <tbody>
              <tr>
                <td colSpan={4} style={{ background: '#000000', color: '#FFFFFF', fontSize: 13, textAlign: 'center' }}>Current Visa Info</td>
              </tr>
              {visaOn ? <VisaPeriodRows periods={visaPeriods} /> : null}
              {visaRows.map((row) => (
                <PairCells key={row.field} row={row} draft={draft} editable={editable} onField={onField} labelWidth="55%" colSpan={2} />
              ))}
              {showVisaAbsent ? (
                <PairCells row={VISA_ABSENT_ROW} draft={draft} editable={editable} onField={onField} labelWidth="55%" colSpan={2} />
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}

      {summaryRows.length > 0 ? (
        <>
          <p style={{ margin: '12px 0 4px', fontSize: 12, fontWeight: 700, color: INK }}>Summary</p>
          <table>
            <thead>
              <tr>
                {['Category', 'Count'].map((header) => (
                  <th key={header} style={{ width: '50%', background: '#1F2937', color: '#FFFFFF', border: '1px solid #000', fontSize: 12, fontWeight: 700, textAlign: 'left' }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.label}>
                  <td style={{ background: row.fine ? '#FEE2E2' : '#FFFFFF', color: INK, fontSize: 12 }}>{row.label}</td>
                  <td style={{ background: row.fine ? '#FEE2E2' : '#FFFFFF', color: row.fine ? INK : RED, fontSize: 12 }}>
                    {row.field ? (
                      <CellValue
                        value={draft[row.field]}
                        color={row.fine ? INK : RED}
                        editable={editable}
                        onChange={(value) => onField(row.field!, value)}
                      />
                    ) : (
                      row.value || '\u00a0'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {detailList.length > 0 ? (
        <div className="attendance-report-appendix" style={{ marginTop: 16 }}>
          <EmployeeHistoryReportView report={report} mode="print" sections={detailList} hideIntro hideAbsentDays hideAbsentStats />
        </div>
      ) : null}
    </div>
  );
}

export type AttendanceReportHandle = {
  sheet: HTMLDivElement | null;
  draft: AttendanceReportDraft;
};

export const AttendanceDeductionReport = forwardRef<AttendanceReportHandle, {
  report: EmployeeHistoryReport;
  sections: HistorySection[];
}>(function AttendanceDeductionReport({ report, sections }, ref) {
  const key = sourceKey(report, sections);
  const [seenKey, setSeenKey] = useState(key);
  const [draft, setDraft] = useState(() => buildAttendanceReportDraft({ report, sections }));
  const draftRef = useRef(draft);
  const sheetRef = useRef<HTMLDivElement>(null);
  draftRef.current = draft;
  useImperativeHandle(ref, () => ({
    get sheet() {
      return sheetRef.current;
    },
    get draft() {
      return draftRef.current;
    },
  }), []);
  if (seenKey !== key) {
    const next = buildAttendanceReportDraft({ report, sections });
    setSeenKey(key);
    setDraft(next);
    draftRef.current = next;
  }

  function update(next: AttendanceReportDraft) {
    draftRef.current = next;
    setDraft(next);
  }

  function onField(field: FieldKey, value: string) {
    update({ ...draft, [field]: value });
  }

  function onPersonal(key: string, value: string) {
    update({
      ...draft,
      personal: draft.personal.map((row) => (row.key === key ? { ...row, value } : row)),
    });
  }

  const documentProps = {
    draft,
    report,
    sections,
    onField,
    onPersonal,
  };

  const capture = (
    <div
      ref={sheetRef}
      aria-hidden
      className="attendance-report-sheet pointer-events-none fixed top-0 w-[794px] bg-white p-6"
      style={{ left: '-1800px' }}
    >
      <style>{sheetStyle}</style>
      <ReportDocument {...documentProps} editable={false} />
    </div>
  );

  return (
    <div className="attendance-report-sheet bg-white p-4">
      <style>{sheetStyle}</style>
      <ReportDocument {...documentProps} editable />
      {typeof document !== 'undefined' ? createPortal(capture, document.body) : null}
    </div>
  );
});
