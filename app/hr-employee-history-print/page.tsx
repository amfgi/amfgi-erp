'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { EmployeeHistoryReportView } from '@/components/hr/EmployeeHistoryReportView';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';

export default function EmployeeHistoryPrintPage() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId')?.trim() ?? '';
  const employeeId = searchParams.get('employeeId')?.trim() ?? '';
  const from = searchParams.get('from')?.trim() ?? '';
  const to = searchParams.get('to')?.trim() ?? '';
  const [report, setReport] = useState<EmployeeHistoryReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!companyId || !employeeId) return;
    const params = new URLSearchParams({ companyId });
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
    }
    let cancelled = false;
    fetch(`/api/hr/employees/${employeeId}/history?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not load the history');
        if (!cancelled) setReport(json.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the history');
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId, from, to]);

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const hadLight = root.classList.contains('light');
    root.classList.remove('dark');
    root.classList.add('light');
    return () => {
      root.classList.toggle('dark', hadDark);
      root.classList.toggle('light', hadLight);
    };
  }, []);

  return (
    <main className="history-print min-h-screen bg-white p-3 text-slate-900 print:p-0">
      <style>{`
        @page { margin: 8mm; }
        html, body, .history-print { background: #ffffff !important; color: #0f172a !important; color-scheme: light !important; }
      `}</style>
      {error ? <p className="text-sm">{error}</p> : null}
      {!report && !error ? <p className="text-sm">Loading history...</p> : null}
      {report ? <EmployeeHistoryReportView report={report} mode="print" /> : null}
    </main>
  );
}
