'use client';

import { absentDateRows } from '@/lib/hr/employeeHistory';
import { formatLeaveTypeCount, type EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { sectionSelected, type HistorySectionSelection } from '@/lib/hr/employeeHistorySections';
import { dubaiTodayYmd } from '@/lib/hr/leaveReturn';

function prettyLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function EmployeeHistoryReportView({
  report,
  mode = 'screen',
  sections = 'all',
  hideIntro = false,
  hideAbsentDays = false,
  hideAbsentStats = false,
}: {
  report: EmployeeHistoryReport;
  mode?: 'screen' | 'print';
  sections?: HistorySectionSelection;
  hideIntro?: boolean;
  hideAbsentDays?: boolean;
  hideAbsentStats?: boolean;
}) {
  const print = mode === 'print';
  const employee = report.employee;
  const block = report.attendanceAndLeave;
  const absentDates = block ? absentDateRows(block) : [];
  const show = (section: Parameters<typeof sectionSelected>[1]) => sectionSelected(sections, section);
  const panel = print
    ? 'border border-slate-300 bg-white px-2.5 py-2 text-slate-900'
    : 'rounded-lg border border-white/10 bg-slate-900/35 px-4 py-3';
  const muted = print ? 'text-slate-600' : 'text-slate-400';
  const body = print ? 'text-slate-800' : 'text-slate-200';

  const meta = [
    employee.employeeCode,
    employee.designation,
    employee.department,
    employee.employmentType,
  ].filter(Boolean);

  return (
    <div className={print ? 'flex flex-col gap-2 text-[11px] leading-snug' : 'flex flex-col gap-4'}>
      {hideIntro ? (
        employee.terminationDate || report.rangeNote || employee.adminNotes ? (
          <section className={panel}>
            {employee.terminationDate ? <p className={`text-xs ${muted}`}>Termination {employee.terminationDate}</p> : null}
            {report.rangeNote ? <p className={`text-xs ${print ? 'text-amber-800' : 'text-amber-200'}`}>{report.rangeNote}</p> : null}
            {employee.adminNotes ? <p className={`whitespace-pre-wrap text-xs ${body}`}>{employee.adminNotes}</p> : null}
          </section>
        ) : null
      ) : (
      <section className={panel}>
        {print ? <p className="mb-1.5 text-lg font-bold leading-tight text-slate-900">{employee.companyName}</p> : null}
        <h2 className={print ? 'text-base font-semibold text-slate-900' : 'text-base font-semibold text-white'}>
          {employee.fullName}
        </h2>
        <p className={`text-xs ${muted}`}>{meta.join(' · ')}</p>
        <SimpleTable
          print={print}
          headers={['Status', 'Joining', 'Service', 'Period']}
          rows={[[
            prettyLabel(employee.status),
            employee.hireDate ?? 'Joining date not set',
            employee.serviceLabel ?? 'Joining date not set',
            report.range ? `${report.range.from} – ${report.range.to}` : '—',
          ]]}
          empty=""
        />
        {employee.terminationDate ? <p className={`mt-1 text-xs ${muted}`}>Termination {employee.terminationDate}</p> : null}
        {report.rangeNote ? <p className={`mt-1 text-xs ${print ? 'text-amber-800' : 'text-amber-200'}`}>{report.rangeNote}</p> : null}
        <p className={`mt-1 text-[11px] ${muted}`}>
          Service is from joining to {employee.terminationDate && employee.terminationDate <= dubaiTodayYmd() ? 'the termination date' : 'today'}.
          {show('absent') || show('leave') ? ' Totals below are for this period.' : ''}
        </p>
        {employee.adminNotes ? <p className={`mt-2 whitespace-pre-wrap text-xs ${body}`}>{employee.adminNotes}</p> : null}
      </section>
      )}

      {show('personal') ? (
        <section className={panel}>
          <SectionTitle print={print}>Personal</SectionTitle>
          <SimpleTable
            print={print}
            headers={['Email', 'Phone', 'Nationality', 'Date of birth', 'Gender', 'Blood group', 'Emergency contact', 'Emergency phone']}
            rows={
              [employee.email, employee.phone, employee.nationality, employee.dateOfBirth, employee.gender, employee.bloodGroup, employee.emergencyContactName, employee.emergencyContactPhone].some(Boolean)
                ? [[
                    employee.email ?? '',
                    employee.phone ?? '',
                    employee.nationality ?? '',
                    employee.dateOfBirth ?? '',
                    employee.gender ?? '',
                    employee.bloodGroup ?? '',
                    employee.emergencyContactName ?? '',
                    employee.emergencyContactPhone ?? '',
                  ]]
                : []
            }
            empty="No personal details recorded."
          />
        </section>
      ) : null}

      {report.attendanceAndLeaveMessage ? (
        <p className={print ? 'border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900' : 'rounded-lg border border-amber-500/30 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-100'}>
          {report.attendanceAndLeaveMessage}
        </p>
      ) : null}

      {block && (show('absent') || show('leave')) ? (
        <>
          {show('absent') ? (
            <>
              {hideAbsentStats ? null : (
                <div className={print ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-2 gap-2.5'}>
                  <Stat print={print} label="Total absent days" value={block.absentDays} />
                  <Stat print={print} label="Unauthorised" value={block.unauthorisedDays} hint="Part of total absent" />
                </div>
              )}
              {absentDates.length > 0 ? (
                <SimpleTable
                  print={print}
                  headers={['Absent date', 'Note']}
                  rows={absentDates.map((row) => [row.date, row.note])}
                  empty=""
                />
              ) : null}
              {show('leave') ? null : <p className={`text-[11px] ${muted}`}>Approved leave is not counted as absent.</p>}
              {hideAbsentDays ? null : (
                <section className={panel}>
                  <SectionTitle print={print}>Absent days</SectionTitle>
                  <SimpleTable
                    print={print}
                    headers={['Kind', 'Date', 'Status']}
                    rows={[
                      ...block.exceptions.unauthorised.map((row) => ['Unauthorised', row.date, prettyLabel(row.status)]),
                      ...block.exceptions.overstay.map((row) => ['Absent', row.date, prettyLabel(row.status)]),
                    ]}
                    empty="No absent days."
                  />
                </section>
              )}
            </>
          ) : null}
          {show('leave') ? (
            <section className={panel}>
              <SectionTitle print={print}>Leave</SectionTitle>
              <div className={print ? 'mt-1 grid grid-cols-4 items-start gap-1' : 'mt-2 grid grid-cols-2 items-start gap-2.5 sm:grid-cols-4'}>
                {block.leaveTypeCounts.length > 0 ? (
                  block.leaveTypeCounts.map((row) => (
                    <Stat key={row.label} print={print} compact label={row.label} value={formatLeaveTypeCount(row.usedDays, row.allowance)} />
                  ))
                ) : (
                  <>
                    <Stat print={print} compact label="Sick" value={block.sickDays} />
                    <Stat print={print} compact label="Paid" value={block.paidDays} />
                    <Stat print={print} compact label="Unpaid" value={block.unpaidDays} />
                    <Stat print={print} compact label="Annual" value={block.annualDays} />
                  </>
                )}
              </div>
              {block.leaveTypeCounts.length === 0 && block.otherLeave.length > 0 ? (
                <p className={`mt-1 text-xs ${body}`}>Other leave: {block.otherLeave.map((row) => `${row.name} ${row.days}`).join(', ')}</p>
              ) : null}
              <SimpleTable
                print={print}
                headers={['Type', 'Start', 'End', 'Days', 'Reason']}
                rows={block.leaves.map((row) => [row.typeName, row.startDate, row.endDate, String(row.days), row.notes.map((note) => `${note.date} ${note.note}`).join('; ')])}
                empty="No approved leave in this period."
              />
            </section>
          ) : null}
        </>
      ) : null}

      {show('pay') && report.pay ? (
        <section className={panel}>
          <SectionTitle print={print}>Finalized pay</SectionTitle>
          {!report.pay.wholeMonths && report.pay.lines.length > 0 ? (
            <p className={`mt-0.5 text-[11px] ${print ? 'text-amber-800' : 'text-amber-100'}`}>Full finalized month, not cut to the selected days.</p>
          ) : null}
          <p className={`mt-0.5 text-[11px] ${muted}`}>
            Pay-run absent days are not the day-sheet total. Gross is stored. Assigned deduction rates are not subtracted again.
          </p>
          <SimpleTable
            print={print}
            headers={['Month', 'Absent days in this pay run', 'Overtime pay', 'Gross']}
            rows={report.pay.lines.map((row) => [
              row.month,
              row.unpaidAbsentDays == null ? '—' : String(row.unpaidAbsentDays),
              row.otPay == null ? '—' : String(row.otPay),
              String(row.gross),
            ])}
            empty="No finalized pay run in this period."
          />
        </section>
      ) : null}

      {show('salary') && report.salaryStructure ? (
        <section className={panel}>
          <SectionTitle print={print}>Salary structure</SectionTitle>
          <p className={`text-[11px] ${muted}`}>Rate history for this period.</p>
          <SimpleTable
            print={print}
            headers={['Pay type', 'From', 'To', 'Basic', 'Daily']}
            rows={
              report.salaryStructure.packages.length === 0
                ? []
                : report.salaryStructure.packages.map((pkg) => [
                    pkg.payTypeName,
                    pkg.effectiveFrom,
                    pkg.effectiveTo ?? 'open',
                    pkg.monthlyBasic == null ? '' : String(pkg.monthlyBasic),
                    pkg.dailyRate == null ? '' : String(pkg.dailyRate),
                  ])
            }
            empty="No salary package in this period."
          />
        </section>
      ) : null}

      {show('deductions') && (report.salaryStructure || report.pay) ? (
        <section className={panel}>
          <SectionTitle print={print}>Deductions</SectionTitle>
          <p className={`text-[11px] ${muted}`}>Assigned rates stay separate from the amount stored on a pay run.</p>
          <SimpleTable
            print={print}
            headers={['Source', 'From', 'Name', 'Amount', 'Mode']}
            rows={[
              ...(report.salaryStructure?.packages ?? []).flatMap((pkg) =>
                pkg.deductions.map((row) => [
                  pkg.payTypeName,
                  pkg.effectiveFrom,
                  row.name,
                  String(row.amount),
                  row.applicationMode === 'FIXED_MONTHLY' ? 'fixed monthly' : 'attendance',
                ])
              ),
              ...(report.pay?.lines ?? []).map((row) => [
                row.month,
                '',
                'Attendance deduction in this pay run',
                row.deductionDetailStored ? String(row.componentDeduction ?? 0) : 'Not stored',
                'pay run',
              ]),
            ]}
            empty="No deductions in this period."
          />
        </section>
      ) : null}

      {show('advances') && report.advances ? (
        <section className={panel}>
          <SectionTitle print={print}>Advances taken</SectionTitle>
          <p className={`text-[11px] ${muted}`}>Total {report.advances.total.toFixed(2)}. Not a remaining balance.</p>
          <SimpleTable
            print={print}
            headers={['Date', 'Amount', 'Note']}
            rows={report.advances.rows.map((row) => [row.date, row.amount.toFixed(2), row.note ?? ''])}
            empty="No advances in this period."
          />
        </section>
      ) : null}

      {show('fines') && report.fines ? (
        <section className={panel}>
          <SectionTitle print={print}>Fines</SectionTitle>
          <p className={`text-[11px] ${muted}`}>Approved total {report.fines.total.toFixed(2)}.</p>
          <SimpleTable
            print={print}
            headers={['Date', 'Amount', 'Description']}
            rows={report.fines.rows.map((row) => [row.date, row.amount.toFixed(2), row.description])}
            empty="No approved fines in this period."
          />
        </section>
      ) : null}

      {show('warnings') ? (
        <section className={panel}>
          <SectionTitle print={print}>Warnings</SectionTitle>
          <SimpleTable
            print={print}
            headers={['Date', 'Note']}
            rows={report.warnings.map((row) => [row.date, row.note])}
            empty="No warnings in this period."
          />
        </section>
      ) : null}

      {show('visa') && report.visaPeriods ? (
        <section className={panel}>
          <SectionTitle print={print}>Visa periods</SectionTitle>
          <SimpleTable
            print={print}
            headers={['Label', 'Start', 'End', 'Status']}
            rows={report.visaPeriods.map((row) => [row.label, row.startDate, row.endDate, prettyLabel(row.status)])}
            empty="No visa period in this range."
          />
        </section>
      ) : null}

      {show('documents') && report.documents ? (
        <section className={panel}>
          <SectionTitle print={print}>Documents</SectionTitle>
          <SimpleTable
            print={print}
            headers={['Name', 'Number', 'Issue or upload', 'Expiry', 'Authority', ...(report.visaPeriods ? ['Visa'] : [])]}
            rows={[
              ...report.documents.records.map((row) => [row.typeName, row.number ?? '', row.issueDate ?? '', row.expiryDate ?? '', row.authority ?? '', ...(report.visaPeriods ? [row.visaLabel ?? ''] : [])]),
              ...report.documents.extraFiles.map((row) => [row.fileName, '', row.uploadedOn, '', '', ...(report.visaPeriods ? [''] : [])]),
            ]}
            empty="No documents in this period."
          />
        </section>
      ) : null}
    </div>
  );
}

function SectionTitle({ children, print }: { children: string; print: boolean }) {
  return (
    <h3 className={print ? 'border-b border-slate-300 pb-1 text-sm font-semibold text-slate-900' : 'mb-1 border-b border-white/15 pb-1.5 text-sm font-semibold text-white'}>
      {children}
    </h3>
  );
}

function Stat({
  label,
  value,
  hint,
  print,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  print: boolean;
  compact?: boolean;
}) {
  const box = print
    ? compact
      ? 'border border-slate-300 bg-white px-2 pt-1 pb-0'
      : 'border border-slate-300 bg-white px-2 py-1'
    : compact
      ? 'rounded-md border border-white/10 bg-slate-900/50 px-2.5 pt-2 pb-0.5'
      : 'rounded-md border border-white/10 bg-slate-900/50 px-2.5 py-2';
  return (
    <div className={box}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={print ? 'text-sm font-semibold leading-tight text-slate-900' : 'text-sm font-semibold leading-tight text-white'}>{value}</p>
      {hint ? <p className={print ? 'text-[10px] leading-tight text-slate-500' : 'text-[10px] leading-tight text-slate-400'}>{hint}</p> : null}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
  print,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
  print: boolean;
}) {
  if (rows.length === 0) return <p className={print ? 'mt-1 text-[11px] text-slate-500' : 'mt-1 text-xs text-slate-500'}>{empty}</p>;
  return (
    <div className={print ? 'mt-1 overflow-x-auto' : 'mt-2 overflow-x-auto'}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className={print
                  ? 'border border-slate-400 bg-slate-100 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-700'
                  : 'border border-white/20 bg-white/5 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-300'}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={print
                    ? 'border border-slate-300 px-2 py-1 align-top text-slate-800'
                    : 'border border-white/15 px-2 py-1.5 align-top text-slate-200'}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
