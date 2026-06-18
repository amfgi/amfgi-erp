'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EmployeeMetaSelect } from '@/components/hr/EmployeeMetaSelect';
import { NationalitySearchSelect } from '@/components/hr/NationalitySearchSelect';
import { CatalogSearchSelect } from '@/components/hr/CatalogSearchSelect';
import { GENDER_OPTIONS, visaHoldingOptions, workforceRoleTypeOptions } from '@/lib/hr/employeeFieldOptions';
import {
  createEmployeeRecord,
  type CreatedEmployeeClientRecord,
  type VisaHolding,
  type WorkforceEmployeeType,
} from '@/lib/hr/createEmployeeClient';
import { generateEmployeeCode } from '@/lib/hr/generateEmployeeCode';
import { invalidateEmployeeCaches } from '@/lib/hr/invalidateEmployeeCaches';
import { useAppDispatch } from '@/store/hooks';

type CreateEmployeeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialFullName?: string;
  defaultEmployeeType?: WorkforceEmployeeType;
  onCreated?: (employee: CreatedEmployeeClientRecord) => void;
};

export default function CreateEmployeeModal({
  isOpen,
  onClose,
  initialFullName = '',
  defaultEmployeeType = 'LABOUR_WORKER',
  onCreated,
}: CreateEmployeeModalProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nationality, setNationality] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [employeeType, setEmployeeType] = useState<WorkforceEmployeeType>(defaultEmployeeType);
  const [visaHolding, setVisaHolding] = useState<VisaHolding>('COMPANY_PROVIDED');

  const labelClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground';
  const fieldGrid = 'grid gap-3 sm:grid-cols-2';
  const metaSelectClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';
  const searchInputClass =
    'border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring';
  const workforceRoleOptions = useMemo(() => workforceRoleTypeOptions(), []);
  const visaHoldingOptionList = useMemo(() => visaHoldingOptions(), []);
  const proposedCode = useMemo(() => generateEmployeeCode(), [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = initialFullName.trim();
    setFullName(trimmed);
    setPreferredName('');
    setNationality('');
    setGender('');
    setPhone('');
    setDesignation('');
    setDepartment('');
    setEmploymentType('');
    setEmployeeType(defaultEmployeeType);
    setVisaHolding('COMPANY_PROVIDED');
  }, [defaultEmployeeType, initialFullName, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const employee = await createEmployeeRecord({
        fullName,
        preferredName: preferredName.trim() || null,
        nationality: nationality || null,
        gender: gender || null,
        phone: phone.trim() || null,
        designation: designation.trim() || null,
        department: department.trim() || null,
        employmentType: employmentType.trim() || null,
        employeeType,
        visaHolding,
      });
      invalidateEmployeeCaches(dispatch);
      toast.success('Employee created');
      onCreated?.(employee);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Create employee"
      description="Add a new employee record. The typed name is pre-filled below."
      size="lg"
      actions={
        <>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-employee-modal-form" disabled={saving}>
            {saving ? 'Creating…' : 'Create employee'}
          </Button>
        </>
      }
    >
      <form id="create-employee-modal-form" onSubmit={submit} className="space-y-4">
        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-300">Code: {proposedCode}</p>
        <div className={fieldGrid}>
          <div className="space-y-1 sm:col-span-2">
            <span className={labelClass}>Full legal name</span>
            <Input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter employee full name"
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Preferred name</span>
            <Input
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="Optional display name"
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Mobile number</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +971…" />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Nationality (country)</span>
            <NationalitySearchSelect
              value={nationality}
              onChange={setNationality}
              inputClassName={searchInputClass}
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Gender</span>
            <CatalogSearchSelect
              value={gender}
              onChange={setGender}
              options={GENDER_OPTIONS}
              placeholder="Search gender…"
              inputClassName={searchInputClass}
              allowLegacyValue={false}
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Designation</span>
            <EmployeeMetaSelect
              kind="DESIGNATION"
              name="designation"
              value={designation}
              onValueChange={setDesignation}
              fieldClass={metaSelectClass}
              emptyLabel="Select designation…"
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Department</span>
            <EmployeeMetaSelect
              kind="DEPARTMENT"
              name="department"
              value={department}
              onValueChange={setDepartment}
              fieldClass={metaSelectClass}
              emptyLabel="Select department…"
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Employment type</span>
            <EmployeeMetaSelect
              kind="EMPLOYMENT_TYPE"
              name="employmentType"
              value={employmentType}
              onValueChange={setEmploymentType}
              fieldClass={metaSelectClass}
              emptyLabel="Select employment type…"
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Workforce role type</span>
            <CatalogSearchSelect
              value={employeeType}
              onChange={(next) => setEmployeeType(next as WorkforceEmployeeType)}
              options={workforceRoleOptions}
              placeholder="Search workforce role…"
              inputClassName={searchInputClass}
              allowLegacyValue={false}
            />
          </div>
          <div className="space-y-1">
            <span className={labelClass}>Visa holding</span>
            <CatalogSearchSelect
              value={visaHolding}
              onChange={(next) => setVisaHolding(next as VisaHolding)}
              options={visaHoldingOptionList}
              placeholder="Search visa holding…"
              inputClassName={searchInputClass}
              allowLegacyValue={false}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
