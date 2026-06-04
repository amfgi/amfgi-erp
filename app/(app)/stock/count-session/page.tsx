'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { cn } from '@/lib/utils';
import {
  buildManualAdjustmentLinesFromCount,
  buildStockCountDraftLines,
  updateStockCountVariance,
  type StockCountDraftLine,
} from '@/lib/utils/stockCountSession';
import {
  DEFAULT_STOCK_CONTROL_SETTINGS,
  readStockControlSettingsFromCompanySettings,
  type StockControlSettings,
} from '@/lib/stock-control/settings';
import {
  useGetMaterialsQuery,
  useGetStockCountSessionByIdQuery,
  useGetStockCountSessionsQuery,
  useGetWarehousesQuery,
  useCreateStockCountSessionMutation,
  useSubmitStockCountSessionMutation,
  useUpdateStockCountSessionMutation,
} from '@/store/hooks';

type DraftState = {
  sessionId?: string | null;
  status?: 'DRAFT' | 'ADJUSTMENT_PENDING' | 'ADJUSTMENT_APPROVED' | 'ADJUSTMENT_REJECTED' | 'CANCELLED' | null;
  currentRevision?: number;
  linkedAdjustmentReferenceNumber?: string | null;
  warehouseId: string;
  sessionTitle: string;
  evidenceReference: string;
  evidenceNotes: string;
  notes: string;
  lines: StockCountDraftLine[];
};

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

const controlClass =
  'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring';

function emptyDraft(): DraftState {
  return {
    sessionId: null,
    status: null,
    currentRevision: 0,
    linkedAdjustmentReferenceNumber: null,
    warehouseId: '',
    sessionTitle: '',
    evidenceReference: '',
    evidenceNotes: '',
    notes: '',
    lines: [],
  };
}

export default function StockCountSessionPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canAdjust = isSA || perms.includes('stock.count_session.edit');
  const canViewMaterials =
    isSA || perms.includes('material.view') || perms.includes('stock.count_session.view');

  const { data: materials = [] } = useGetMaterialsQuery(undefined, {
    skip: !canViewMaterials,
  });
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, {
    skip: !canAdjust,
  });
  const { data: savedSessions = [] } = useGetStockCountSessionsQuery(undefined, {
    skip: !canAdjust,
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data: selectedSession } = useGetStockCountSessionByIdQuery(selectedSessionId ?? '', {
    skip: !canAdjust || !selectedSessionId,
  });
  const [createSession, { isLoading: isCreating }] = useCreateStockCountSessionMutation();
  const [updateSession, { isLoading: isUpdating }] = useUpdateStockCountSessionMutation();
  const [submitSession, { isLoading: isSubmitting }] = useSubmitStockCountSessionMutation();

  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [stockControlSettings, setStockControlSettings] = useState<StockControlSettings>(DEFAULT_STOCK_CONTROL_SETTINGS);
  const [search, setSearch] = useState('');
  const [showVarianceOnly, setShowVarianceOnly] = useState(false);

  const storageKey = useMemo(
    () => (session?.user?.activeCompanyId ? `stock-count-session:${session.user.activeCompanyId}` : null),
    [session?.user?.activeCompanyId]
  );

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DraftState;
      setDraft(parsed);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanySettings = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setStockControlSettings(readStockControlSettingsFromCompanySettings(data?.data?.jobCostingSettings));
      } catch {
        // keep defaults
      }
    };
    void loadCompanySettings();
  }, [session?.user?.activeCompanyId]);

  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.isActive), [warehouses]);
  const activeMaterials = useMemo(() => materials.filter((material) => material.isActive), [materials]);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.lines.filter((line) => {
      if (showVarianceOnly && Math.abs(line.varianceQty) < 0.001) return false;
      if (!query) return true;
      return `${line.materialName} ${line.unit}`.toLowerCase().includes(query);
    });
  }, [draft.lines, search, showVarianceOnly]);

  const adjustmentLines = useMemo(() => buildManualAdjustmentLinesFromCount(draft.lines), [draft.lines]);
  const maxNegativeVariance = useMemo(
    () => adjustmentLines.reduce((max, line) => (line.quantityDelta < 0 ? Math.max(max, Math.abs(line.quantityDelta)) : max), 0),
    [adjustmentLines]
  );
  const isSaving = isCreating || isUpdating;
  const isLoading = isSubmitting || isSaving;

  useEffect(() => {
    if (!selectedSession) return;
    setDraft({
      sessionId: selectedSession.id,
      status: selectedSession.status,
      currentRevision: selectedSession.currentRevision,
      linkedAdjustmentReferenceNumber: selectedSession.linkedAdjustmentReferenceNumber,
      warehouseId: selectedSession.warehouseId,
      sessionTitle: selectedSession.title,
      evidenceReference: selectedSession.evidenceReference ?? '',
      evidenceNotes: selectedSession.evidenceNotes ?? '',
      notes: selectedSession.notes ?? '',
      lines:
        selectedSession.lines?.map((line) => ({
          materialId: line.materialId,
          materialName: line.materialName,
          unit: line.unit,
          warehouseId: line.warehouseId,
          systemQty: line.systemQty,
          countedQty: line.countedQty == null ? '' : line.countedQty.toString(),
          varianceQty: line.varianceQty,
          unitCost: line.unitCost,
        })) ?? [],
    });
  }, [selectedSession]);

  function loadWarehouseSheet() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return;
    }
    const lines = buildStockCountDraftLines(activeMaterials, draft.warehouseId);
    if (lines.length === 0) {
      toast.error('No active materials were found for this warehouse.');
      return;
    }
    const warehouseName = activeWarehouses.find((warehouse) => warehouse.id === draft.warehouseId)?.name || 'warehouse';
    setDraft((current) => ({
      ...current,
      sessionTitle: current.sessionTitle || `${warehouseName} stock count`,
      lines,
    }));
    toast.success(`${lines.length} count lines loaded.`);
  }

  function resetDraft() {
    setDraft(emptyDraft());
    setSelectedSessionId(null);
    setSearch('');
    setShowVarianceOnly(false);
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
  }

  async function saveSession() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return null;
    }
    if (draft.lines.length === 0) {
      toast.error('Load a count sheet first.');
      return null;
    }
    if (!draft.sessionTitle.trim()) {
      toast.error('Enter a session title.');
      return null;
    }

    const body = {
      warehouseId: draft.warehouseId,
      title: draft.sessionTitle.trim(),
      ...(draft.evidenceReference.trim() ? { evidenceReference: draft.evidenceReference.trim() } : {}),
      ...(draft.evidenceNotes.trim() ? { evidenceNotes: draft.evidenceNotes.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      lines: draft.lines.map((line, index) => ({
        materialId: line.materialId,
        materialName: line.materialName,
        unit: line.unit,
        warehouseId: line.warehouseId,
        systemQty: line.systemQty,
        countedQty: line.countedQty.trim().length > 0 ? Number(line.countedQty) : null,
        varianceQty: line.varianceQty,
        unitCost: line.unitCost,
        sortOrder: index,
      })),
    };

    try {
      const saved = draft.sessionId
        ? await updateSession({ id: draft.sessionId, body }).unwrap()
        : await createSession(body).unwrap();
      setSelectedSessionId(saved.id);
      setDraft((current) => ({
        ...current,
        sessionId: saved.id,
        status: saved.status,
        currentRevision: saved.currentRevision,
        linkedAdjustmentReferenceNumber: saved.linkedAdjustmentReferenceNumber,
      }));
      toast.success(draft.sessionId ? 'Count session saved.' : 'Count session created.');
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save count session');
      return null;
    }
  }

  async function submitCountAdjustment() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return;
    }
    if (adjustmentLines.length === 0) {
      toast.error('Enter counted quantities that produce a variance first.');
      return;
    }
    if (!draft.evidenceReference.trim()) {
      toast.error('Enter the count sheet reference.');
      return;
    }
    if (maxNegativeVariance >= stockControlSettings.negativeEvidenceQtyThreshold && draft.evidenceNotes.trim().length < 12) {
      toast.error('Large negative variances require detailed evidence notes.');
      return;
    }
    let sessionId = draft.sessionId;
    if (!sessionId) {
      const saved = await saveSession();
      if (!saved?.id) return;
      sessionId = saved.id;
    }

    try {
      const response = await submitSession(sessionId).unwrap();
      setDraft((current) => ({
        ...current,
        sessionId: response.sessionId,
        status: response.status,
        linkedAdjustmentReferenceNumber: response.linkedAdjustmentReferenceNumber,
      }));

      toast.success(
        response.approvalStatus === 'APPROVED'
          ? 'Stock count adjustment posted.'
          : 'Stock count adjustment request submitted for approval.'
      );
      setSelectedSessionId(response.sessionId);
      return;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit stock count adjustment');
    }
  }

  if (!canAdjust) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock count session</h1>
        </header>
        <Alert>
          <AlertDescription>You do not have permission to create stock count adjustments.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stock control</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock count session</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Load a warehouse count sheet from live stock, enter counted quantities, review variances, then send only the variance lines into the
          controlled bulk adjustment workflow.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Warehouse</label>
            <select value={draft.warehouseId} onChange={(event) => setDraft((current) => ({ ...current, warehouseId: event.target.value }))} className={controlClass}>
              <option value="">Select warehouse</option>
              {activeWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Session title</label>
            <input
              type="text"
              value={draft.sessionTitle}
              onChange={(event) => setDraft((current) => ({ ...current, sessionTitle: event.target.value }))}
              placeholder="Main warehouse monthly count"
              className={controlClass}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={loadWarehouseSheet}>
            Load count sheet
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void saveSession()} disabled={isSaving}>
            {isSaving ? 'Saving…' : draft.sessionId ? 'Save session' : 'Create session'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetDraft}>
            Reset draft
          </Button>
          <Link href="/stock/manual-adjustments" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Manual adjustments
          </Link>
          <Link href="/reports/stock-count-sessions" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Count report
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Saved count sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reload a prior draft, follow its adjustment link, or continue a rejected recount.
            </p>
          </div>
          {draft.sessionId ? (
            <div className="text-xs text-muted-foreground">
              Revision {draft.currentRevision ?? 0}
              {draft.status ? ` | ${draft.status}` : ''}
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3">Updated</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Variance lines</th>
                <th className="px-3 py-3">Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {savedSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No saved count sessions yet.
                  </td>
                </tr>
              ) : (
                savedSessions.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-border odd:bg-card even:bg-muted/20 dark:even:bg-muted/10',
                      selectedSessionId === row.id && 'ring-1 ring-ring ring-inset',
                    )}
                    onClick={() => setSelectedSessionId(row.id)}
                  >
                    <td className="px-3 py-2.5 text-foreground">{new Date(row.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{row.title}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.warehouseName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.status}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.varianceLineCount ?? 0}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.linkedAdjustmentReferenceNumber || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Count lines</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{draft.lines.length}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">Variance lines</p>
              <p className="mt-2 text-xl font-semibold text-amber-950 dark:text-amber-50">{adjustmentLines.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Largest negative</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatQty(maxNegativeVariance)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Draft persistence</p>
              <p className="mt-2 text-sm font-medium text-foreground">Saved in browser</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Search material</label>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Material name..."
              className={controlClass}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showVarianceOnly}
                onChange={(event) => setShowVarianceOnly(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              Show variances only
            </label>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">
              Enter counted quantity. Variance is calculated as counted minus system quantity.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="min-w-[240px] px-3 py-3">Material</th>
                <th className="min-w-[120px] px-3 py-3 text-right">System qty</th>
                <th className="min-w-[140px] px-3 py-3">Counted qty</th>
                <th className="min-w-[120px] px-3 py-3 text-right">Variance</th>
                <th className="min-w-[120px] px-3 py-3 text-right">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {draft.lines.length === 0 ? 'Load a warehouse count sheet to begin.' : 'No lines match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredLines.map((line) => (
                  <tr
                    key={line.materialId}
                    className="border-b border-border odd:bg-card even:bg-muted/20 dark:even:bg-muted/10"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{line.materialName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{line.unit}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatQty(line.systemQty)}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.001"
                        value={line.countedQty}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            lines: current.lines.map((item) =>
                              item.materialId === line.materialId ? updateStockCountVariance(item, event.target.value) : item
                            ),
                          }))
                        }
                        placeholder="Enter counted qty"
                        className={controlClass}
                      />
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        line.varianceQty > 0.0005 && 'text-emerald-700 dark:text-emerald-300',
                        line.varianceQty < -0.0005 && 'text-destructive',
                        Math.abs(line.varianceQty) <= 0.0005 && 'text-muted-foreground',
                      )}
                    >
                      {formatQty(line.varianceQty)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatQty(line.unitCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSession?.revisions?.length ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Session history</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recount saves, submit events, and approval outcomes for the selected session.
              </p>
            </div>
            {selectedSession.linkedAdjustmentReferenceNumber ? (
              <div className="text-xs text-muted-foreground">Adjustment {selectedSession.linkedAdjustmentReferenceNumber}</div>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Revision</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">By</th>
                  <th className="px-3 py-3">At</th>
                </tr>
              </thead>
              <tbody>
                {selectedSession.revisions.map((revision) => (
                  <tr
                    key={revision.id}
                    className="border-b border-border odd:bg-card even:bg-muted/20 dark:even:bg-muted/10"
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">{revision.revisionNumber}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{revision.action}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{revision.savedByName || '-'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold text-foreground">Variance to adjustment request</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This submits only the variance lines into the existing manual adjustment approval flow with `Physical count` evidence.
          </p>
        </div>

        {maxNegativeVariance >= stockControlSettings.negativeEvidenceQtyThreshold ? (
          <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            Largest negative variance: {formatQty(maxNegativeVariance)}. Detailed evidence notes are required.
            {maxNegativeVariance >= stockControlSettings.negativeDecisionNoteQtyThreshold
              ? ' Approval will also require a decision note.'
              : ''}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Count sheet reference</label>
            <input
              type="text"
              value={draft.evidenceReference}
              onChange={(event) => setDraft((current) => ({ ...current, evidenceReference: event.target.value }))}
              placeholder="COUNT-APR-WH1"
              className={controlClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Session notes</label>
            <input
              type="text"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional approval note"
              className={controlClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-muted-foreground">Evidence notes</label>
          <textarea
            value={draft.evidenceNotes}
            onChange={(event) => setDraft((current) => ({ ...current, evidenceNotes: event.target.value }))}
            rows={4}
            placeholder="Who counted, when, and what variance sheet supports this count?"
            className={cn(controlClass, 'mt-1')}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" disabled={isLoading} onClick={() => void submitCountAdjustment()}>
            {isLoading ? 'Submitting…' : isSA ? 'Post count adjustment' : 'Submit count adjustment'}
          </Button>
        </div>
      </section>
    </div>
  );
}
