'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { canAccessSettingsSerial } from '@/lib/auth/settingsAccess';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import {
  DOCUMENT_SERIAL_CONTROLS,
  nextSerialFromHighest,
  normalizeDocumentSerial,
  type DocumentSerialKey,
} from '@/lib/sales/documentSerialSettings';
import { formatDocumentNumber, salesYearCode } from '@/lib/sales/format';
import { readApiJson } from '@/lib/utils/readApiResponse';

type SerialItem = {
  kind: 'QR' | 'Q' | 'PO' | 'J';
  key: DocumentSerialKey;
  label: string;
  startFrom: number;
  latestSerial: number | null;
  latestNumber: string | null;
  nextNumber: string;
};

type SerialView = {
  year: string;
  items: SerialItem[];
};

const emptyDraft = (): Record<DocumentSerialKey, string> => ({
  query: '1',
  quotation: '1',
  purchaseOrder: '1',
  job: '1',
});

export default function SettingsSerialNumberPage() {
  const { data: session, status } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = canAccessSettingsSerial({
    isSuperAdmin: Boolean(session?.user?.isSuperAdmin),
    permissions: perms,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(salesYearCode());
  const [items, setItems] = useState<SerialItem[]>([]);
  const [draft, setDraft] = useState<Record<DocumentSerialKey, string>>(emptyDraft);

  const applyView = useCallback((view: SerialView) => {
    setYear(view.year);
    setItems(view.items);
    setDraft((current) => {
      const next = { ...current };
      for (const item of view.items) next[item.key] = String(item.startFrom);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/serial-number', { cache: 'no-store' });
      const json = await readApiJson<SerialView>(res);
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Failed to load serial numbers');
        return;
      }
      applyView(json.data);
    } finally {
      setLoading(false);
    }
  }, [applyView]);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    void load();
  }, [status, canManage, load]);

  const save = async () => {
    const payload: Record<DocumentSerialKey, number> = {
      query: 0,
      quotation: 0,
      purchaseOrder: 0,
      job: 0,
    };
    for (const control of DOCUMENT_SERIAL_CONTROLS) {
      const parsed = normalizeDocumentSerial(draft[control.key], 0);
      if (parsed < 1) {
        toast.error(`Enter a whole number for ${control.label}`);
        return;
      }
      payload[control.key] = parsed;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/serial-number', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await readApiJson<SerialView>(res);
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Failed to save serial numbers');
        return;
      }
      applyView(json.data);
      toast.success('Serial numbers saved');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Serial Number</CardTitle>
          <CardDescription>You do not have permission to change serial numbers.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Serial Number</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Choose the serial where Queries, Quotations, Purchase Orders, and Jobs start. Enter the number only.
          The prefix and year stay automatic, for example J{year}-1234. When the year changes, new numbers use the
          new year and the serial starts again from the number you set. Numbers already issued keep their year.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Starting serial</CardTitle>
          <CardDescription>
            Existing numbers stay as they are. If this year already has a higher serial, the next number continues after that.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            DOCUMENT_SERIAL_CONTROLS.map((control) => {
              const item = items.find((row) => row.key === control.key);
              const typed = normalizeDocumentSerial(draft[control.key], 0);
              const example = typed >= 1 ? formatDocumentNumber(control.kind, year, typed) : `${control.kind}${year}-`;
              const nextSerial = typed >= 1 ? nextSerialFromHighest(item?.latestSerial ?? 0, typed) : null;
              const nextNumber = nextSerial ? formatDocumentNumber(control.kind, year, nextSerial) : null;
              return (
                <div key={control.key} className="grid gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:items-start">
                  <label htmlFor={`serial-${control.key}`} className="pt-2 text-sm font-medium text-foreground">
                    {control.label}
                  </label>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">{control.kind}{year}-</span>
                      <Input
                        id={`serial-${control.key}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={draft[control.key]}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
                          setDraft((current) => ({ ...current, [control.key]: digits }));
                        }}
                        className="w-36 font-mono"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Example {example}
                      {item?.latestNumber ? ` · Latest this year ${item.latestNumber}` : ''}
                      {nextNumber && nextNumber !== example ? ` · Next number ${nextNumber}` : ''}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          <div>
            <Button type="button" onClick={() => void save()} disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
