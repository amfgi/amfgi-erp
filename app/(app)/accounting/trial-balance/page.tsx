'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Card, CardContent } from '@/components/ui/shadcn/card';
import { formatMoney } from '@/lib/accounting/rules';

type Row = {
  accountId: string;
  name: string;
  statementGroupName: string;
  typeName: string;
  debitFils: number;
  creditFils: number;
};

export default function TrialBalancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [debitFils, setDebitFils] = useState(0);
  const [creditFils, setCreditFils] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch('/api/accounting/trial-balance', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.error ?? 'Could not load the trial balance');
          return;
        }
        setRows(json.data?.rows ?? []);
        setDebitFils(json.data?.debitFils ?? 0);
        setCreditFils(json.data?.creditFils ?? 0);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Trial balance</h1>
        <p className="text-sm text-muted-foreground">
          Net debit or credit from saved journals. This includes income and expense. It is not a balance sheet.
        </p>
      </div>
      <Card>
        <CardContent className="overflow-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Debit</th>
                <th className="px-3 py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="px-3 py-4 text-muted-foreground" colSpan={4}>No saved journal amounts yet.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.accountId} className="border-b border-border/70">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.typeName} · {row.statementGroupName}</td>
                  <td className="px-3 py-2 text-right">{row.debitFils ? formatMoney(row.debitFils) : ''}</td>
                  <td className="px-3 py-2 text-right">{row.creditFils ? formatMoney(row.creditFils) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={2}>Totals</td>
                <td className="px-3 py-2 text-right">{formatMoney(debitFils)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(creditFils)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
