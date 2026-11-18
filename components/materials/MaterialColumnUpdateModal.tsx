'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/shadcn/button';
import Modal from '@/components/ui/Modal';
import type { ClassifiedMaterialRow, MaterialColumnClassification } from '@/lib/import-export/materialColumnUpdate';
import {
  useApplyMaterialColumnUpdateMutation,
  usePreviewMaterialColumnUpdateMutation,
} from '@/store/hooks';

const APPLY_CHUNK = 50;

type Preview = MaterialColumnClassification & {
  summary: { update: number; unchanged: number; skipped: number };
};

type ApplyNote = { rowNumber: number; reason: string };

type Step = 'upload' | 'review' | 'result';
type ReviewTab = 'update' | 'unchanged' | 'skipped';

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function errorMessage(err: unknown) {
  if (typeof err === 'object' && err !== null && 'data' in err) {
    const data = (err as { data?: { error?: unknown } }).data;
    if (typeof data?.error === 'string') return data.error;
  }
  return 'Could not update materials';
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const name = (value as { name?: string | null }).name;
    return name?.trim() ? name : '—';
  }
  return String(value);
}

function stockIgnored(columns: string[]) {
  return columns.some((column) => {
    const key = column.trim().toLowerCase();
    return key === 'opening stock' || key === 'total quantity';
  });
}

export default function MaterialColumnUpdateModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [previewUpdate, { isLoading: isPreviewing }] = usePreviewMaterialColumnUpdateMutation();
  const [applyUpdate, { isLoading: isApplying }] = useApplyMaterialColumnUpdateMutation();
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<ReviewTab>('update');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number; notes: ApplyNote[] } | null>(null);

  const busy = isPreviewing || isApplying;

  const reset = useCallback(() => {
    setStep('upload');
    setPreview(null);
    setTab('update');
    setProgress(null);
    setResult(null);
  }, []);

  const requestClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        toast.error('The file has no sheet');
        return;
      }
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
      const rows = matrix.map((row) => (Array.isArray(row) ? row.map((cell) => normalizeCell(cell)) : []));
      if (rows.length === 0) {
        toast.error('The file has no header row');
        return;
      }

      const next = await previewUpdate({ rows }).unwrap();
      if (!next.ok) {
        toast.error(next.fileError || 'This file cannot be used');
        return;
      }
      setPreview(next);
      setTab(next.summary.update > 0 ? 'update' : next.summary.skipped > 0 ? 'skipped' : 'unchanged');
      setStep('review');
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    }
  };

  const handleApply = async () => {
    if (!preview || busy) return;
    const pending = preview.rows.filter(
      (row): row is ClassifiedMaterialRow & { materialId: string; itemName: string } =>
        row.status === 'update' && Boolean(row.materialId) && Boolean(row.itemName)
    );
    if (pending.length === 0) return;

    let updated = 0;
    let skipped = 0;
    const notes: ApplyNote[] = [];
    setProgress({ done: 0, total: pending.length });

    try {
      for (let index = 0; index < pending.length; index += APPLY_CHUNK) {
        const chunk = pending.slice(index, index + APPLY_CHUNK);
        const response = await applyUpdate({
          rows: chunk.map((row) => ({
            rowNumber: row.rowNumber,
            materialId: row.materialId,
            itemName: row.itemName,
            changes: row.changes,
          })),
        }).unwrap();
        updated += response.updated;
        skipped += response.skipped;
        for (const row of response.results) {
          if (row.reason) notes.push({ rowNumber: row.rowNumber, reason: row.reason });
        }
        setProgress({ done: Math.min(index + chunk.length, pending.length), total: pending.length });
      }
      setResult({ updated, skipped, notes });
      setStep('result');
      toast.success(`Updated ${updated} material${updated === 1 ? '' : 's'}`);
    } catch (err: unknown) {
      setProgress(null);
      toast.error(
        updated > 0
          ? `${errorMessage(err)} ${updated} material${updated === 1 ? '' : 's'} were already updated.`
          : errorMessage(err)
      );
    }
  };

  const updateRows = preview?.rows.filter((row) => row.status === 'update') ?? [];
  const unchangedRows = preview?.rows.filter((row) => row.status === 'unchanged') ?? [];
  const skippedRows = preview?.rows.filter((row) => row.status === 'skipped') ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title="Update from Excel"
      description="Keep Material ID and Item Name. Only columns left in the file can change, and only when both match."
      size="xl"
    >
      {step === 'upload' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export materials, then delete every column you do not want to change. A blank cell or a blank column is
            left as it is. Opening stock is never changed.
          </p>
          <label className="block cursor-pointer rounded-lg border border-dashed border-border px-6 py-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleFile(file);
              }}
            />
            <p className="font-medium text-foreground">{isPreviewing ? 'Reading file…' : 'Choose the exported file'}</p>
            <p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx, .xls)</p>
          </label>
        </div>
      ) : null}

      {step === 'review' && preview ? (
        <div className="space-y-4">
          {stockIgnored(preview.ignoredColumns) ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              Opening stock was ignored. On-hand stock was not changed.
            </p>
          ) : null}
          {preview.unknownColumns.length > 0 ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              These columns were not recognized and were not written: {preview.unknownColumns.join(', ')}.
            </p>
          ) : null}

          <div className="flex gap-2 border-b border-border">
            {(
              [
                ['update', `Will update (${updateRows.length})`],
                ['unchanged', `Unchanged (${unchangedRows.length})`],
                ['skipped', `Skipped (${skippedRows.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-sm font-medium ${
                  tab === key ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-auto rounded-md border border-border">
            {tab === 'update' ? (
              updateRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">No changes to apply.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {updateRows.map((row) => (
                      <tr key={row.rowNumber} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.itemName}</td>
                        <td className="px-3 py-2">
                          {row.changes.map((change) => (
                            <div key={change.field}>
                              {change.label}: {formatValue(change.from)} → {formatValue(change.to)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {tab === 'unchanged' ? (
              unchangedRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">No unchanged rows.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unchangedRows.map((row) => (
                      <tr key={row.rowNumber} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.itemName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}

            {tab === 'skipped' ? (
              skippedRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">No skipped rows.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skippedRows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.materialId ?? 'blank'}`} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.itemName || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>

          {progress ? (
            <p className="text-sm text-muted-foreground">
              Updating {progress.done} / {progress.total}…
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" disabled={busy} onClick={reset}>
              Back
            </Button>
            <Button type="button" className="flex-1" disabled={busy || updateRows.length === 0} onClick={handleApply}>
              {isApplying ? 'Updating…' : `Apply ${updateRows.length} change${updateRows.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'result' && result ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Updated {result.updated}. Skipped {result.skipped}.
          </p>
          {result.notes.length > 0 ? (
            <ul className="max-h-64 space-y-1 overflow-auto text-sm text-muted-foreground">
              {result.notes.map((note) => (
                <li key={`${note.rowNumber}-${note.reason}`}>
                  Row {note.rowNumber}: {note.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Every reviewed change was saved.</p>
          )}
          <Button type="button" onClick={requestClose}>
            Close
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}
