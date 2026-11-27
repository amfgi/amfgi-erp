'use client';

import { useCallback, useEffect, useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';

type AdvanceRow = { id: string; date: string; amount: number; note: string | null };
type WarningRow = { id: string; date: string; note: string };

type Draft = { id: string | null; date: string; amount: string; note: string };

const emptyDraft: Draft = { id: null, date: '', amount: '', note: '' };

const fieldClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30';

export function EmployeeRecords({
  employeeId,
  canEditWarnings,
  canPayroll,
}: {
  employeeId: string;
  canEditWarnings: boolean;
  canPayroll: boolean;
}) {
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [error, setError] = useState('');
  const [warningDraft, setWarningDraft] = useState<Draft | null>(null);
  const [advanceDraft, setAdvanceDraft] = useState<Draft | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ kind: 'warning' | 'advance'; row: WarningRow | AdvanceRow } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadWarnings = useCallback(async () => {
    const res = await fetch(`/api/hr/employees/${employeeId}/warnings`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Could not load warnings');
    setWarnings(json.data.warnings ?? []);
  }, [employeeId]);

  const loadAdvances = useCallback(async () => {
    const res = await fetch(`/api/hr/employees/${employeeId}/advances`, { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Could not load advances');
    setAdvances(json.data.advances ?? []);
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    Promise.all([loadWarnings(), canPayroll ? loadAdvances() : Promise.resolve()])
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load records');
      });
    return () => {
      cancelled = true;
    };
  }, [canPayroll, loadAdvances, loadWarnings]);

  async function saveWarning() {
    if (!warningDraft) return;
    setSaving(true);
    setError('');
    try {
      const url = warningDraft.id
        ? `/api/hr/employees/${employeeId}/warnings/${warningDraft.id}`
        : `/api/hr/employees/${employeeId}/warnings`;
      const res = await fetch(url, {
        method: warningDraft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: warningDraft.date, note: warningDraft.note }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not save the warning');
      setWarningDraft(null);
      await loadWarnings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the warning');
    } finally {
      setSaving(false);
    }
  }

  async function saveAdvance() {
    if (!advanceDraft) return;
    setSaving(true);
    setError('');
    try {
      const url = advanceDraft.id
        ? `/api/hr/employees/${employeeId}/advances/${advanceDraft.id}`
        : `/api/hr/employees/${employeeId}/advances`;
      const res = await fetch(url, {
        method: advanceDraft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: advanceDraft.date, amount: advanceDraft.amount, note: advanceDraft.note }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not save the advance');
      setAdvanceDraft(null);
      await loadAdvances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the advance');
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setSaving(true);
    setError('');
    try {
      const url =
        removeTarget.kind === 'warning'
          ? `/api/hr/employees/${employeeId}/warnings/${removeTarget.row.id}`
          : `/api/hr/employees/${employeeId}/advances/${removeTarget.row.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not delete the record');
      setRemoveTarget(null);
      if (removeTarget.kind === 'warning') await loadWarnings();
      else await loadAdvances();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the record');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Warnings</h2>
            <p className="text-sm text-slate-400">Disciplinary notes kept on this employee. These are separate from HR notes.</p>
          </div>
          {canEditWarnings ? (
            <Button type="button" onClick={() => setWarningDraft(emptyDraft)}>
              Add warning
            </Button>
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Note</th>
                {canEditWarnings ? <th className="px-3 py-2">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {warnings.length === 0 ? (
                <tr>
                  <td colSpan={canEditWarnings ? 3 : 2} className="px-3 py-6 text-slate-500">
                    No warnings recorded.
                  </td>
                </tr>
              ) : (
                warnings.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-3 py-3 text-slate-200">{row.date}</td>
                    <td className="px-3 py-3 text-slate-300">{row.note}</td>
                    {canEditWarnings ? (
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" onClick={() => setWarningDraft({ id: row.id, date: row.date, amount: '', note: row.note })}>
                            Edit
                          </Button>
                          <Button type="button" variant="destructive" onClick={() => setRemoveTarget({ kind: 'warning', row })}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canPayroll ? (
        <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Advances</h2>
              <p className="text-sm text-slate-400">Advances given. This is not a remaining balance and it does not change pay.</p>
            </div>
            <Button type="button" onClick={() => setAdvanceDraft(emptyDraft)}>
              Add advance
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-slate-500">
                      No advances recorded.
                    </td>
                  </tr>
                ) : (
                  advances.map((row) => (
                    <tr key={row.id} className="border-t border-white/5">
                      <td className="px-3 py-3 text-slate-200">{row.date}</td>
                      <td className="px-3 py-3 text-slate-200">{row.amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-slate-300">{row.note || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setAdvanceDraft({ id: row.id, date: row.date, amount: row.amount.toFixed(2), note: row.note ?? '' })
                            }
                          >
                            Edit
                          </Button>
                          <Button type="button" variant="destructive" onClick={() => setRemoveTarget({ kind: 'advance', row })}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Modal
        isOpen={warningDraft !== null}
        onClose={() => setWarningDraft(null)}
        title={warningDraft?.id ? 'Edit warning' : 'Add warning'}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setWarningDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveWarning()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
          Date
          <input className={fieldClass} type="date" value={warningDraft?.date ?? ''} onChange={(event) => setWarningDraft((current) => current && { ...current, date: event.target.value })} />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Note
          <textarea className={fieldClass} rows={4} value={warningDraft?.note ?? ''} onChange={(event) => setWarningDraft((current) => current && { ...current, note: event.target.value })} />
        </label>
      </Modal>

      <Modal
        isOpen={advanceDraft !== null}
        onClose={() => setAdvanceDraft(null)}
        title={advanceDraft?.id ? 'Edit advance' : 'Add advance'}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setAdvanceDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveAdvance()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
          Date
          <input className={fieldClass} type="date" value={advanceDraft?.date ?? ''} onChange={(event) => setAdvanceDraft((current) => current && { ...current, date: event.target.value })} />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Amount
          <input className={fieldClass} inputMode="decimal" value={advanceDraft?.amount ?? ''} onChange={(event) => setAdvanceDraft((current) => current && { ...current, amount: event.target.value })} />
        </label>
        <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Note
          <textarea className={fieldClass} rows={3} value={advanceDraft?.note ?? ''} onChange={(event) => setAdvanceDraft((current) => current && { ...current, note: event.target.value })} />
        </label>
      </Modal>

      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={removeTarget?.kind === 'advance' ? 'Delete advance' : 'Delete warning'}
        description="This removes the record from the employee history."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setRemoveTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRemove()} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">Delete this {removeTarget?.kind === 'advance' ? 'advance' : 'warning'}?</p>
      </Modal>
    </div>
  );
}
