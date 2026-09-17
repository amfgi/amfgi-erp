'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrCompanySearchSelect, { useHrAccessibleCompanies } from '@/components/hr/HrCompanySearchSelect';
import { CatalogSearchSelect } from '@/components/hr/CatalogSearchSelect';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import {
  DEFAULT_EMPLOYEE_CODE_SETTINGS,
  EMPLOYEE_CODE_COUNTING_STYLE_OPTIONS,
  type EmployeeCodeCountingStyle,
  type EmployeeCodeSettings,
  previewEmployeeCodeExample,
} from '@/lib/hr/employeeCodeSettings';
import { resolveDefaultHrCompanyId, writeHrPreferredCompanyId } from '@/lib/hr/hrCompanyPreference';
import { readApiJson } from '@/lib/utils/readApiResponse';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

type ApiPayload = {
  settings: EmployeeCodeSettings;
  exampleCode: string;
  nextCodePreview: string;
};

export default function EmployeeCodeSettingsPage() {
  const { data: session } = useSession();
  const { options: companyOptions } = useHrAccessibleCompanies();
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<EmployeeCodeSettings>(DEFAULT_EMPLOYEE_CODE_SETTINGS);
  const [nextCodePreview, setNextCodePreview] = useState('');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view') || perms.includes('hr.employee.edit');
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const countingStyleOptions = useMemo(
    () =>
      EMPLOYEE_CODE_COUNTING_STYLE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        searchText: `${option.label} ${option.description}`,
      })),
    [],
  );

  const liveExample = useMemo(() => previewEmployeeCodeExample(settings), [settings]);
  const styleHint = EMPLOYEE_CODE_COUNTING_STYLE_OPTIONS.find(
    (option) => option.value === settings.countingStyle,
  )?.description;

  useEffect(() => {
    if (companyOptions.length === 0) return;
    setCompanyId((current) => {
      if (current && companyOptions.some((option) => option.id === current)) return current;
      return resolveDefaultHrCompanyId(
        companyOptions.map((option) => option.id),
        session?.user?.activeCompanyId,
      );
    });
  }, [companyOptions, session?.user?.activeCompanyId]);

  const load = async (targetCompanyId: string) => {
    if (!targetCompanyId || !canView) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hr/employee-code-settings?companyId=${encodeURIComponent(targetCompanyId)}`,
        { cache: 'no-store' },
      );
      const json = await readApiJson(res);
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Failed to load employee ID settings');
        return;
      }
      const payload = json.data as ApiPayload;
      setSettings(payload.settings);
      setNextCodePreview(payload.nextCodePreview);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    void load(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when company changes
  }, [companyId, canView]);

  const handleCompanyChange = (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    writeHrPreferredCompanyId(nextCompanyId || null);
  };

  const update = <K extends keyof EmployeeCodeSettings>(key: K, value: EmployeeCodeSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!canEdit || saving) return;
    if (!companyId) {
      toast.error('Select a company');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/hr/employee-code-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...settings }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Failed to save settings');
        return;
      }
      const payload = json.data as ApiPayload;
      setSettings(payload.settings);
      setNextCodePreview(payload.nextCodePreview);
      toast.success('Employee ID settings saved');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view employee ID settings.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee setup</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee ID format</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Set the company prefix and counting style used when creating new employees. Existing codes are not changed.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full max-w-xs">
            <HrCompanySearchSelect value={companyId} onChange={handleCompanyChange} required label="Company" />
          </div>
          {canEdit ? (
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !companyId || loading}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          ) : null}
        </div>
      </header>

      {loading && !nextCodePreview ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
          <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={labelClass}>Prefix</span>
                <Input
                  value={settings.prefix}
                  disabled={!canEdit}
                  maxLength={40}
                  onChange={(e) => update('prefix', e.target.value)}
                  placeholder="EMP#"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Letters, numbers, and symbols such as # @ &amp; + - _ / . ( ) are allowed.
                </p>
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Separator</span>
                <Input
                  value={settings.separator}
                  disabled={!canEdit}
                  maxLength={1}
                  onChange={(e) => update('separator', e.target.value)}
                  placeholder="-"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">Use -, _, /, . or leave blank.</p>
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Number padding</span>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.padLength}
                  disabled={!canEdit}
                  onChange={(e) => update('padLength', Number(e.target.value) || 1)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Start from</span>
                <Input
                  type="number"
                  min={1}
                  value={settings.startFrom}
                  disabled={!canEdit}
                  onChange={(e) => update('startFrom', Number(e.target.value) || 1)}
                />
                <p className="text-[11px] text-muted-foreground">Used when no matching codes exist yet.</p>
              </label>
            </div>

            <div className="space-y-1.5">
              <span className={labelClass}>Counting style</span>
              <CatalogSearchSelect
                value={settings.countingStyle}
                onChange={(next) => update('countingStyle', next as EmployeeCodeCountingStyle)}
                options={countingStyleOptions}
                disabled={!canEdit}
                placeholder="Select counting style…"
                allowLegacyValue={false}
                openOnFocus
              />
              {styleHint ? <p className="text-xs text-muted-foreground">{styleHint}</p> : null}
            </div>
          </div>

          <aside className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 shadow-sm">
            <div>
              <p className={labelClass}>Example (start from)</p>
              <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-foreground">{liveExample}</p>
            </div>
            <div>
              <p className={labelClass}>Next code for this company</p>
              <p className="mt-1 font-mono text-sm text-emerald-700 dark:text-emerald-300">
                {nextCodePreview || '—'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Next code is computed from existing employee IDs that match this format. Saving updates the rule for future creates only.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
