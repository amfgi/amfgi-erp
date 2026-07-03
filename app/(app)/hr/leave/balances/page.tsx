'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { readApiJson } from '@/lib/utils/readApiResponse';

type LeaveTypeBalance = {
  leaveTypeId: string;
  code: string;
  name: string;
  balanceMode: string;
  periodLabel: string;
  entitlementDays: number | null;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number | null;
  rulesSummary: string;
};

type BalanceRow = {
  id: string | null;
  employeeId: string;
  entitlementDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  leaveTypeBalances: LeaveTypeBalance[];
  allocation: {
    allocationStart: string | null;
    allocationLabel: string;
    visaHolding: string;
    visaHoldingLabel: string;
    fullYearEntitlementDays: number;
    daysPerMonth: number;
    accruedMonths: number;
    computedEntitlementDays: number;
  };
  employee: {
    id: string;
    fullName: string;
    preferredName: string | null;
    employeeCode: string;
    hireDate: string | null;
    status: string;
  };
};

function employeeName(employee: BalanceRow['employee']) {
  return employee.preferredName || employee.fullName;
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function LeaveBalancesPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView =
    session?.user?.isSuperAdmin ||
    perms.includes('hr.leave.view') ||
    perms.includes('hr.leave.approve') ||
    perms.includes('hr.leave.edit');
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.leave.approve');

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<BalanceRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/hr/leave-balances?includeAllEmployees=1`,
      { cache: 'no-store' },
    );
    const json = await readApiJson<BalanceRow[]>(res);
    if (res.ok && json?.success) {
      setRows((json.data ?? []) as BalanceRow[]);
    } else {
      toast.error(json?.error ?? 'Failed to load leave balances');
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.employee.fullName,
        row.employee.preferredName ?? '',
        row.employee.employeeCode,
        row.allocation.visaHoldingLabel,
        row.allocation.allocationLabel,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return visibleRows.reduce(
      (acc, row) => {
        acc.entitlement += row.entitlementDays;
        acc.adjusted += row.adjustedDays;
        acc.used += row.usedDays;
        acc.remaining += row.remainingDays;
        return acc;
      },
      { entitlement: 0, adjusted: 0, used: 0, remaining: 0 },
    );
  }, [visibleRows]);

  const openAdjustModal = (row: BalanceRow) => {
    setAdjustModal(row);
    setAdjustDelta('1');
    setAdjustReason('');
  };

  const submitAdjustment = async () => {
    if (!adjustModal || !canManage) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error('Enter a non-zero day adjustment');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/hr/leave-balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: adjustModal.employeeId,
        adjustmentDelta: delta,
      }),
    });
    const json = await readApiJson(res);
    setSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Could not save adjustment');
      return;
    }
    toast.success(
      adjustReason.trim()
        ? `Adjusted balance (${adjustReason.trim()})`
        : 'Leave balance adjusted',
    );
    setAdjustModal(null);
    void load();
  };

  const recalculateEntitlement = async (row: BalanceRow) => {
    if (!canManage) return;
    setRecalculatingId(row.employeeId);
    const res = await fetch('/api/hr/leave-balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: row.employeeId,
        recalculateEntitlement: true,
      }),
    });
    const json = await readApiJson(res);
    setRecalculatingId(null);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Could not recalculate entitlement');
      return;
    }
    toast.success(`Recalculated entitlement for ${employeeName(row.employee)}`);
    void load();
  };

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You do not have permission to view leave balances.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Leave balances</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Annual leave accrues at{' '}
            <strong className="font-medium text-foreground">2.5 days per month</strong> (30 days/year) from
            hire date or company visa start. Enable rollover on the annual leave type to carry unused days
            forward; otherwise the balance resets each calendar year. Configure rules in{' '}
            <Link
              href="/hr/settings/leave-types"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              leave types
            </Link>
            . Manual adjustments add extra days on top. Expand a row to see each leave type by its rules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hr/leave">
            <Button variant="outline">Leave requests</Button>
          </Link>
        </div>
      </div>

      <Alert className="mb-5 border-sky-500/25 bg-sky-500/5">
        <AlertDescription className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Per-employee accrual</strong> — 2.5 days each month
            from the employee&apos;s own start date through today: hire date for no visa / self own, or
            oldest visa start for company provided visa.
          </p>
          <p>
            <strong className="text-foreground">By leave type</strong> — expand an employee to see balances
            per configured type: annual (lifetime accrual), sick (rolling window), and usage-only types.
          </p>
          <p>
            <strong className="text-foreground">Manual adjustment</strong> — adds or removes days on top of
            the automatic annual entitlement (bonus leave or corrections). Used days update when leave is approved.
          </p>
        </AlertDescription>
      </Alert>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, code, visa type…"
            />
          </label>
        </div>
        <div className="text-sm text-muted-foreground">
          {visibleRows.length} employee{visibleRows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Visa</th>
              <th className="px-3 py-2 font-medium">Allocation</th>
              <th className="px-3 py-2 font-medium text-right">Annual accrued</th>
              <th className="px-3 py-2 font-medium text-right">Manual +/-</th>
              <th className="px-3 py-2 font-medium text-right">Used</th>
              <th className="px-3 py-2 font-medium text-right">Remaining</th>
              {canManage ? <th className="px-3 py-2 font-medium text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground">
                  Loading leave balances…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground">
                  No employees match your search.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const entitlementDrift =
                  Math.abs(row.entitlementDays - row.allocation.computedEntitlementDays) > 0.01;
                const expanded = expandedEmployeeId === row.employeeId;
                return (
                  <Fragment key={row.employeeId}>
                  <tr className="border-t border-border/70">
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 px-0"
                          onClick={() =>
                            setExpandedEmployeeId(expanded ? null : row.employeeId)
                          }
                          aria-label={expanded ? 'Collapse leave types' : 'Expand leave types'}
                        >
                          {expanded ? '−' : '+'}
                        </Button>
                        <div>
                          <div className="font-medium text-foreground">{employeeName(row.employee)}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.employee.employeeCode}
                            {row.employee.hireDate ? ` · hired ${row.employee.hireDate}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-normal">
                        {row.allocation.visaHoldingLabel}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div>{row.allocation.allocationLabel}</div>
                      <div className="text-xs">
                        {row.allocation.allocationStart
                          ? `from ${row.allocation.allocationStart}`
                          : 'No anchor date'}
                        {' · '}
                        {formatDays(row.allocation.daysPerMonth)} days/month
                        {' · '}
                        {row.allocation.accruedMonths} month{row.allocation.accruedMonths === 1 ? '' : 's'}{' '}
                        accrued
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={cn(entitlementDrift && 'text-amber-700 dark:text-amber-300')}>
                        {formatDays(row.entitlementDays)}
                      </span>
                      {entitlementDrift ? (
                        <div className="text-xs text-muted-foreground">
                          calc {formatDays(row.allocation.computedEntitlementDays)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.adjustedDays > 0 ? '+' : ''}
                      {formatDays(row.adjustedDays)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDays(row.usedDays)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                      {formatDays(row.remainingDays)}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openAdjustModal(row)}>
                            Adjust
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={recalculatingId === row.employeeId}
                            onClick={() => void recalculateEntitlement(row)}
                          >
                            {recalculatingId === row.employeeId ? '…' : 'Recalc'}
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  {expanded ? (
                    <tr key={`${row.employeeId}-types`} className="border-t border-border/50 bg-muted/15">
                      <td colSpan={canManage ? 8 : 7} className="px-3 py-3">
                        <div className="ml-9 overflow-x-auto rounded-md border border-border/70">
                          <table className="min-w-full text-xs">
                            <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="px-2 py-1.5 font-medium">Leave type</th>
                                <th className="px-2 py-1.5 font-medium">Period / rules</th>
                                <th className="px-2 py-1.5 font-medium text-right">Entitlement</th>
                                <th className="px-2 py-1.5 font-medium text-right">Used</th>
                                <th className="px-2 py-1.5 font-medium text-right">Manual</th>
                                <th className="px-2 py-1.5 font-medium text-right">Remaining</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.leaveTypeBalances.map((typeRow) => (
                                <tr key={typeRow.leaveTypeId} className="border-t border-border/50">
                                  <td className="px-2 py-1.5">
                                    <div className="font-medium text-foreground">{typeRow.name}</div>
                                    <div className="text-[10px] text-muted-foreground">{typeRow.code}</div>
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground">
                                    <div>{typeRow.periodLabel}</div>
                                    <div className="text-[10px]">{typeRow.rulesSummary || '—'}</div>
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {typeRow.entitlementDays != null
                                      ? formatDays(typeRow.entitlementDays)
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {formatDays(typeRow.usedDays)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {typeRow.adjustedDays > 0 ? '+' : ''}
                                    {formatDays(typeRow.adjustedDays)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                                    {typeRow.remainingDays != null
                                      ? formatDays(typeRow.remainingDays)
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {!loading && visibleRows.length > 0 ? (
            <tfoot className="border-t border-border bg-muted/20 text-sm">
              <tr>
                <td colSpan={3} className="px-3 py-2 font-medium text-muted-foreground">
                  Totals ({visibleRows.length})
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatDays(totals.entitlement)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {totals.adjusted > 0 ? '+' : ''}
                  {formatDays(totals.adjusted)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatDays(totals.used)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                  {formatDays(totals.remaining)}
                </td>
                {canManage ? <td /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <Modal
        isOpen={Boolean(adjustModal)}
        onClose={() => setAdjustModal(null)}
        title="Adjust leave balance"
        size="md"
      >
        {adjustModal ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add or remove days for <strong className="text-foreground">{employeeName(adjustModal.employee)}</strong>.
              Accrual ({formatDays(adjustModal.allocation.daysPerMonth)} days/month) is unchanged —
              use Recalc only if hire or visa dates changed.
            </p>
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Current remaining</span>
                <span className="font-medium tabular-nums">{formatDays(adjustModal.remainingDays)} days</span>
              </div>
              <div className="mt-1 flex justify-between gap-4">
                <span className="text-muted-foreground">Manual adjustment</span>
                <span className="tabular-nums">
                  {adjustModal.adjustedDays > 0 ? '+' : ''}
                  {formatDays(adjustModal.adjustedDays)} days
                </span>
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Days to add or remove
              </span>
              <Input
                type="number"
                step="0.5"
                min={-365}
                max={365}
                value={adjustDelta}
                onChange={(event) => setAdjustDelta(event.target.value)}
                placeholder="e.g. 2 or -1"
              />
              <span className="text-xs text-muted-foreground">Use negative numbers to remove bonus days.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Note (optional)
              </span>
              <Input
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                placeholder="e.g. Ramadan bonus, carry-over correction"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjustModal(null)}>
                Cancel
              </Button>
              <Button onClick={() => void submitAdjustment()} disabled={saving}>
                {saving ? 'Saving…' : 'Save adjustment'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </HrPageChrome>
  );
}
