'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import Modal from '@/components/ui/Modal';
import { buildInitialColumnMapping } from '@/lib/import-export/columnMap';
import type { ImportFieldDef, ImportPreviewRow, InvalidImportRow, MappedImportRow } from '@/lib/import-export/types';
import { parseWorkbookBuffer } from '@/lib/import-export/xlsx';

type ExistingRecord = {
  id: string;
  name: string;
  source?: string;
};

type Props<T extends MappedImportRow> = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: ImportFieldDef[];
  previewLabelKey: string;
  /** Second preview table column (defaults to city). */
  previewColumn2Key?: string;
  previewColumn2Label?: string;
  duplicateNote?: string;
  onDownloadTemplate: () => void;
  mapRow: (
    row: (string | number | boolean | null)[],
    headers: string[],
    mapping: Record<number, string>,
    rowIndex: number
  ) => T;
  toPayload: (row: ImportPreviewRow<T>) => unknown;
  existingRecords: ExistingRecord[];
  existingRecordsLoading?: boolean;
  defaultDuplicateAction?: 'skip' | 'update';
  isSubmitting?: boolean;
  previewColumn1Label?: string;
  duplicateInFileLabel?: string;
  /** Label for existing-record match in duplicates tab (defaults to "name"). */
  duplicateMatchLabel?: string;
  /**
   * Unique key for in-file duplicate detection and matching existing records.
   * Defaults to previewLabelKey (trimmed, lowercased).
   */
  getRecordKey?: (row: T) => string;
  /** Custom in-file duplicate error message when getRecordKey collides. */
  formatDuplicateInFileError?: (row: T) => string;
  onSubmit: (
    payload: { newRows: unknown[]; updateRows: unknown[] },
    onProgress?: (processed: number, total: number) => void
  ) => Promise<void>;
  blockDuplicateUpdate?: (match: ExistingRecord) => string | null;
};

export default function EntityImportModal<T extends MappedImportRow>({
  isOpen,
  onClose,
  title,
  fields,
  previewLabelKey,
  previewColumn2Key = 'city',
  previewColumn2Label = 'City',
  duplicateNote,
  onDownloadTemplate,
  mapRow,
  toPayload,
  existingRecords,
  existingRecordsLoading = false,
  defaultDuplicateAction = 'skip',
  isSubmitting = false,
  previewColumn1Label = 'Name',
  duplicateInFileLabel = 'name',
  duplicateMatchLabel = 'name',
  getRecordKey,
  formatDuplicateInFileError,
  onSubmit,
  blockDuplicateUpdate,
}: Props<T>) {
  const recordKeyFor = (row: T) => {
    const key = getRecordKey?.(row) ?? String(row[previewLabelKey] ?? '').trim().toLowerCase();
    return key.trim().toLowerCase();
  };
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(
    null
  );
  const mappableFields = fields.filter((f) => f.key !== '__skip__');
  const [step, setStep] = useState(0);
  const [rawRows, setRawRows] = useState<(string | number | boolean | null)[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [autoMapped, setAutoMapped] = useState<Set<number>>(new Set());
  const [previewTab, setPreviewTab] = useState<'new' | 'duplicates' | 'invalid'>('new');
  const [allRows, setAllRows] = useState<ImportPreviewRow<T>[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidImportRow<T>[]>([]);

  const resetState = useCallback(() => {
    setStep(0);
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setAutoMapped(new Set());
    setAllRows([]);
    setInvalidRows([]);
    setPreviewTab('new');
    setImportProgress(null);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbookBuffer(buffer);
      const { mapping: nextMapping, autoMapped: nextAutoMapped } = buildInitialColumnMapping(
        parsed.headers,
        mappableFields
      );
      setHeaders(parsed.headers);
      setRawRows(parsed.dataRows);
      setMapping(nextMapping);
      setAutoMapped(nextAutoMapped);
      setStep(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to parse Excel file');
    } finally {
      event.target.value = '';
    }
  };

  const requiredKeys = mappableFields.filter((f) => f.required).map((f) => f.key);
  const mappedKeys = Object.values(mapping).filter((k) => k && k !== '__skip__');
  const canAdvanceFromMapping = requiredKeys.every((key) => mappedKeys.includes(key));

  const handlePreview = () => {
    if (existingRecordsLoading) {
      toast.error('Loading existing employees for duplicate matching. Please wait…');
      return;
    }

    const existingIdMap = new Map(existingRecords.map((r) => [r.id.trim(), r]));
    const existingNameMap = new Map(existingRecords.map((r) => [r.name.trim().toLowerCase(), r]));

    const parsedResults = rawRows.map((row, rowIndex) => {
      const parsed = mapRow(row, headers, mapping, rowIndex);
      return {
        parsed,
        sourceValues: headers.map((_, colIndex) => String(row[colIndex] ?? '').trim()),
      };
    });

    const validRows = parsedResults.filter((r) => r.parsed.__errors.length === 0).map((r) => r.parsed);
    const nameCounts = new Map<string, number>();
    const idCounts = new Map<string, number>();

    for (const row of validRows) {
      const key = recordKeyFor(row);
      if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
      const id = String(row.id ?? '').trim();
      if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    for (const result of parsedResults) {
      const key = recordKeyFor(result.parsed);
      const id = String(result.parsed.id ?? '').trim();
      if (!result.parsed.__errors.length && key && (nameCounts.get(key) ?? 0) > 1) {
        const detail = formatDuplicateInFileError?.(result.parsed) ?? key;
        result.parsed.__errors.push(`Duplicate ${duplicateInFileLabel} in file: ${detail}`);
      }
      if (!result.parsed.__errors.length && id && (idCounts.get(id) ?? 0) > 1) {
        result.parsed.__errors.push(`Duplicate ID in file: ${id}`);
      }
    }

    const nextInvalid: InvalidImportRow<T>[] = parsedResults
      .filter((r) => r.parsed.__errors.length > 0)
      .map((r) => ({ ...r.parsed, __sourceValues: r.sourceValues }));

    const previewRows: ImportPreviewRow<T>[] = parsedResults
      .filter((r) => r.parsed.__errors.length === 0)
      .map((r) => {
        const id = String(r.parsed.id ?? '').trim();
        const recordKey = recordKeyFor(r.parsed);
        const matchById = id ? existingIdMap.get(id) : undefined;
        const matchByName = recordKey ? existingNameMap.get(recordKey) : undefined;
        const match = matchById ?? matchByName;
        const blockReason = match && blockDuplicateUpdate ? blockDuplicateUpdate(match) : null;

        return {
          ...r.parsed,
          __isDuplicate: Boolean(match),
          __duplicateReason: matchById
            ? `Matches existing ID: ${matchById.id} (${matchById.name})`
            : matchByName
              ? `Matches existing ${duplicateMatchLabel}: ${matchByName.name}`
              : undefined,
          __action: match ? defaultDuplicateAction : 'skip',
          __blocked: Boolean(blockReason),
          __blockReason: blockReason ?? undefined,
        };
      });

    if (nextInvalid.length > 0) {
      toast.error(`${nextInvalid.length} row(s) failed validation`);
    }

    setAllRows(previewRows);
    setInvalidRows(nextInvalid);
    setPreviewTab(
      previewRows.some((r) => !r.__isDuplicate)
        ? 'new'
        : previewRows.some((r) => r.__isDuplicate)
          ? 'duplicates'
          : nextInvalid.length > 0
            ? 'invalid'
            : 'new'
    );
    setStep(2);
  };

  const newRows = allRows.filter((r) => !r.__isDuplicate);
  const duplicateRows = allRows.filter((r) => r.__isDuplicate);
  const selectedForUpdate = duplicateRows.filter((r) => r.__action === 'update' && !r.__blocked);
  const previewLabel = (row: ImportPreviewRow<T>) => String(row[previewLabelKey] ?? '—');

  const handleSubmit = async () => {
    if (newRows.length === 0 && selectedForUpdate.length === 0) {
      toast.error('No rows to import. Add new rows or select duplicates to update.');
      return;
    }
    const total = newRows.length + selectedForUpdate.length;
    setImportProgress({ processed: 0, total });
    try {
      await onSubmit(
        {
          newRows: newRows.map((r) => toPayload(r)),
          updateRows: selectedForUpdate.map((r) => toPayload(r)),
        },
        (processed, progressTotal) => setImportProgress({ processed, total: progressTotal })
      );
      resetState();
      onClose();
    } catch {
      setImportProgress(null);
    }
  };

  const isImporting = isSubmitting || importProgress !== null;

  const missingRequired = requiredKeys.filter((key) => !mappedKeys.includes(key));
  const missingLabels = mappableFields
    .filter((f) => missingRequired.includes(f.key))
    .map((f) => f.label)
    .join(', ');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="xl">
      <div className="space-y-4">
        {step === 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-foreground">Upload an Excel file (.xlsx).</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the template for column names. Blank rows are ignored.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={onDownloadTemplate}>
                Download template
              </Button>
            </div>
            <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="entity-import-file"
              />
              <label htmlFor="entity-import-file" className="block cursor-pointer">
                <p className="font-medium text-foreground">Click to upload</p>
                <p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx, .xls)</p>
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Map spreadsheet columns to system fields.</p>
              <Button type="button" variant="secondary" size="sm" onClick={onDownloadTemplate}>
                Download template
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">File column</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Map to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-4 py-2">
                        <div>{header}</div>
                        {autoMapped.has(idx) ? (
                          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Auto-matched</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[idx] || '__skip__'}
                          onChange={(e) => {
                            setMapping((prev) => ({ ...prev, [idx]: e.target.value }));
                            if (e.target.value !== '__skip__') {
                              setAutoMapped((prev) => new Set(prev).add(idx));
                            }
                          }}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                        >
                          {fields.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label}
                              {field.required ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!canAdvanceFromMapping && missingLabels ? (
              <AlertBox variant="error">Required fields not mapped: {missingLabels}</AlertBox>
            ) : null}

            <div className="flex gap-3 border-t border-border pt-2">
              <Button type="button" variant="ghost" onClick={resetState} className="flex-1">
                Back
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!canAdvanceFromMapping || existingRecordsLoading}
                className="flex-1"
              >
                {existingRecordsLoading ? 'Loading employees…' : 'Preview'}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-border">
              {(['new', 'duplicates', 'invalid'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPreviewTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize ${
                    previewTab === tab
                      ? 'border-b-2 border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab} (
                  {tab === 'new'
                    ? newRows.length
                    : tab === 'duplicates'
                      ? duplicateRows.length
                      : invalidRows.length}
                  )
                </button>
              ))}
            </div>

            {previewTab === 'new' ? (
              <PreviewTable
                rows={newRows}
                previewLabel={previewLabel}
                column1Label={previewColumn1Label}
                column2Key={previewColumn2Key}
                column2Label={previewColumn2Label}
                emptyMessage="No new rows"
              />
            ) : null}

            {previewTab === 'duplicates' ? (
              <div className="space-y-3">
                {duplicateNote ? <AlertBox variant="info">{duplicateNote}</AlertBox> : null}
                {duplicateRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No matching existing records</p>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAllRows((prev) =>
                          prev.map((row) =>
                            row.__isDuplicate && !row.__blocked ? { ...row, __action: 'update' } : row
                          )
                        );
                      }}
                    >
                      Select all updatable
                    </Button>
                    <div className="max-h-64 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-left">Match</th>
                            <th className="px-3 py-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicateRows.map((row) => (
                            <tr key={row.__rowIndex} className="border-t border-border">
                              <td className="px-3 py-2">{previewLabel(row)}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {row.__blockReason ?? row.__duplicateReason ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {row.__blocked ? (
                                  <span className="text-xs text-amber-600">Skipped</span>
                                ) : (
                                  <div className="flex justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAllRows((prev) =>
                                          prev.map((entry) =>
                                            entry.__rowIndex === row.__rowIndex
                                              ? { ...entry, __action: 'update' }
                                              : entry
                                          )
                                        )
                                      }
                                      className={`rounded px-3 py-1 text-xs font-medium ${
                                        row.__action === 'update'
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      Update
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAllRows((prev) =>
                                          prev.map((entry) =>
                                            entry.__rowIndex === row.__rowIndex
                                              ? { ...entry, __action: 'skip' }
                                              : entry
                                          )
                                        )
                                      }
                                      className={`rounded px-3 py-1 text-xs font-medium ${
                                        row.__action === 'skip'
                                          ? 'bg-muted-foreground/20 text-foreground'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      Skip
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {previewTab === 'invalid' ? (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-3 text-sm">
                {invalidRows.length === 0 ? (
                  <p className="py-6 text-center text-muted-foreground">No invalid rows</p>
                ) : (
                  <ul className="space-y-3">
                    {invalidRows.map((row) => {
                      const recordLabel = String(row[previewLabelKey] ?? '').trim();
                      return (
                        <li key={row.__rowIndex} className="rounded-md border border-border bg-muted/20 p-3">
                          <p className="font-medium">
                            Sheet row {row.__rowIndex + 2}
                            {recordLabel ? (
                              <span className="font-normal text-muted-foreground"> — {recordLabel}</span>
                            ) : null}
                          </p>
                          <ul className="mt-1 list-disc pl-5 text-destructive">
                            {row.__errors.map((err) => (
                              <li key={err}>{err}</li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
              Ready: <strong className="text-foreground">{newRows.length}</strong> new +{' '}
              <strong className="text-foreground">{selectedForUpdate.length}</strong> updates
            </div>

            {importProgress ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Processing import…</span>
                  <span className="tabular-nums text-muted-foreground">
                    {importProgress.processed} / {importProgress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${importProgress.total > 0 ? Math.round((importProgress.processed / importProgress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex gap-3 border-t border-border pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} className="flex-1" disabled={isImporting}>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isImporting || (newRows.length === 0 && selectedForUpdate.length === 0)}
                className="flex-1"
              >
                {isImporting
                  ? importProgress
                    ? `Processing ${importProgress.processed}/${importProgress.total}…`
                    : 'Importing…'
                  : `Import ${newRows.length + selectedForUpdate.length} row(s)`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}


function AlertBox({ variant, children }: { variant: 'info' | 'error'; children: React.ReactNode }) {
  const styles =
    variant === 'error'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-border bg-muted/30 text-muted-foreground';
  return <div className={`rounded-lg border p-3 text-sm ${styles}`}>{children}</div>;
}

function PreviewTable<T extends MappedImportRow>({
  rows,
  previewLabel,
  column1Label,
  column2Key,
  column2Label,
  emptyMessage,
}: {
  rows: ImportPreviewRow<T>[];
  previewLabel: (row: ImportPreviewRow<T>) => string;
  column1Label: string;
  column2Key: string;
  column2Label: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="max-h-64 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">{column1Label}</th>
            <th className="px-3 py-2 text-left">{column2Label}</th>
            <th className="px-3 py-2 text-left">Email</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.__rowIndex} className="border-t border-border">
              <td className="px-3 py-2">{previewLabel(row)}</td>
              <td className="px-3 py-2 text-muted-foreground">{String(row[column2Key] ?? '—')}</td>
              <td className="px-3 py-2 text-muted-foreground">{String(row.email ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
