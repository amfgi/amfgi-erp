'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { canAccessSettingsSerial } from '@/lib/auth/settingsAccess';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import {
  DEFAULT_DOCUMENT_SERIAL_PREFIXES,
  DOCUMENT_SERIAL_CONTROLS,
  nextSerialFromHighest,
  normalizeDocumentPrefix,
  normalizeDocumentSerial,
  type DocumentSerialKey,
  type DocumentSerialPrefixes,
} from '@/lib/sales/documentSerialSettings';
import { formatDocumentNumber, salesYearCode } from '@/lib/sales/format';
import { readApiJson } from '@/lib/utils/readApiResponse';

type SerialItem = {
  kind: 'QR' | 'Q' | 'PO' | 'J';
  key: DocumentSerialKey;
  label: string;
  prefix: string;
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
  const isSuperAdmin = Boolean(session?.user?.isSuperAdmin);
  const canManage = canAccessSettingsSerial({
    isSuperAdmin,
    permissions: perms,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(salesYearCode());
  const [items, setItems] = useState<SerialItem[]>([]);
  const [draft, setDraft] = useState<Record<DocumentSerialKey, string>>(emptyDraft);
  const [prefixes, setPrefixes] = useState<DocumentSerialPrefixes>({ ...DEFAULT_DOCUMENT_SERIAL_PREFIXES });

  const applyView = useCallback((view: SerialView) => {
    setYear(view.year);
    setItems(view.items);
    setDraft((current) => {
      const next = { ...current };
      for (const item of view.items) next[item.key] = String(item.startFrom);
      return next;
    });
    setPrefixes((current) => {
      const next = { ...current };
      for (const item of view.items) next[item.key] = item.prefix;
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
    const prefixPayload = { ...prefixes };
    for (const control of DOCUMENT_SERIAL_CONTROLS) {
      const parsed = normalizeDocumentSerial(draft[control.key], 0);
      if (parsed < 1) {
        toast.error(`Enter a whole number for ${control.label}`);
        return;
      }
      payload[control.key] = parsed;
      const prefix = normalizeDocumentPrefix(prefixes[control.key], '');
      if (!prefix) {
        toast.error(`Enter a starting tag of letters or digits for ${control.label}`);
        return;
      }
      prefixPayload[control.key] = prefix;
    }
    if (new Set(Object.values(prefixPayload)).size !== DOCUMENT_SERIAL_CONTROLS.length) {
      toast.error('Each starting tag must be different');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/serial-number', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, prefixes: prefixPayload }),
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
          Choose the starting tag and the serial for Queries, Quotations, Purchase Orders, and Jobs.
          A new number looks like {prefixes.job}{year}-1234. When the year changes, new numbers use the new year
          and start again from the serial you set. Numbers already issued keep their tag and year.
          {isSuperAdmin ? '' : ' Only a super admin can change the starting tags.'}
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
              const prefix = normalizeDocumentPrefix(prefixes[control.key], control.kind);
              const typed = normalizeDocumentSerial(draft[control.key], 0);
              const example = typed >= 1 ? formatDocumentNumber(prefix, year, typed) : `${prefix}${year}-`;
              const nextSerial = typed >= 1 ? nextSerialFromHighest(item?.latestSerial ?? 0, typed) : null;
              const nextNumber = nextSerial ? formatDocumentNumber(prefix, year, nextSerial) : null;
              return (
                <div key={control.key} className="grid gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:items-start">
                  <label htmlFor={`serial-${control.key}`} className="pt-2 text-sm font-medium text-foreground">
                    {control.label}
                  </label>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id={`prefix-${control.key}`}
                        aria-label={`${control.label} starting tag`}
                        autoComplete="off"
                        value={prefixes[control.key]}
                        disabled={!isSuperAdmin}
                        onChange={(event) => {
                          const next = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                          setPrefixes((current) => ({ ...current, [control.key]: next }));
                        }}
                        className="w-20 font-mono uppercase"
                      />
                      <span className="font-mono text-sm text-muted-foreground">{year}-</span>
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
