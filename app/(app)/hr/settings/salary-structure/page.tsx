'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import PayTypeEditorTable, { type PayTypeRecord } from '@/components/hr/PayTypeEditorTable';
import HrCompanySearchSelect, { useHrAccessibleCompanies } from '@/components/hr/HrCompanySearchSelect';
import HrPageChrome from '@/components/hr/HrPageChrome';
import { resolveDefaultHrCompanyId, writeHrPreferredCompanyId } from '@/lib/hr/hrCompanyPreference';
import { readApiJson } from '@/lib/utils/readApiResponse';

export default function SalaryStructureSettingsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.payroll.settings');
  const { options: companyOptions } = useHrAccessibleCompanies();
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<PayTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleCompanyChange = (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    writeHrPreferredCompanyId(nextCompanyId || null);
  };

  const load = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/hr/pay-types?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
    const json = await readApiJson<PayTypeRecord[]>(res);
    if (res.ok && json?.success) setRows((json.data ?? []) as PayTypeRecord[]);
    else toast.error(json?.error ?? 'Failed to load salary structures');
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.settings permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Salary structure</h1>
          <p className="text-sm text-muted-foreground">
            Define how gross pay is calculated for each employee group. Set overtime as a percentage of the basic
            hourly rate, choose which weekdays count as working days, and assign a structure when setting compensation.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <HrCompanySearchSelect value={companyId} onChange={handleCompanyChange} required label="Company" />
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !companyId ? (
        <p className="text-sm text-muted-foreground">Select a company to manage salary structures.</p>
      ) : (
        <PayTypeEditorTable
          rows={rows}
          companyId={companyId}
          saving={saving}
          onSavingChange={setSaving}
          onReload={load}
        />
      )}
    </HrPageChrome>
  );
}
