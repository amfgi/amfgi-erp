'use client';

import { Button } from '@/components/ui/shadcn/button';

interface Row {
  jobId: string;
  jobNumber: string;
  materialId: string;
  materialName: string;
  unit: string;
  dispatched: number;
  returned: number;
  netConsumed: number;
}

interface Props {
  rows: Row[];
  onExport?: () => void;
}

function buildPivot(rows: Row[]) {
  const jobMap = new Map<string, string>();
  const matMap = new Map<string, { name: string; unit: string }>();
  const cell = new Map<string, Map<string, Row>>();

  for (const r of rows) {
    jobMap.set(r.jobId, r.jobNumber);
    matMap.set(r.materialId, { name: r.materialName, unit: r.unit });
    if (!cell.has(r.jobId)) cell.set(r.jobId, new Map());
    cell.get(r.jobId)!.set(r.materialId, r);
  }

  return {
    jobs: Array.from(jobMap.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    materials: Array.from(matMap.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    cell,
  };
}

export default function JobConsumptionTable({ rows, onExport }: Props) {
  const { jobs, materials, cell } = buildPivot(rows);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card py-16 text-center text-sm text-muted-foreground">
        No data for the selected filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {onExport ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export CSV
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="sticky left-0 z-10 min-w-[120px] border-r border-border bg-muted/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  Job #
                </th>
                {materials.map(([id, m]) => (
                  <th key={id} className="min-w-[100px] px-3 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <div className="max-w-[120px] truncate">{m.name}</div>
                    <div className="mt-0.5 font-normal normal-case text-[10px] text-muted-foreground/90">{m.unit}</div>
                  </th>
                ))}
                <th className="bg-muted/50 px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total items
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(([jobId, jobNumber]) => {
                const jobCells = cell.get(jobId)!;
                const totalItems = materials.filter(([matId]) => jobCells.has(matId)).length;
                return (
                  <tr key={jobId} className="border-b border-border transition-colors hover:bg-muted/30">
                    <td className="sticky left-0 z-10 border-r border-border bg-background px-4 py-3 font-semibold text-primary backdrop-blur-sm">
                      {jobNumber}
                    </td>
                    {materials.map(([matId]) => {
                      const c = jobCells.get(matId);
                      return (
                        <td key={matId} className="px-3 py-3 text-center font-mono text-foreground">
                          {c ? (
                            <div>
                              <div className="font-semibold">{c.netConsumed.toFixed(2)}</div>
                              {c.returned > 0 ? (
                                <div className="text-xs text-sky-600 dark:text-sky-400">
                                  ({c.dispatched.toFixed(2)} − {c.returned.toFixed(2)})
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-medium text-muted-foreground">{totalItems}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td className="sticky left-0 z-10 border-r border-border bg-muted/40 px-4 py-3 font-semibold text-foreground backdrop-blur-sm">
                  Totals
                </td>
                {materials.map(([matId]) => {
                  const total = rows.filter((r) => r.materialId === matId).reduce((acc, r) => acc + r.netConsumed, 0);
                  return (
                    <td key={matId} className="px-3 py-3 text-center font-mono font-semibold text-foreground">
                      {total.toFixed(2)}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-semibold text-muted-foreground">{jobs.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
