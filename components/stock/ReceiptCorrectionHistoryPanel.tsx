'use client';

import { Badge } from '@/components/ui/Badge';
import { useGetReceiptCorrectionHistoryQuery } from '@/store/hooks';

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusVariant(status: string) {
  if (status === 'APPROVED') return 'green' as const;
  if (status === 'REJECTED') return 'red' as const;
  return 'yellow' as const;
}

export function ReceiptCorrectionHistoryPanel({ receiptNumber }: { receiptNumber: string }) {
  const { data, isFetching } = useGetReceiptCorrectionHistoryQuery(receiptNumber);

  const rows = data?.rows ?? [];

  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-slate-900 dark:text-white">Correction history</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Requests and approvals for quantity / unit-cost changes on this bill.
      </p>

      {isFetching && rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading correction history…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No correction requests yet.</p>
      ) : (
        <div className="mt-3 space-y-3 max-h-[16rem] overflow-y-auto">
          {rows.map((row) => {
            const payload = (row.payload ?? {}) as {
              lines?: Array<{
                materialName?: string;
                unit?: string;
                before?: { quantityReceived?: number; unitCost?: number };
                after?: { quantityReceived?: number; unitCost?: number };
                stockDelta?: number;
              }>;
            };
            const lines = payload.lines ?? [];

            return (
              <div
                key={row.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge label={row.status} variant={statusVariant(row.status)} />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Requested {formatDateTime(row.createdAt)}
                        {row.createdByName ? ` by ${row.createdByName}` : ''}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{row.reason}</p>
                    {row.decidedAt ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {row.status === 'APPROVED' ? 'Approved' : 'Decided'} {formatDateTime(row.decidedAt)}
                        {row.decidedByName ? ` by ${row.decidedByName}` : ''}
                        {row.decisionNote ? ` · ${row.decisionNote}` : ''}
                      </p>
                    ) : null}
                  </div>
                </div>

                {lines.length > 0 ? (
                  <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {lines.map((line, index) => (
                      <p
                        key={`${row.id}-${line.materialName ?? index}`}
                        className="text-xs text-slate-600 dark:text-slate-300"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {line.materialName ?? 'Material'}
                        </span>
                        {': '}
                        {(line.before?.quantityReceived ?? 0).toFixed(3)} @{' '}
                        {(line.before?.unitCost ?? 0).toFixed(4)} →{' '}
                        {(line.after?.quantityReceived ?? 0).toFixed(3)} @{' '}
                        {(line.after?.unitCost ?? 0).toFixed(4)}
                        {line.unit ? ` ${line.unit}` : ''}
                        {typeof line.stockDelta === 'number'
                          ? ` · stock ${line.stockDelta >= 0 ? '+' : ''}${line.stockDelta.toFixed(3)}`
                          : ''}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
