'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { cn } from '@/lib/utils';
import {
  useGetStockExceptionApprovalsQuery,
  useGetStockExceptionsQuery,
  useGetStockIntegrityQuery,
  useUpdateStockExceptionApprovalMutation,
} from '@/store/hooks';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatApprovalType(value: 'DISPATCH_OVERRIDE' | 'RECEIPT_ADJUSTMENT' | 'RECEIPT_CANCELLATION' | 'MANUAL_STOCK_ADJUSTMENT') {
  switch (value) {
    case 'DISPATCH_OVERRIDE':
      return 'Dispatch override';
    case 'RECEIPT_ADJUSTMENT':
      return 'Receipt adjustment';
    case 'RECEIPT_CANCELLATION':
      return 'Receipt cancellation';
    case 'MANUAL_STOCK_ADJUSTMENT':
      return 'Manual stock adjustment';
    default:
      return value;
  }
}

function formatEvidenceType(value: string | null | undefined) {
  switch (value) {
    case 'PHYSICAL_COUNT':
      return 'Physical count';
    case 'DAMAGE_REPORT':
      return 'Damage report';
    case 'SUPPLIER_CLAIM':
      return 'Supplier claim';
    case 'CUSTOMER_RETURN':
      return 'Customer return';
    case 'OTHER':
      return 'Other';
    default:
      return value || '-';
  }
}

function ApprovalStatusBadge({ status }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const label = status.replace(/_/g, ' ');
  const cls =
    status === 'APPROVED'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
      : status === 'REJECTED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {label}
    </Badge>
  );
}

function EventCategoryBadge({ label, severity }: { label: string; severity: string }) {
  const cls =
    severity === 'critical'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {label}
    </Badge>
  );
}

export default function StockExceptionsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('report.view');

  const { data, isFetching, isError, refetch } = useGetStockExceptionsQuery(undefined, {
    skip: !canView,
  });
  const {
    data: approvalsData,
    isFetching: approvalsFetching,
    isError: approvalsError,
    refetch: refetchApprovals,
  } = useGetStockExceptionApprovalsQuery(undefined, {
    skip: !canView,
  });
  const { data: integrityData } = useGetStockIntegrityQuery(undefined, {
    skip: !canView,
  });
  const [updateApproval, { isLoading: approvalSaving }] = useUpdateStockExceptionApprovalMutation();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [approvalType, setApprovalType] = useState('all');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('all');
  const [approvalWarehouseFilter, setApprovalWarehouseFilter] = useState('all');
  const [approvalRequesterFilter, setApprovalRequesterFilter] = useState('all');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const integritySummary = integrityData?.summary;
  const approvalRows = approvalsData?.rows ?? [];
  const approvalSummary = approvalsData?.summary;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== 'all' && row.category !== category) return false;
      if (!query) return true;
      return [
        row.referenceNumber,
        row.reason ?? '',
        row.details,
        row.materialNames.join(' '),
        row.jobNumbers.join(' '),
        row.customerNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [category, rows, search]);

  const approvalWarehouseOptions = useMemo(
    () => Array.from(new Set(approvalRows.flatMap((row) => row.warehouseNames))).sort((a, b) => a.localeCompare(b)),
    [approvalRows]
  );

  const approvalRequesterOptions = useMemo(
    () =>
      Array.from(
        new Set(approvalRows.map((row) => row.createdByName).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b)),
    [approvalRows]
  );

  const filteredApprovalRows = useMemo(() => {
    const query = approvalSearch.trim().toLowerCase();
    return approvalRows.filter((row) => {
      if (approvalType !== 'all' && row.exceptionType !== approvalType) return false;
      if (approvalStatusFilter !== 'all' && row.status !== approvalStatusFilter) return false;
      if (approvalWarehouseFilter !== 'all' && !row.warehouseNames.includes(approvalWarehouseFilter)) return false;
      if (approvalRequesterFilter !== 'all' && row.createdByName !== approvalRequesterFilter) return false;
      if (!query) return true;

      return [
        row.referenceNumber ?? row.referenceId,
        row.reason,
        row.createdByName ?? '',
        row.decidedByName ?? '',
        row.evidenceReference ?? '',
        row.sourceSessionTitle ?? '',
        row.warehouseNames.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [
    approvalRows,
    approvalSearch,
    approvalStatusFilter,
    approvalType,
    approvalWarehouseFilter,
    approvalRequesterFilter,
  ]);

  async function handleApprovalAction(
    row: { id: string; requiresDecisionNote: boolean },
    status: 'APPROVED' | 'REJECTED'
  ) {
    const decisionNote = decisionNotes[row.id]?.trim();
    if (status === 'APPROVED' && row.requiresDecisionNote && !decisionNote) {
      toast.error('This approval requires a decision note.');
      return;
    }
    await updateApproval({
      id: row.id,
      status,
      ...(decisionNote ? { decisionNote } : {}),
    }).unwrap();
    await refetchApprovals();
  }

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Stock exceptions</CardTitle>
            <CardDescription>You do not have permission to view this report.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock control</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock exception dashboard</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                One place for dispatch overrides, receipt cancellations, approved receipt adjustments, and the
                current stock-integrity drift signal.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                void refetch();
                void refetchApprovals();
              }}
            >
              Refresh
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Events</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary?.totalEvents ?? 0}</p>
            </div>
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
                Dispatch overrides
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                {summary?.dispatchOverrideCount ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Receipt adjustments</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary?.receiptAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Receipt cancellations</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary?.receiptCancellationCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Manual adjustments</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary?.manualStockAdjustmentCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Integrity exceptions</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
                {integritySummary?.materialsWithExceptions ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Linked jobs</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{summary?.linkedJobsCount ?? 0}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-yellow-500/35 bg-yellow-500/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-yellow-800 dark:text-yellow-200">
                Pending approvals
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-yellow-900 dark:text-yellow-100">
                {approvalSummary?.pending ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-orange-500/35 bg-orange-500/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-orange-800 dark:text-orange-200">
                Pending over 24h
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-orange-900 dark:text-orange-100">
                {approvalSummary?.pendingOver24h ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                Approved
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                {approvalSummary?.approved ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-destructive">Rejected</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-destructive">{approvalSummary?.rejected ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Approval records</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{approvalSummary?.total ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</label>
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, reason, material, job, customer…"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Category</label>
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All exceptions</option>
                <option value="dispatch_override">Dispatch overrides</option>
                <option value="receipt_adjustment">Receipt adjustments</option>
                <option value="receipt_cancellation">Receipt cancellations</option>
                <option value="manual_stock_adjustment">Manual stock adjustments</option>
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">
                Dispatch overrides include the saved override trail for budget or negative-stock exception saves.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_220px_180px_180px_180px]">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Queue search
              </label>
              <Input
                type="search"
                value={approvalSearch}
                onChange={(event) => setApprovalSearch(event.target.value)}
                placeholder="Reference, requester, evidence, warehouse…"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
              <Select value={approvalType} onChange={(event) => setApprovalType(event.target.value)}>
                <option value="all">All types</option>
                <option value="DISPATCH_OVERRIDE">Dispatch override</option>
                <option value="RECEIPT_ADJUSTMENT">Receipt adjustment</option>
                <option value="RECEIPT_CANCELLATION">Receipt cancellation</option>
                <option value="MANUAL_STOCK_ADJUSTMENT">Manual adjustment</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</label>
              <Select value={approvalStatusFilter} onChange={(event) => setApprovalStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Warehouse
              </label>
              <Select value={approvalWarehouseFilter} onChange={(event) => setApprovalWarehouseFilter(event.target.value)}>
                <option value="all">All warehouses</option>
                {approvalWarehouseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Requester
              </label>
              <Select value={approvalRequesterFilter} onChange={(event) => setApprovalRequesterFilter(event.target.value)}>
                <option value="all">All requesters</option>
                {approvalRequesterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-[150px] px-3 py-3">Created</th>
                  <th className="min-w-[160px] px-3 py-3">Type</th>
                  <th className="min-w-[140px] px-3 py-3">Reference</th>
                  <th className="min-w-[120px] px-3 py-3">Status</th>
                  <th className="min-w-[180px] px-3 py-3">Warehouse / Source</th>
                  <th className="min-w-[160px] px-3 py-3">Requested by</th>
                  <th className="min-w-[220px] px-3 py-3">Reason</th>
                  <th className="min-w-[220px] px-3 py-3">Decision</th>
                  <th className="min-w-[260px] px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvalsFetching && filteredApprovalRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Loading approval queue…
                    </td>
                  </tr>
                ) : approvalsError ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-destructive">
                      Could not load approval queue.
                    </td>
                  </tr>
                ) : filteredApprovalRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No approval records match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredApprovalRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5 text-foreground">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2.5 text-foreground">{formatApprovalType(row.exceptionType)}</td>
                      <td className="px-3 py-2.5 font-mono text-foreground">{row.referenceNumber || row.referenceId}</td>
                      <td className="px-3 py-2.5">
                        <ApprovalStatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        <div>{row.warehouseNames.join(', ') || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.sourceSessionTitle || row.evidenceReference || 'No linked source'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{row.createdByName || '-'}</td>
                      <td className="px-3 py-2.5 text-foreground">
                        {row.reason}
                        {row.exceptionType === 'MANUAL_STOCK_ADJUSTMENT' ? (
                          <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                            <div>
                              {row.lineCount > 0 && row.netQuantity != null
                                ? `${row.lineCount} lines, net ${row.netQuantity.toFixed(3)}`
                                : 'Bulk request'}
                            </div>
                            <div>
                              {formatEvidenceType(row.evidenceType)}
                              {row.evidenceReference ? `: ${row.evidenceReference}` : ''}
                            </div>
                            {row.requiresDecisionNote ? (
                              <div>Decision note required on approval</div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.decidedAt ? `${row.decidedByName || 'Unknown'} on ${formatDateTime(row.decidedAt)}` : '-'}
                        {row.decisionNote ? <div className="mt-1 text-xs text-foreground">{row.decisionNote}</div> : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.status === 'PENDING' ? 'Age' : 'Turnaround'}: {row.ageHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}h
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {isSA && row.status === 'PENDING' ? (
                          <div className="space-y-2">
                            <textarea
                              value={decisionNotes[row.id] ?? ''}
                              onChange={(event) =>
                                setDecisionNotes((current) => ({ ...current, [row.id]: event.target.value }))
                              }
                              placeholder="Decision note"
                              className={cn(
                                'min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
                                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              )}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => void handleApprovalAction(row, 'APPROVED')}
                                disabled={approvalSaving}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleApprovalAction(row, 'REJECTED')}
                                disabled={approvalSaving}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
          Pending dispatch overrides can now be approved or rejected here. Receipt adjustments and cancellations are recorded as approved under the current policy trail.
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Event trail</h2>
              <p className="text-sm text-muted-foreground">
                Raw exception events remain visible for investigation and reconciliation.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {isError ? (
            <Alert variant="destructive">
              <AlertDescription>Could not load the exception dashboard. Try refresh.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="min-w-[150px] px-3 py-3">When</th>
                    <th className="min-w-[150px] px-3 py-3">Category</th>
                    <th className="min-w-[150px] px-3 py-3">Reference</th>
                    <th className="min-w-[180px] px-3 py-3">Materials</th>
                    <th className="min-w-[150px] px-3 py-3">Jobs</th>
                    <th className="min-w-[150px] px-3 py-3">Customers</th>
                    <th className="min-w-[260px] px-3 py-3">Reason</th>
                    <th className="min-w-[280px] px-3 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        No exception events match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border odd:bg-background even:bg-muted/20 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5 text-foreground">{formatDateTime(row.occurredAt)}</td>
                        <td className="px-3 py-2.5">
                          <EventCategoryBadge label={row.categoryLabel} severity={row.severity} />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-foreground">{row.referenceNumber}</td>
                        <td className="px-3 py-2.5 text-foreground">{row.materialNames.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-foreground">{row.jobNumbers.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-foreground">{row.customerNames.join(', ') || '-'}</td>
                        <td className="px-3 py-2.5 text-foreground">{row.reason || '-'}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Use{' '}
        <Link href="/stock/integrity" className="font-medium text-primary underline-offset-4 hover:underline">
          Stock integrity
        </Link>{' '}
        for quantity drift details,{' '}
        <Link href="/reports/stock-adjustments" className="font-medium text-primary underline-offset-4 hover:underline">
          stock adjustments
        </Link>{' '}
        for bulk manual correction value audit, and{' '}
        <Link href="/stock/goods-receipt" className="font-medium text-primary underline-offset-4 hover:underline">
          Goods receipt history
        </Link>{' '}
        for receipt-level investigation and corrections.
      </p>
    </div>
  );
}
