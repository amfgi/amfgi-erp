'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrCompanySearchSelect from '@/components/hr/HrCompanySearchSelect';
import HrPageChrome from '@/components/hr/HrPageChrome';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EXTRA_FILE_MAX_COUNT } from '@/lib/hr/employeeExtraFiles';
import { dubaiTodayYmd } from '@/lib/hr/payroll/calendar';
import {
  formatDeductionSpan,
  formatPayrollMonthLabel,
  planFineInstallments,
  shiftPayrollMonth,
  type FineRecoveryInput,
} from '@/lib/hr/payroll/fineInstallments';
import { cn } from '@/lib/utils';
import { readApiJson } from '@/lib/utils/readApiResponse';

type FineStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type StatusFilter = 'ALL' | FineStatus;

type FineFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaUrl: string;
};

type FineInstallment = {
  payrollMonth: string;
  amount: number;
  sequence: number;
};

type FineRow = {
  id: string;
  companyId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePreferredName: string | null;
  fineDate: string;
  description: string;
  amount: number;
  status: FineStatus;
  installments: FineInstallment[];
  files: FineFile[];
};

type RecoveryMode = 'fine-month' | 'later-month' | 'range';

type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
};

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
];

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt';

function formatMoney(value: number) {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function deductionLabel(fine: FineRow): string {
  if (fine.status !== 'APPROVED') return '—';
  if (fine.installments.length === 0) return formatPayrollMonthLabel(fine.fineDate.slice(0, 7));
  return formatDeductionSpan(fine.installments.map((row) => row.payrollMonth));
}

function employeeLabel(employee: { employeeCode: string; employeeName?: string; fullName?: string; employeePreferredName?: string | null; preferredName?: string | null }) {
  const name = employee.employeePreferredName || employee.preferredName || employee.employeeName || employee.fullName || '';
  return `${employee.employeeCode} — ${name}`;
}

function statusClass(status: FineStatus) {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200';
  return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200';
}

export default function FineManagementPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = session?.user?.isSuperAdmin || perms.includes('hr.payroll.compensation');

  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [fines, setFines] = useState<FineRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<FineRow | null>(null);

  const loadFines = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (companyId) q.set('companyId', companyId);
      if (status !== 'ALL') q.set('status', status);
      const res = await fetch(`/api/hr/payroll/fines?${q}`, { cache: 'no-store' });
      const json = await readApiJson<{ fines: FineRow[] }>(res);
      if (!json || !res.ok || !json.success) {
        toast.error(json?.error ?? 'Failed to load fines');
        setFines([]);
      } else {
        setFines(json.data?.fines ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [canView, companyId, status]);

  useEffect(() => {
    void loadFines();
  }, [loadFines]);

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.compensation permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Fine management</h1>
          <p className="text-sm text-muted-foreground">
            Pending fines stay off payroll. The date is today and cannot be changed. On approve, deduct the
            full amount in the fine month, move it to a later month, or split it across several months.
            Once a fine is approved or rejected, it cannot be changed. Double-click a row to review it.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (!companyId) {
              toast.error('Select a company first');
              return;
            }
            setAddOpen(true);
          }}
        >
          Add fine
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <HrCompanySearchSelect
          value={companyId}
          onChange={setCompanyId}
          allowClear
          label="Company"
          placeholder="All companies"
          className="w-56"
        />
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatus(filter.id)}
                className={cn(
                  'h-8 rounded-md border px-3 text-sm',
                  status === filter.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Deduction</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Files</th>
            </tr>
          </thead>
          <tbody>
            {fines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading fines…' : 'No fines in this list.'}
                </td>
              </tr>
            ) : (
              fines.map((fine) => (
                <tr
                  key={fine.id}
                  className="cursor-pointer border-b border-border/60 hover:bg-muted/40"
                  onDoubleClick={() => setDetail(fine)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{employeeLabel(fine)}</div>
                    {fine.employeePreferredName && fine.employeePreferredName !== fine.employeeName ? (
                      <div className="text-xs text-muted-foreground">{fine.employeeName}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fine.fineDate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(fine.amount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{deductionLabel(fine)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', statusClass(fine.status))}>
                      {fine.status === 'PENDING' ? 'Pending' : fine.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={fine.description}>
                    {fine.description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fine.files.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {addOpen ? (
        <AddFineModal
          companyId={companyId}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void loadFines();
          }}
        />
      ) : null}
      {detail ? (
        <FineDetailModal
          key={detail.id}
          fine={detail}
          onClose={() => setDetail(null)}
          onSaved={(next) => {
            void loadFines();
            if (next.status === 'APPROVED' || next.status === 'REJECTED') {
              setDetail(null);
              return;
            }
            setDetail(next);
          }}
        />
      ) : null}
    </HrPageChrome>
  );
}

function FilePicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">Documents</label>
      <Input
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="mt-1"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          onChange([...files, ...picked].slice(0, EXTRA_FILE_MAX_COUNT));
          event.target.value = '';
        }}
      />
      {files.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="shrink-0 text-xs text-rose-700 hover:underline dark:text-rose-300"
                onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Optional. You can add more than one file and remove any before submit.</p>
      )}
    </div>
  );
}

function AddFineModal({
  companyId,
  onClose,
  onSaved,
}: {
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams({ companyId });
    void fetch(`/api/hr/payroll/fines/employees?${q}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data?.employees)) {
          setEmployees(json.data.employees as EmployeeOption[]);
        }
      })
      .catch(() => {});
  }, [companyId]);

  const items = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: employeeLabel(employee),
        searchText: `${employee.employeeCode} ${employee.fullName} ${employee.preferredName ?? ''}`,
      })),
    [employees]
  );

  async function submit() {
    if (!employeeId) {
      toast.error('Select an employee');
      return;
    }
    if (!description.trim()) {
      toast.error('Enter a description');
      return;
    }
    if (!amount.trim()) {
      toast.error('Enter a fine amount greater than 0');
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.set('companyId', companyId);
      body.set('employeeId', employeeId);
      body.set('description', description.trim());
      body.set('amount', amount.trim());
      for (const file of files) body.append('files', file);
      const res = await fetch('/api/hr/payroll/fines', { method: 'POST', body });
      const json = await readApiJson(res);
      if (!json || !res.ok || !json.success) {
        toast.error(json?.error ?? 'Failed to add fine');
        return;
      }
      toast.success('Fine added as pending');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add fine"
      description="The fine stays pending until it is approved."
      size="lg"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Submit'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchSelect
          items={items}
          value={employeeId}
          onChange={setEmployeeId}
          label="Employee"
          placeholder="Search by ID or name"
          openOnFocus
          minCharactersToSearch={0}
          dropdownInPortal
          required
        />
        <div>
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="mt-1 text-sm">{dubaiTodayYmd()}</p>
          <p className="text-xs text-muted-foreground">Today. This date cannot be changed.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fine amount (AED)</label>
          <Input
            className="mt-1"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </div>
        <FilePicker files={files} onChange={setFiles} />
      </div>
    </Modal>
  );
}

function DeductionSummary({ fine, fineMonth }: { fine: FineRow; fineMonth: string }) {
  const rows =
    fine.installments.length > 0
      ? fine.installments
      : fine.status === 'APPROVED'
        ? [{ payrollMonth: fineMonth, amount: fine.amount, sequence: 1 }]
        : [];
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">Payroll deduction</p>
      <ul className="mt-1 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.payrollMonth} className="flex justify-between gap-3">
            <span>{formatPayrollMonthLabel(row.payrollMonth)}</span>
            <span className="tabular-nums">{formatMoney(row.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeductionChooser({
  fineMonth,
  amountLabel,
  mode,
  onMode,
  laterMonth,
  onLaterMonth,
  rangeFrom,
  onRangeFrom,
  rangeTo,
  onRangeTo,
  preview,
}: {
  fineMonth: string;
  amountLabel: string;
  mode: RecoveryMode;
  onMode: (mode: RecoveryMode) => void;
  laterMonth: string;
  onLaterMonth: (month: string) => void;
  rangeFrom: string;
  onRangeFrom: (month: string) => void;
  rangeTo: string;
  onRangeTo: (month: string) => void;
  preview: ReturnType<typeof planFineInstallments>;
}) {
  const laterMin = shiftPayrollMonth(fineMonth, 1);
  const rangeToMin = shiftPayrollMonth(rangeFrom || fineMonth, 1);
  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-xs text-muted-foreground">Deduct from payroll</legend>
      <p className="text-xs text-muted-foreground">
        Used only when you approve. Each amount is added to that month&apos;s deductions and taken off gross.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="fine-recovery"
          className="mt-1"
          checked={mode === 'fine-month'}
          onChange={() => onMode('fine-month')}
        />
        <span>
          Fine month ({formatPayrollMonthLabel(fineMonth)}) — full {amountLabel}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="fine-recovery"
          className="mt-1"
          checked={mode === 'later-month'}
          onChange={() => onMode('later-month')}
        />
        <span>One later month — full amount in that month only</span>
      </label>
      {mode === 'later-month' ? (
        <Input type="month" className="ml-6 max-w-[12rem]" min={laterMin} value={laterMonth} onChange={(event) => onLaterMonth(event.target.value)} />
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="fine-recovery"
          className="mt-1"
          checked={mode === 'range'}
          onChange={() => onMode('range')}
        />
        <span>Split across months</span>
      </label>
      {mode === 'range' ? (
        <div className="ml-6 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <Input type="month" className="mt-1" min={fineMonth} value={rangeFrom} onChange={(event) => onRangeFrom(event.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <Input type="month" className="mt-1" min={rangeToMin} value={rangeTo} onChange={(event) => onRangeTo(event.target.value)} />
          </label>
        </div>
      ) : null}
      {'error' in preview ? (
        <p className="text-xs text-rose-700 dark:text-rose-300">{preview.error}</p>
      ) : (
        <ul className="space-y-1 border-t border-border pt-2 text-sm">
          {preview.installments.map((row) => (
            <li key={row.payrollMonth} className="flex justify-between gap-3">
              <span>{formatPayrollMonthLabel(row.payrollMonth)}</span>
              <span className="tabular-nums">{formatMoney(row.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{amountLabel}</span>
          </li>
        </ul>
      )}
    </fieldset>
  );
}

function recoveryFromMode(mode: RecoveryMode, fineMonth: string, laterMonth: string, rangeFrom: string, rangeTo: string): FineRecoveryInput | null {
  if (mode === 'fine-month') return { mode: 'month', month: fineMonth };
  if (mode === 'later-month') return { mode: 'month', month: laterMonth };
  return { mode: 'range', from: rangeFrom, to: rangeTo };
}

function FineDetailModal({
  fine,
  onClose,
  onSaved,
}: {
  fine: FineRow;
  onClose: () => void;
  onSaved: (fine: FineRow) => void;
}) {
  const fineMonth = fine.fineDate.slice(0, 7);
  const [description, setDescription] = useState(fine.description);
  const [amount, setAmount] = useState(fine.amount.toFixed(2));
  const [files, setFiles] = useState(fine.files);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('fine-month');
  const [laterMonth, setLaterMonth] = useState(() => shiftPayrollMonth(fineMonth, 1));
  const [rangeFrom, setRangeFrom] = useState(fineMonth);
  const [rangeTo, setRangeTo] = useState(() => shiftPayrollMonth(fineMonth, 1));

  const visibleFiles = files.filter((file) => !removedIds.includes(file.id));
  const locked = fine.status !== 'PENDING';
  const parsedAmount = Number(amount);
  const recoveryPreview = useMemo(
    () =>
      planFineInstallments({
        fineDate: fine.fineDate,
        amount: parsedAmount,
        recovery: recoveryFromMode(recoveryMode, fineMonth, laterMonth, rangeFrom, rangeTo),
      }),
    [fine.fineDate, fineMonth, laterMonth, parsedAmount, rangeFrom, rangeTo, recoveryMode]
  );
  const approveBlocked = 'error' in recoveryPreview;

  async function save(nextStatus?: 'APPROVED' | 'REJECTED') {
    if (locked) {
      toast.error('This fine is already decided and cannot be changed');
      return;
    }
    if (nextStatus === 'APPROVED' && 'error' in recoveryPreview) {
      toast.error(recoveryPreview.error);
      return;
    }
    if (!description.trim()) {
      toast.error('Enter a description');
      return;
    }
    if (!amount.trim()) {
      toast.error('Enter a fine amount greater than 0');
      return;
    }
    if (visibleFiles.length + newFiles.length > EXTRA_FILE_MAX_COUNT) {
      toast.error(`A fine can have at most ${EXTRA_FILE_MAX_COUNT} files`);
      return;
    }
    setSaving(true);
    try {
      for (const fileId of removedIds) {
        const deleteRes = await fetch(
          `/api/hr/payroll/fines/${fine.id}/files/${fileId}?companyId=${encodeURIComponent(fine.companyId)}`,
          { method: 'DELETE' }
        );
        if (!deleteRes.ok) {
          const deleteJson = await readApiJson(deleteRes);
          toast.error(deleteJson?.error ?? 'A file could not be removed');
          return;
        }
      }
      if (removedIds.length > 0) {
        setFiles((current) => current.filter((file) => !removedIds.includes(file.id)));
        setRemovedIds([]);
      }

      if (newFiles.length > 0) {
        const body = new FormData();
        body.set('companyId', fine.companyId);
        for (const file of newFiles) body.append('files', file);
        const uploadRes = await fetch(`/api/hr/payroll/fines/${fine.id}/files`, { method: 'POST', body });
        const uploadJson = await readApiJson<{ fine: FineRow; errors: string[] }>(uploadRes);
        if (!uploadJson || !uploadRes.ok || !uploadJson.success) {
          toast.error(uploadJson?.error ?? 'File upload failed');
          return;
        }
        if (uploadJson.data?.errors?.length) {
          toast.error(uploadJson.data.errors[0] ?? 'Some files were not uploaded');
        }
        if (uploadJson.data?.fine) setFiles(uploadJson.data.fine.files);
        setNewFiles([]);
      }

      const patchRes = await fetch(`/api/hr/payroll/fines/${fine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: fine.companyId,
          description: description.trim(),
          amount: amount.trim(),
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextStatus === 'APPROVED'
            ? { recovery: recoveryFromMode(recoveryMode, fineMonth, laterMonth, rangeFrom, rangeTo) }
            : {}),
        }),
      });
      const patchJson = await readApiJson<{ fine: FineRow }>(patchRes);
      if (!patchJson || !patchRes.ok || !patchJson.success || !patchJson.data?.fine) {
        toast.error(patchJson?.error ?? 'Failed to save fine');
        return;
      }

      const saved = patchJson.data.fine;
      setFiles(saved.files);
      onSaved(saved);
      toast.success(nextStatus === 'APPROVED' ? 'Fine approved' : nextStatus === 'REJECTED' ? 'Fine rejected' : 'Fine saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Fine details"
      description={employeeLabel(fine)}
      size="lg"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          {locked ? null : (
            <>
              <Button type="button" variant="outline" onClick={() => void save()} disabled={saving}>
                Save
              </Button>
              <Button type="button" variant="outline" onClick={() => void save('REJECTED')} disabled={saving}>
                Reject
              </Button>
              <Button type="button" onClick={() => void save('APPROVED')} disabled={saving || approveBlocked}>
                Approve
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Employee</p>
          <p className="text-sm font-medium">{employeeLabel(fine)}</p>
          <p className="text-xs text-muted-foreground">
            Status: {fine.status === 'PENDING' ? 'Pending' : fine.status === 'APPROVED' ? 'Approved' : 'Rejected'}
          </p>
          {locked ? (
            <p className="mt-1 text-xs text-muted-foreground">This decision is final and cannot be changed.</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Date</p>
          <p className="mt-1 text-sm">{fine.fineDate}</p>
          <p className="text-xs text-muted-foreground">The fine date cannot be changed.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            value={description}
            disabled={locked}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fine amount (AED)</label>
          <Input
            className="mt-1"
            inputMode="decimal"
            value={amount}
            disabled={locked}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        {locked ? (
          <DeductionSummary fine={fine} fineMonth={fineMonth} />
        ) : (
          <DeductionChooser
            fineMonth={fineMonth}
            amountLabel={Number.isFinite(parsedAmount) ? formatMoney(parsedAmount) : amount}
            mode={recoveryMode}
            onMode={setRecoveryMode}
            laterMonth={laterMonth}
            onLaterMonth={setLaterMonth}
            rangeFrom={rangeFrom}
            onRangeFrom={setRangeFrom}
            rangeTo={rangeTo}
            onRangeTo={setRangeTo}
            preview={recoveryPreview}
          />
        )}
        <div>
          <p className="text-xs text-muted-foreground">Documents</p>
          {visibleFiles.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No saved documents.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {visibleFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={file.mediaUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                    {file.fileName}
                  </a>
                  {locked ? null : (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-rose-700 hover:underline dark:text-rose-300"
                      onClick={() => setRemovedIds((current) => [...current, file.id])}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {locked ? null : (
            <div className="mt-2">
              <FilePicker files={newFiles} onChange={setNewFiles} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
