'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useSyncCustomersFromPartyApiMutation, useSyncSuppliersFromPartyApiMutation } from '@/store/hooks';
import {
  DEFAULT_STOCK_CONTROL_SETTINGS,
  readStockControlSettingsFromCompanySettings,
} from '@/lib/stock-control/settings';

type CompanySourceMode = 'HYBRID' | 'EXTERNAL_ONLY' | 'INTERNAL_ONLY';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
const helpTextClass = 'mt-1.5 text-xs text-muted-foreground';
const selectClass =
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';
const textareaClass =
  'min-h-[4.5rem] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background resize-y disabled:cursor-not-allowed disabled:opacity-50';
const readOnlyBoxClass =
  'flex min-h-9 w-full items-center rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground';

function parseSourceMode(value: unknown, fallback: CompanySourceMode): CompanySourceMode {
  if (value === 'HYBRID' || value === 'EXTERNAL_ONLY' || value === 'INTERNAL_ONLY') return value;
  return fallback;
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function AdminCompanyProfilePage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canManage = isSA || perms.includes('settings.manage');
  const canSyncCustomers = isSA || perms.includes('customer.edit');
  const canSyncSuppliers = isSA || perms.includes('transaction.stock_in');

  const [syncPartyCustomers, { isLoading: isSyncingCustomers }] = useSyncCustomersFromPartyApiMutation();
  const [syncPartySuppliers, { isLoading: isSyncingSuppliers }] = useSyncSuppliersFromPartyApiMutation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyData, setCompanyData] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    address: '',
    phone: '',
    email: '',
    externalCompanyId: '',
    jobSourceMode: 'HYBRID' as CompanySourceMode,
    customerSourceMode: 'HYBRID' as CompanySourceMode,
    supplierSourceMode: 'HYBRID' as CompanySourceMode,
    currencyCode: 'AED',
    negativeEvidenceQtyThreshold: DEFAULT_STOCK_CONTROL_SETTINGS.negativeEvidenceQtyThreshold.toString(),
    negativeDecisionNoteQtyThreshold: DEFAULT_STOCK_CONTROL_SETTINGS.negativeDecisionNoteQtyThreshold.toString(),
  });

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load company');
        const data = await res.json();
        const company = data.data as Record<string, unknown>;
        const stockControlSettings = readStockControlSettingsFromCompanySettings(company.jobCostingSettings);
        const operationalSettings =
          company.operationalSettings && typeof company.operationalSettings === 'object' && !Array.isArray(company.operationalSettings)
            ? (company.operationalSettings as Record<string, unknown>)
            : {};
        setCompanyData(company);
        setForm({
          address: (company.address as string) || '',
          phone: (company.phone as string) || '',
          email: (company.email as string) || '',
          externalCompanyId: (company.externalCompanyId as string) || '',
          jobSourceMode: parseSourceMode(company.jobSourceMode, 'HYBRID'),
          customerSourceMode: parseSourceMode(company.customerSourceMode, 'HYBRID'),
          supplierSourceMode: parseSourceMode(company.supplierSourceMode, 'HYBRID'),
          currencyCode:
            typeof operationalSettings.currencyCode === 'string' && operationalSettings.currencyCode.trim().length > 0
              ? operationalSettings.currencyCode.trim().toUpperCase()
              : 'AED',
          negativeEvidenceQtyThreshold: stockControlSettings.negativeEvidenceQtyThreshold.toString(),
          negativeDecisionNoteQtyThreshold: stockControlSettings.negativeDecisionNoteQtyThreshold.toString(),
        });
      } catch {
        toast.error('Failed to load company settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [session?.user?.activeCompanyId]);

  if (!canManage) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
            <CardDescription>You do not have permission to manage company settings.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.activeCompanyId) return;
    try {
      setSaving(true);
      const nextJobCostingSettings =
        companyData && typeof companyData === 'object' && 'jobCostingSettings' in companyData
          ? (companyData as { jobCostingSettings?: unknown }).jobCostingSettings
          : undefined;
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          operationalSettings: {
            currencyCode: form.currencyCode.trim().toUpperCase(),
          },
          ...(isSA
            ? {
                jobCostingSettings: {
                  ...(nextJobCostingSettings &&
                  typeof nextJobCostingSettings === 'object' &&
                  !Array.isArray(nextJobCostingSettings)
                    ? (nextJobCostingSettings as Record<string, unknown>)
                    : {}),
                  stockControl: {
                    negativeEvidenceQtyThreshold: Number(form.negativeEvidenceQtyThreshold),
                    negativeDecisionNoteQtyThreshold: Number(form.negativeDecisionNoteQtyThreshold),
                  },
                },
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }
      toast.success('Company settings saved');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncPartyCustomers = async () => {
    try {
      const result = await syncPartyCustomers().unwrap();
      toast.success(`Synced ${result.created} new and ${result.updated} updated customers`);
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Failed to sync party list customers'));
    }
  };

  const handleSyncPartySuppliers = async () => {
    try {
      const result = await syncPartySuppliers().unwrap();
      toast.success(`Synced ${result.created} new and ${result.updated} updated suppliers`);
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Sync failed — check PARTY_LISTS_API_* env vars'));
    }
  };

  const fieldDisabled = saving || loading;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Companies</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Company profile</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Active company: profile, currency, integration, and stock control defaults.
          </p>
        </div>
        <Link
          href="/admin/companies"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex shrink-0')}
        >
          Back to companies
        </Link>
      </header>

      {canManage && (canSyncCustomers || canSyncSuppliers) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Party lists sync</CardTitle>
            <CardDescription>
              Pull master customers and suppliers from the configured party lists API for the active company. Requires{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">PARTY_LISTS_API_*</code>{' '}
              environment variables. Internal-only mode disables the matching sync button.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {canSyncCustomers ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSyncPartyCustomers()}
                disabled={isSyncingCustomers || form.customerSourceMode === 'INTERNAL_ONLY'}
                title={
                  form.customerSourceMode === 'INTERNAL_ONLY'
                    ? 'Customer source mode is internal only; party sync is disabled.'
                    : undefined
                }
              >
                {isSyncingCustomers ? 'Syncing…' : 'Sync customers'}
              </Button>
            ) : null}
            {canSyncSuppliers ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSyncPartySuppliers()}
                disabled={isSyncingSuppliers || form.supplierSourceMode === 'INTERNAL_ONLY'}
                title={
                  form.supplierSourceMode === 'INTERNAL_ONLY'
                    ? 'Supplier source mode is internal only; party sync is disabled.'
                    : undefined
                }
              >
                {isSyncingSuppliers ? 'Syncing…' : 'Sync suppliers'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={onSave} className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="company-address" className={labelClass}>
                Address
              </label>
              <textarea
                id="company-address"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                rows={3}
                disabled={fieldDisabled}
                className={textareaClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="company-phone" className={labelClass}>
                  Phone
                </label>
                <Input
                  id="company-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  disabled={fieldDisabled}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="company-email" className={labelClass}>
                  Email
                </label>
                <Input
                  id="company-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={fieldDisabled}
                />
              </div>
            </div>

            {isSA ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="company-external-id" className={labelClass}>
                      External company ID
                    </label>
                    <Input
                      id="company-external-id"
                      type="text"
                      value={form.externalCompanyId}
                      onChange={(e) => setForm((prev) => ({ ...prev, externalCompanyId: e.target.value }))}
                      disabled={fieldDisabled}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label htmlFor="company-job-source" className={labelClass}>
                      Parent job source
                    </label>
                    <select
                      id="company-job-source"
                      value={form.jobSourceMode}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, jobSourceMode: e.target.value as CompanySourceMode }))
                      }
                      disabled={fieldDisabled}
                      className={selectClass}
                    >
                      <option value="HYBRID">Hybrid</option>
                      <option value="EXTERNAL_ONLY">External only</option>
                      <option value="INTERNAL_ONLY">Internal only</option>
                    </select>
                    <p className={helpTextClass}>
                      External: parent jobs from PM API only. Internal: inbound job API off. Hybrid: both.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company-customer-source" className={labelClass}>
                      Customer source
                    </label>
                    <select
                      id="company-customer-source"
                      value={form.customerSourceMode}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, customerSourceMode: e.target.value as CompanySourceMode }))
                      }
                      disabled={fieldDisabled}
                      className={selectClass}
                    >
                      <option value="HYBRID">Hybrid</option>
                      <option value="EXTERNAL_ONLY">External only</option>
                      <option value="INTERNAL_ONLY">Internal only</option>
                    </select>
                    <p className={helpTextClass}>
                      External: no manual customer create. Internal: no party sync / inbound customer API.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company-supplier-source" className={labelClass}>
                      Supplier source
                    </label>
                    <select
                      id="company-supplier-source"
                      value={form.supplierSourceMode}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, supplierSourceMode: e.target.value as CompanySourceMode }))
                      }
                      disabled={fieldDisabled}
                      className={selectClass}
                    >
                      <option value="HYBRID">Hybrid</option>
                      <option value="EXTERNAL_ONLY">External only</option>
                      <option value="INTERNAL_ONLY">Internal only</option>
                    </select>
                    <p className={helpTextClass}>
                      External: no manual supplier create. Internal: no party sync / inbound supplier API.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label htmlFor="company-currency" className={labelClass}>
                      Currency code
                    </label>
                    <Input
                      id="company-currency"
                      type="text"
                      maxLength={3}
                      value={form.currencyCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, currencyCode: e.target.value.toUpperCase() }))}
                      disabled={fieldDisabled}
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company-evidence-threshold" className={labelClass}>
                      Evidence threshold qty
                    </label>
                    <Input
                      id="company-evidence-threshold"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={form.negativeEvidenceQtyThreshold}
                      onChange={(e) => setForm((prev) => ({ ...prev, negativeEvidenceQtyThreshold: e.target.value }))}
                      disabled={fieldDisabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company-decision-threshold" className={labelClass}>
                      Decision note threshold qty
                    </label>
                    <Input
                      id="company-decision-threshold"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={form.negativeDecisionNoteQtyThreshold}
                      onChange={(e) => setForm((prev) => ({ ...prev, negativeDecisionNoteQtyThreshold: e.target.value }))}
                      disabled={fieldDisabled}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className={labelClass}>Inventory valuation method</span>
                  <div className={readOnlyBoxClass}>FIFO (core system)</div>
                </div>
              </>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
          <Button type="submit" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save company settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
