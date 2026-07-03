'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

import { MetricCard } from '@/components/me/shared';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { readApiJson } from '@/lib/utils/readApiResponse';
import { cn } from '@/lib/utils';

type LeaveTypeOption = { id: string; name: string; code: string; isActive?: boolean };

type LeaveRow = {
  id: string;
  leaveType: string;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  submittedAt: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  leaveTypeRef?: { id: string; name: string; code: string } | null;
  reviewedBy?: { id: string; name: string | null } | null;
};

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

type BalanceData = {
  entitlementDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  rolloverEnabled: boolean;
  allocation: {
    allocationStart: string | null;
    allocationLabel: string;
    visaHoldingLabel: string;
    fullYearEntitlementDays: number;
    daysPerMonth: number;
    accruedMonths: number;
    computedEntitlementDays: number;
  };
  leaveTypeBalances: LeaveTypeBalance[];
};

type DashboardLeaveSummary = {
  leaveBalance: Pick<BalanceData, 'remainingDays' | 'usedDays' | 'rolloverEnabled'>;
  leaveSummary: {
    pendingCount: number;
    approvedLeaveDaysYtd: number;
  };
};

function statusTone(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
  if (status === 'PENDING') return 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
  if (status === 'REJECTED') return 'bg-red-500/10 text-red-800 dark:text-red-300';
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-300';
}

function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function MeLeavePage() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dashboardLeave, setDashboardLeave] = useState<DashboardLeaveSummary | null>(null);

  const load = useCallback(async () => {
    const [reqRes, balRes, typesRes, dashRes] = await Promise.all([
      fetch('/api/me/leave-requests', { cache: 'no-store' }),
      fetch('/api/me/leave-balance', { cache: 'no-store' }),
      fetch('/api/me/leave-types', { cache: 'no-store' }),
      fetch('/api/me/dashboard', { cache: 'no-store' }),
    ]);
    const reqJson = await readApiJson<LeaveRow[]>(reqRes);
    const balJson = await readApiJson<BalanceData>(balRes);
    const typesJson = await readApiJson<LeaveTypeOption[]>(typesRes);
    const dashJson = await readApiJson<DashboardLeaveSummary>(dashRes);
    if (reqRes.ok && reqJson?.success) setRows(reqJson.data as LeaveRow[]);
    if (balRes.ok && balJson?.success) setBalance(balJson.data as BalanceData);
    if (dashRes.ok && dashJson?.success && dashJson.data) {
      setDashboardLeave(dashJson.data as DashboardLeaveSummary);
    } else {
      setDashboardLeave(null);
    }
    if (typesRes.ok && typesJson?.success) {
      const types = (typesJson.data ?? []) as LeaveTypeOption[];
      const active = types.filter((t) => t.isActive !== false);
      setLeaveTypes(active);
      setLeaveTypeId((prev) => prev || active[0]?.id || '');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!startDate || !leaveTypeId) {
      toast.error('Start date and leave type required');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/me/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveTypeId,
        startDate,
        endDate: endDate || startDate,
        reason: reason.trim() || undefined,
      }),
    });
    const json = await readApiJson(res);
    setSubmitting(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to submit');
      return;
    }
    toast.success('Leave request submitted');
    setStartDate('');
    setEndDate('');
    setReason('');
    void load();
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/me/leave-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Cancel failed');
      return;
    }
    toast.success('Request cancelled');
    void load();
  };

  const leaveLabel = (row: LeaveRow) =>
    row.leaveTypeRef?.name ??
    leaveTypes.find((t) => t.id === row.leaveTypeId)?.name ??
    row.leaveType.replace(/_/g, ' ');

  const pendingCount = rows.filter((row) => row.status === 'PENDING').length;
  const rolloverEnabled = balance?.rolloverEnabled ?? dashboardLeave?.leaveBalance.rolloverEnabled ?? true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leave requests</h1>
          <p className="text-sm text-muted-foreground">
            Submit requests and track HR decisions. Daily attendance during leave is recorded separately on the day sheet.
          </p>
        </div>
        <Link href="/me" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Home
        </Link>
      </div>

      {dashboardLeave ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={rolloverEnabled ? 'Annual leave remaining' : 'Annual leave remaining (this year)'}
            value={String(dashboardLeave.leaveBalance.remainingDays)}
            tone="emerald"
          />
          <MetricCard label="Annual leave used" value={String(dashboardLeave.leaveBalance.usedDays)} />
          <MetricCard
            label="Pending requests"
            value={String(dashboardLeave.leaveSummary.pendingCount)}
            tone="amber"
          />
          <MetricCard
            label="Approved leave days (YTD)"
            value={String(dashboardLeave.leaveSummary.approvedLeaveDaysYtd)}
            tone="sky"
          />
        </div>
      ) : null}

      {balance ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Leave allocation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accrues at{' '}
                <span className="font-medium text-foreground">
                  {formatDays(balance.allocation.daysPerMonth)} days per month
                </span>{' '}
                ({balance.allocation.fullYearEntitlementDays} days/year)
                {rolloverEnabled ? ' with rollover' : ', resetting each calendar year'}.
              </p>
            </div>
            <Badge variant="outline" className="font-normal">
              {balance.allocation.visaHoldingLabel}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Allocation basis</p>
              <p className="mt-0.5 font-medium">{balance.allocation.allocationLabel}</p>
              <p className="text-xs text-muted-foreground">
                {balance.allocation.allocationStart
                  ? `from ${balance.allocation.allocationStart}`
                  : 'No anchor date on file'}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Months accrued</p>
              <p className="mt-0.5 font-medium tabular-nums">{balance.allocation.accruedMonths}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Annual accrued</p>
              <p className="mt-0.5 font-medium tabular-nums">
                {formatDays(balance.entitlementDays)} days
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-emerald-500/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="mt-0.5 font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatDays(balance.remainingDays)} days
              </p>
              {balance.adjustedDays ? (
                <p className="text-xs text-muted-foreground">
                  includes {balance.adjustedDays > 0 ? '+' : ''}
                  {formatDays(balance.adjustedDays)} manual adjustment
                </p>
              ) : null}
            </div>
          </div>

          {pendingCount > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {pendingCount} request(s) awaiting HR review
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Leave type</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium text-right">Entitlement</th>
                  <th className="px-3 py-2 font-medium text-right">Used</th>
                  <th className="px-3 py-2 font-medium text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balance.leaveTypeBalances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No leave types configured.
                    </td>
                  </tr>
                ) : (
                  balance.leaveTypeBalances.map((typeRow) => (
                    <tr key={typeRow.leaveTypeId} className="border-t border-border/60">
                      <td className="px-3 py-2">
                        <div className="font-medium">{typeRow.name}</div>
                        <div className="text-xs text-muted-foreground">{typeRow.rulesSummary || typeRow.code}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{typeRow.periodLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {typeRow.entitlementDays != null ? formatDays(typeRow.entitlementDays) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatDays(typeRow.usedDays)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {typeRow.remainingDays != null ? formatDays(typeRow.remainingDays) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">New request</h2>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={leaveTypeId}
          onChange={(e) => setLeaveTypeId(e.target.value)}
        >
          {leaveTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">End date (optional)</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Reason</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </div>
        <Button disabled={submitting || leaveTypes.length === 0} onClick={() => void submit()}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Your requests</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {leaveLabel(row)} · {String(row.startDate).slice(0, 10)}
                  {String(row.endDate).slice(0, 10) !== String(row.startDate).slice(0, 10)
                    ? ` → ${String(row.endDate).slice(0, 10)}`
                    : ''}
                </span>
                <Badge className={cn('font-medium', statusTone(row.status))}>{row.status}</Badge>
              </div>
              {row.reason ? <p className="mt-1 text-muted-foreground">{row.reason}</p> : null}
              {row.reviewNote ? (
                <p className="mt-2 rounded-lg bg-muted/50 p-2 text-muted-foreground">
                  HR response: {row.reviewNote}
                  {row.reviewedBy?.name ? ` · ${row.reviewedBy.name}` : ''}
                  {row.reviewedAt ? ` · ${new Date(row.reviewedAt).toLocaleDateString()}` : ''}
                </p>
              ) : null}
              {row.status === 'PENDING' ? (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void cancel(row.id)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
