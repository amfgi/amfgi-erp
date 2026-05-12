'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { WORKFORCE_EMPLOYEE_TYPE_OPTIONS, type WorkforceEmployeeType } from '@/lib/hr/workforceProfile';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useGetHrEmployeeTypeSettingsQuery } from '@/store/api/endpoints/hr';

type SettingsMap = Record<
  WorkforceEmployeeType,
  { basicHoursPerDay: number; dutyStart: string; dutyEnd: string; breakStart: string; breakEnd: string }
>;

const cellInputClass = cn(
  'h-8 rounded-md border-border bg-background text-xs font-mono tabular-nums',
  'focus-visible:ring-2 focus-visible:ring-ring',
);

export default function EmployeeTypeSettingsPage() {
  const [overrides, setOverrides] = useState<Partial<SettingsMap>>({});
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useGetHrEmployeeTypeSettingsQuery();

  const settings = useMemo<SettingsMap | null>(() => {
    if (!data) return null;
    const next = { ...data };
    for (const type of WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((opt) => opt.value)) {
      if (overrides[type]) {
        next[type] = {
          ...next[type],
          ...overrides[type],
        };
      }
    }
    return next;
  }, [data, overrides]);

  const update = (type: WorkforceEmployeeType, key: keyof SettingsMap[WorkforceEmployeeType], value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: key === 'basicHoursPerDay' ? Number(value) : value,
      },
    }));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const res = await fetch('/api/hr/employee-type-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save settings');
      return;
    }
    toast.success('Employee-type timing settings saved');
    setOverrides({});
    await refetch();
  };

  if (isLoading && !data) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-7 w-72 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <header className="border-b border-border pb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee type timing</h1>
        </header>
        <p className="text-sm text-muted-foreground">Unable to load settings.</p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee type timing</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Define default basic hours and duty/break timings by employee type. Attendance will consume these defaults.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Employee type</th>
                <th className="px-4 py-3">Basic h/day</th>
                <th className="px-4 py-3">Duty in</th>
                <th className="px-4 py-3">Duty out</th>
                <th className="px-4 py-3">Break out</th>
                <th className="px-4 py-3">Break in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((opt) => {
                const row = settings[opt.value];
                return (
                  <tr key={opt.value} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 align-middle text-foreground">
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.value}</div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        max={24}
                        value={row.basicHoursPerDay}
                        onChange={(e) => update(opt.value, 'basicHoursPerDay', e.target.value)}
                        className={cn(cellInputClass, 'w-28')}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="time"
                        value={row.dutyStart}
                        onChange={(e) => update(opt.value, 'dutyStart', e.target.value)}
                        className={cn(cellInputClass, 'w-30')}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="time"
                        value={row.dutyEnd}
                        onChange={(e) => update(opt.value, 'dutyEnd', e.target.value)}
                        className={cn(cellInputClass, 'w-30')}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="time"
                        value={row.breakStart}
                        onChange={(e) => update(opt.value, 'breakStart', e.target.value)}
                        className={cn(cellInputClass, 'w-30')}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="time"
                        value={row.breakEnd}
                        onChange={(e) => update(opt.value, 'breakEnd', e.target.value)}
                        className={cn(cellInputClass, 'w-30')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
