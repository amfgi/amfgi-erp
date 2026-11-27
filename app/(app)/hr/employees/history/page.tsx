'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

import HrCompanySearchSelect, { useHrAccessibleCompanies } from '@/components/hr/HrCompanySearchSelect';
import { AttendanceDeductionReport, type AttendanceReportHandle } from '@/components/hr/AttendanceDeductionSheet';
import { attendanceReportFileName } from '@/lib/hr/attendanceDeductionReport';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Button } from '@/components/ui/shadcn/button';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { canHrCompensationView } from '@/lib/hr/compensationPermissions';
import { canHrDocumentView } from '@/lib/hr/documentPermissions';
import {
  DEFAULT_HISTORY_SECTIONS,
  allowedHistorySections,
  type HistorySection,
} from '@/lib/hr/employeeHistorySections';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { canHrVisaView } from '@/lib/hr/visaPermissions';
import { resolveDefaultHrCompanyId, writeHrPreferredCompanyId } from '@/lib/hr/hrCompanyPreference';
import { P } from '@/lib/permissions';

type EmployeeOption = {
  id: string;
  label: string;
  searchText: string;
  fullName: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  status: string;
};

const HISTORY_OPEN_KEY = 'hr-history-open-employee';
let profileHistoryOpenToken = '';

const SECTION_LABELS: Record<HistorySection, string> = {
  personal: 'Personal',
  absent: 'Absent',
  leave: 'Leave',
  salary: 'Salary',
  deductions: 'Deductions',
  pay: 'Pay runs',
  advances: 'Advances',
  fines: 'Fines',
  visa: 'Visa',
  documents: 'Documents',
  warnings: 'Warnings',
};

function prettyStatus(status: string) {
  const text = status.trim();
  if (!text) return '—';
  return text
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function EmployeeHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { options: companyOptions } = useHrAccessibleCompanies();
  const [companyId, setCompanyId] = useState(searchParams.get('companyId')?.trim() ?? '');
  const employeeIdFromUrl = searchParams.get('employeeId')?.trim() ?? '';
  const fromDateFromUrl = searchParams.get('from')?.trim() ?? '';
  const toDateFromUrl = searchParams.get('to')?.trim() ?? '';
  const [employeeId, setEmployeeId] = useState(employeeIdFromUrl);
  const [trackedUrlEmployee, setTrackedUrlEmployee] = useState(employeeIdFromUrl);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [absenceCounts, setAbsenceCounts] = useState<Record<string, number> | null>(null);
  const [absenceLoading, setAbsenceLoading] = useState(false);
  const [fromDate, setFromDate] = useState(fromDateFromUrl);
  const [toDate, setToDate] = useState(toDateFromUrl);
  if (employeeIdFromUrl !== trackedUrlEmployee) {
    setTrackedUrlEmployee(employeeIdFromUrl);
    setEmployeeId(employeeIdFromUrl);
    setFromDate(fromDateFromUrl);
    setToDate(toDateFromUrl);
  }
  const [report, setReport] = useState<EmployeeHistoryReport | null>(null);
  const [sections, setSections] = useState<HistorySection[]>(DEFAULT_HISTORY_SECTIONS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const attendanceRef = useRef<AttendanceReportHandle>(null);
  const exportLock = useRef(false);
  const previousCompany = useRef<string | null>(null);
  const companyJustChanged = previousCompany.current !== null && previousCompany.current !== companyId;

  const canView = session?.user?.isSuperAdmin || (session?.user?.permissions ?? []).includes('hr.employee.view');
  const allowedSections = useMemo(() => {
    const user = session?.user as AppSessionUser | undefined;
    if (!user) return [];
    const perms = user.permissions ?? [];
    const has = (key: (typeof perms)[number]) => Boolean(user.isSuperAdmin) || perms.includes(key);
    const payroll = has(P.HR_PAYROLL_COMPENSATION);
    return allowedHistorySections({
      attendanceAndLeave: has(P.HR_ATTENDANCE_VIEW) && has(P.HR_LEAVE_VIEW),
      payroll,
      compensation: canHrCompensationView(user) || payroll,
      visa: canHrVisaView(user),
      documents: canHrDocumentView(user),
    });
  }, [session?.user]);
  const canSeeAbsence = allowedSections.includes('absent');
  const activeSections = sections.filter((section) => allowedSections.includes(section));
  const visaSelected = activeSections.includes('visa');
  const allDetails = allowedSections.length > 0 && allowedSections.every((section) => activeSections.includes(section));
  const dateError = fromDate && toDate && fromDate > toDate ? 'From date must be on or before the to date.' : '';
  const oneDate = Boolean(fromDate) !== Boolean(toDate);

  useEffect(() => {
    if (companyOptions.length === 0) return;
    setCompanyId((current) => {
      if (current && companyOptions.some((option) => option.id === current)) return current;
      return resolveDefaultHrCompanyId(
        companyOptions.map((option) => option.id),
        session?.user?.activeCompanyId
      );
    });
  }, [companyOptions, session?.user?.activeCompanyId]);

  useEffect(() => {
    if (!companyId) return;
    previousCompany.current = companyId;
    if (companyJustChanged) {
      setEmployeeId('');
      setReport(null);
    }
  }, [companyId, companyJustChanged]);

  useLayoutEffect(() => {
    const raw = sessionStorage.getItem(HISTORY_OPEN_KEY);
    if (!raw || raw === profileHistoryOpenToken) return;
    profileHistoryOpenToken = raw;
    sessionStorage.removeItem(HISTORY_OPEN_KEY);
    const id = raw.split('\n')[0]?.trim() ?? '';
    if (!id || searchParams.get('employeeId')?.trim()) return;
    setEmployeeId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('employeeId', id);
    router.push(`/hr/employees/history?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    if (!companyId) return;
    const urlEmployee = searchParams.get('employeeId')?.trim() ?? '';
    if (employeeId && employeeId !== urlEmployee) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('companyId', companyId);
    if (!employeeId || companyJustChanged) params.delete('employeeId');
    if (fromDate && toDate && !dateError) {
      params.set('from', fromDate);
      params.set('to', toDate);
    } else {
      params.delete('from');
      params.delete('to');
    }
    const next = `/hr/employees/history?${params.toString()}`;
    const current = `/hr/employees/history?${searchParams.toString()}`;
    if (next === current) return;
    router.replace(next);
  }, [companyId, companyJustChanged, dateError, employeeId, fromDate, router, searchParams, toDate]);

  function selectEmployee(id: string) {
    setEmployeeId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (companyId) params.set('companyId', companyId);
    if (id) params.set('employeeId', id);
    else params.delete('employeeId');
    if (fromDate && toDate && !dateError) {
      params.set('from', fromDate);
      params.set('to', toDate);
    } else {
      params.delete('from');
      params.delete('to');
    }
    const next = `/hr/employees/history?${params.toString()}`;
    const current = `/hr/employees/history?${searchParams.toString()}`;
    if (next === current) return;
    if (id && id !== employeeIdFromUrl) router.push(next);
    else router.replace(next);
  }

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setEmployeesLoading(true);
    const loadEmployees = async () => {
      const pageSize = 1000;
      const rows: EmployeeOption[] = [];
      let offset = 0;
      let total = 0;
      do {
        const res = await fetch(
          `/api/hr/employees?limit=${pageSize}&offset=${offset}&companyId=${encodeURIComponent(companyId)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        const items = Array.isArray(json.data?.items) ? json.data.items : [];
        total = Number(json.data?.total ?? items.length);
        rows.push(
          ...items.map((row: {
            id: string;
            fullName?: string;
            preferredName?: string | null;
            employeeCode?: string;
            designation?: string | null;
            department?: string | null;
            status?: string;
          }) => ({
            id: row.id,
            fullName: row.fullName || 'Employee',
            employeeCode: row.employeeCode || '',
            designation: row.designation ?? null,
            department: row.department ?? null,
            status: row.status || '',
            label: `${row.preferredName || row.fullName || 'Employee'}${row.employeeCode ? ` (${row.employeeCode})` : ''}`,
            searchText: `${row.fullName ?? ''} ${row.preferredName ?? ''} ${row.employeeCode ?? ''}`,
          }))
        );
        offset += items.length;
        if (items.length === 0) break;
      } while (offset < total);
      return rows;
    };
    loadEmployees()
      .then((rows) => {
        if (!cancelled) setEmployees(rows);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      })
      .finally(() => {
        if (!cancelled) setEmployeesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!canSeeAbsence || !companyId || dateError || oneDate) {
      setAbsenceCounts(null);
      setAbsenceLoading(false);
      return;
    }
    let cancelled = false;
    setAbsenceLoading(true);
    const params = new URLSearchParams({ companyId });
    if (fromDate && toDate) {
      params.set('from', fromDate);
      params.set('to', toDate);
    }
    fetch(`/api/hr/employees/absence-counts?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        const items = Array.isArray(json?.data?.items) ? json.data.items : [];
        if (!res.ok) throw new Error('counts');
        return Object.fromEntries(
          items.map((row: { employeeId?: string; absentDays?: number }) => [row.employeeId, Number(row.absentDays ?? 0)])
        ) as Record<string, number>;
      })
      .then((counts) => {
        if (!cancelled) setAbsenceCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setAbsenceCounts({});
      })
      .finally(() => {
        if (!cancelled) setAbsenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canSeeAbsence, companyId, fromDate, toDate, dateError, oneDate]);

  useEffect(() => {
    if (companyJustChanged || !canView || !companyId || !employeeId || dateError || oneDate) {
      if (!employeeId || dateError || oneDate) setReport(null);
      return;
    }
    let cancelled = false;
    setReport(null);
    setLoading(true);
    setError('');
    const useVisaRange = !fromDate && !toDate && visaSelected;
    const params = new URLSearchParams({ companyId });
    if (fromDate && toDate) {
      params.set('from', fromDate);
      params.set('to', toDate);
    } else if (useVisaRange) {
      params.set('visaRange', '1');
    }
    fetch(`/api/hr/employees/${employeeId}/history?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not load the history');
        if (!cancelled) setReport(json.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(err instanceof Error ? err.message : 'Could not load the history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, companyId, companyJustChanged, dateError, employeeId, fromDate, oneDate, toDate, visaSelected]);

  const employeeItems = useMemo(() => employees, [employees]);
  const visibleReport = employeeId && report?.employee.id === employeeId ? report : null;

  async function downloadAttendance(kind: 'pdf' | 'docx') {
    const handle = attendanceRef.current;
    if (exportLock.current || !visibleReport || !handle || exporting || (kind === 'pdf' && !handle.sheet)) return;
    exportLock.current = true;
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf' && handle.sheet) {
        const { downloadAttendanceReportPdf } = await import('@/lib/hr/downloadAttendanceReportPdf');
        await downloadAttendanceReportPdf(handle.sheet, attendanceReportFileName(visibleReport, 'pdf'));
      } else {
        const { downloadAttendanceReportDocx } = await import('@/lib/hr/attendanceDeductionDocx');
        await downloadAttendanceReportDocx(
          handle.draft,
          visibleReport,
          activeSections,
          attendanceReportFileName(visibleReport, 'docx'),
        );
      }
      setExportOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the attendance report');
    } finally {
      exportLock.current = false;
      setExporting(null);
    }
  }

  const fieldClass = 'h-10 w-full rounded-md border border-white/10 bg-slate-950/80 px-3 text-sm text-white';

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Employee history</h1>
          <p className="text-xs text-slate-400">Basic details stay at the top. Word and PDF use the sections checked below.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setExportOpen(true)} disabled={!visibleReport || loading}>
            Export
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-slate-900/35 p-4">
      <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto]">
        <HrCompanySearchSelect
          value={companyId}
          onChange={(next) => {
            if (next !== companyId) {
              setEmployeeId('');
              setReport(null);
            }
            setCompanyId(next);
            writeHrPreferredCompanyId(next || null);
          }}
        />
        <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Employee
          <SearchSelect
            items={employeeItems}
            value={employeeId}
            onChange={selectEmployee}
            placeholder="Search employee..."
            openOnFocus
            browseAllOnOpen
            minCharactersToSearch={0}
            inputProps={{ className: 'h-10' }}
          />
        </label>
        <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          From
          <input className={fieldClass} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          To
          <input className={fieldClass} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="h-10"
          onClick={() => {
            setFromDate('');
            setToDate('');
          }}
        >
          Reset
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Include</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-200">
          <input
            type="checkbox"
            className="size-3.5 accent-emerald-400"
            checked={allDetails}
            onChange={(event) => setSections(event.target.checked ? allowedSections : [])}
          />
          All details
        </label>
        {allowedSections.map((section) => (
          <label key={section} className="flex items-center gap-1.5 text-xs text-slate-200">
            <input
              type="checkbox"
              className="size-3.5 accent-emerald-400"
              checked={activeSections.includes(section)}
              onChange={() =>
                setSections((current) =>
                  current.includes(section) ? current.filter((item) => item !== section) : [...current, section]
                )
              }
            />
            {SECTION_LABELS[section]}
          </label>
        ))}
      </div>
      </div>
      {dateError ? <p className="text-xs text-red-300">{dateError}</p> : null}
      {oneDate ? <p className="text-xs text-slate-400">Choose both dates, or reset them to see the full history.</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {loading ? <p className="text-xs text-slate-400">Loading history...</p> : null}
      {!employeeId ? (
        <section className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/35">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Employees</h2>
            <p className="mt-1 text-xs text-slate-400">
              Click a row, or search above, to open that employee&apos;s history.
            </p>
          </div>
          {!companyId || employeesLoading ? (
            <p className="px-4 py-6 text-xs text-slate-400">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400">No employees in this company.</p>
          ) : (
            <div className="max-h-[calc(100vh-16rem)] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-950">
                  <tr>
                    {['Name', 'Code', 'Designation', 'Department', 'Status', ...(canSeeAbsence ? ['No of Absent'] : [])].map((header) => (
                      <th key={header} className="border-b border-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr
                      key={employee.id}
                      data-nav-href={`/hr/employees/${employee.id}`}
                      className="cursor-pointer border-b border-white/5 text-slate-200 hover:bg-white/5"
                      onClick={() => selectEmployee(employee.id)}
                    >
                      <td className="px-4 py-2.5 font-medium text-white">{employee.fullName}</td>
                      <td className="px-4 py-2.5">{employee.employeeCode || '—'}</td>
                      <td className="px-4 py-2.5">{employee.designation || '—'}</td>
                      <td className="px-4 py-2.5">{employee.department || '—'}</td>
                      <td className="px-4 py-2.5">{prettyStatus(employee.status)}</td>
                      {canSeeAbsence ? (
                        <td className="px-4 py-2.5">
                          {dateError || oneDate ? '—' : absenceLoading || !absenceCounts ? '…' : (absenceCounts[employee.id] ?? 0)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {visibleReport ? (
        <AttendanceDeductionReport ref={attendanceRef} report={visibleReport} sections={activeSections} />
      ) : null}
      <Modal
        isOpen={exportOpen}
        onClose={() => {
          if (exporting) return;
          setExportOpen(false);
        }}
        title="Export"
        description="Download this attendance document."
        size="sm"
      >
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" loading={exporting === 'docx'} disabled={!visibleReport || Boolean(exporting)} onClick={() => void downloadAttendance('docx')}>
            Word
          </Button>
          <Button type="button" variant="secondary" className="flex-1" loading={exporting === 'pdf'} disabled={!visibleReport || Boolean(exporting)} onClick={() => void downloadAttendance('pdf')}>
            PDF
          </Button>
        </div>
      </Modal>
    </div>
  );
}
