'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  buildWorkforceProfileExtension,
} from '@/lib/hr/workforceProfile';
import { NATIONALITY_OPTIONS } from '@/lib/hr/employeeMeta';

function generateEmployeeCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `EMP-${stamp.slice(-6)}`;
}

function summarizeName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { display: 'New employee', initials: 'NE' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { display: trimmed, initials: parts[0]!.slice(0, 2).toUpperCase() };
  return {
    display: trimmed,
    initials: `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase(),
  };
}

export default function NewEmployeePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nationality, setNationality] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [employeeType, setEmployeeType] = useState<'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER'>('LABOUR_WORKER');
  const [visaHolding, setVisaHolding] = useState<'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA'>('COMPANY_PROVIDED');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const preview = useMemo(() => summarizeName(fullName || preferredName), [fullName, preferredName]);
  const proposedCode = useMemo(() => generateEmployeeCode(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const legalName = fullName.trim() || preferredName.trim();
      const displayName = preferredName.trim() || legalName;
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: generateEmployeeCode(),
          fullName: legalName,
          preferredName: displayName || null,
          nationality: nationality || null,
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          profileExtension: buildWorkforceProfileExtension({
            employeeType,
            visaHolding,
            expertises: [],
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Save failed');
        return;
      }
      toast.success('Employee created');
      router.push(`/hr/employees/${json.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to create employee records.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="w-full min-w-0 space-y-6 border-b border-border pb-4">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee setup</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Create employee record</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Capture the essential HR identity and workforce setup first, then continue in the employee profile for
              documents, timing, and portal access.
            </p>
          </div>
          <div className="grid w-full shrink-0 gap-3 sm:grid-cols-2 lg:max-w-md">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Employee code</p>
                <p className="mt-2 font-mono text-sm text-emerald-600 dark:text-emerald-300">{proposedCode}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next step</p>
                <p className="mt-2 text-sm font-medium text-foreground">Complete full profile after create</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Employee details</CardTitle>
            <CardDescription>
              This entry creates the employee and prepares the workforce setup for scheduling, attendance, and
              compliance tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Full legal name
                  </span>
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter employee full name"
                  />
                </div>
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Preferred name
                  </span>
                  <Input
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="Optional display name"
                  />
                </div>
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Mobile number
                  </span>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +971…" />
                </div>
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Nationality
                  </span>
                  <Select value={nationality} onChange={(e) => setNationality(e.target.value)}>
                    <option value="">Select nationality</option>
                    {NATIONALITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Designation
                  </span>
                  <Input
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Supervisor, Driver, Fabricator"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold text-foreground">Workforce setup</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Employee type
                    </span>
                    <Select
                      value={employeeType}
                      onChange={(e) =>
                        setEmployeeType(e.target.value as 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER')
                      }
                    >
                      {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Visa holding
                    </span>
                    <Select
                      value={visaHolding}
                      onChange={(e) =>
                        setVisaHolding(e.target.value as 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA')
                      }
                    >
                      {WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating employee…' : 'Create employee'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => router.push('/hr/employees')}>
                  Back to employees
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  {preview.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-foreground">{preview.display}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Sample code: {proposedCode}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Captured in this step</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>Core employee identity for the HR master record.</li>
                <li>Nationality selection for cleaner standardized data.</li>
                <li>Visa holding choice: company provided, self own, or no visa.</li>
                <li>Workforce role type so the employee fits schedule and attendance rules.</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
