'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { exportEmployeesToXlsx } from '@/lib/import-export/exportEmployees';
import {
  DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS,
  EMPLOYEE_EXPORT_COLUMN_GROUPS,
  EMPLOYEE_EXPORT_COLUMNS,
  EMPLOYEE_EXPORT_SORT_OPTIONS,
  columnsByGroup,
  sortEmployeeExportRecords,
  type EmployeeExportSortKey,
} from '@/lib/import-export/employeeExportConfig';
import { useEmployeeMetaOptions } from '@/components/hr/useEmployeeMetaOptions';
import {
  directoryFilterArrayToValue,
  directoryFilterValueToArray,
  hasEmployeeDirectoryFilters,
} from '@/lib/hr/employeeListQuery';
import { WORKFORCE_EMPLOYEE_TYPE_OPTIONS, WORKFORCE_VISA_HOLDING_OPTIONS } from '@/lib/hr/workforceProfile';
import { cn } from '@/lib/utils';
import {
  useGetHrExpertisesQuery,
  useLazyGetHrEmployeesForExportQuery,
  type HrEmployeesExportParams,
} from '@/store/api/endpoints/hr';

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  directoryFilters: HrEmployeesExportParams;
  employeeTypeChoices: string[];
};

const STATUS_OPTIONS: Array<{ value: EmployeeStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXITED', label: 'Exited' },
];

const PORTAL_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
] as const;

function prettyEmployeeType(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toggleFilterValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function FilterCheckboxGroup({
  label,
  options,
  selected,
  onChange,
  disabled,
  loading,
  includeNotSet,
  hint = 'Leave all unchecked to include every option.',
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  includeNotSet?: boolean;
  hint?: string;
}) {
  const allOptions = includeNotSet
    ? [{ value: '__none__', label: 'Not set' }, ...options]
    : options;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {selected.length > 0 ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            onClick={() => onChange([])}
            disabled={disabled || loading}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          'max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/10 p-2.5',
          (disabled || loading) && 'pointer-events-none opacity-60'
        )}
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : allOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No options configured.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {allOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={selected.includes(option.value)}
                  onChange={() => onChange(toggleFilterValue(selected, option.value))}
                  disabled={disabled || loading}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0 ? hint : `${selected.length} selected`}
      </p>
    </div>
  );
}

function buildExportFilters(input: {
  q?: string;
  status: string[];
  portal: string[];
  employeeType: string[];
  designation: string[];
  department: string[];
  employmentType: string[];
  signatureGroup: string[];
  visaHolding: string[];
  expertise: string[];
}): HrEmployeesExportParams {
  return {
    q: input.q,
    status: directoryFilterArrayToValue(input.status),
    portal: directoryFilterArrayToValue(input.portal),
    employeeType: directoryFilterArrayToValue(input.employeeType),
    designation: directoryFilterArrayToValue(input.designation),
    department: directoryFilterArrayToValue(input.department),
    employmentType: directoryFilterArrayToValue(input.employmentType),
    signatureGroup: directoryFilterArrayToValue(input.signatureGroup),
    visaHolding: directoryFilterArrayToValue(input.visaHolding),
    expertise: directoryFilterArrayToValue(input.expertise),
  };
}

export default function EmployeeExportModal({
  isOpen,
  onClose,
  directoryFilters,
  employeeTypeChoices,
}: Props) {
  const [fetchEmployeesForExport, { isFetching }] = useLazyGetHrEmployeesForExportQuery();

  const [q, setQ] = useState('');
  const [statusValues, setStatusValues] = useState<string[]>([]);
  const [portalValues, setPortalValues] = useState<string[]>([]);
  const [employeeTypeValues, setEmployeeTypeValues] = useState<string[]>([]);
  const [designationValues, setDesignationValues] = useState<string[]>([]);
  const [departmentValues, setDepartmentValues] = useState<string[]>([]);
  const [employmentTypeValues, setEmploymentTypeValues] = useState<string[]>([]);
  const [signatureGroupValues, setSignatureGroupValues] = useState<string[]>([]);
  const [visaHoldingValues, setVisaHoldingValues] = useState<string[]>([]);
  const [expertiseValues, setExpertiseValues] = useState<string[]>([]);

  const { options: designationOptions, loading: designationLoading } = useEmployeeMetaOptions('DESIGNATION');
  const { options: departmentOptions, loading: departmentLoading } = useEmployeeMetaOptions('DEPARTMENT');
  const { options: employmentTypeOptions, loading: employmentTypeLoading } =
    useEmployeeMetaOptions('EMPLOYMENT_TYPE');
  const { options: signatureGroupOptions, loading: signatureGroupLoading } =
    useEmployeeMetaOptions('SIGNATURE_GROUP');
  const { data: expertises = [], isLoading: expertisesLoading } = useGetHrExpertisesQuery(undefined, {
    skip: !isOpen,
  });

  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS);
  const [sortBy, setSortBy] = useState<EmployeeExportSortKey>('fullName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [includeInstructions, setIncludeInstructions] = useState(true);

  const workforceRoleOptions = useMemo(() => {
    const known = WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));
    const extra = employeeTypeChoices
      .filter((t) => !WORKFORCE_EMPLOYEE_TYPE_OPTIONS.some((o) => o.value === t))
      .map((t) => ({ value: t, label: prettyEmployeeType(t) }));
    return [...known, ...extra];
  }, [employeeTypeChoices]);

  const resetFilterState = (filters: HrEmployeesExportParams) => {
    setQ(filters.q ?? '');
    setStatusValues(directoryFilterValueToArray(filters.status));
    setPortalValues(directoryFilterValueToArray(filters.portal));
    setEmployeeTypeValues(directoryFilterValueToArray(filters.employeeType));
    setDesignationValues([]);
    setDepartmentValues([]);
    setEmploymentTypeValues([]);
    setSignatureGroupValues([]);
    setVisaHoldingValues([]);
    setExpertiseValues([]);
  };

  useEffect(() => {
    if (!isOpen) return;
    resetFilterState(directoryFilters);
    setSelectedColumns(DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS);
    setSortBy('fullName');
    setSortDirection('asc');
    setIncludeInstructions(true);
  }, [isOpen, directoryFilters]);

  const activeFilters = useMemo<HrEmployeesExportParams>(
    () =>
      buildExportFilters({
        q,
        status: statusValues,
        portal: portalValues,
        employeeType: employeeTypeValues,
        designation: designationValues,
        department: departmentValues,
        employmentType: employmentTypeValues,
        signatureGroup: signatureGroupValues,
        visaHolding: visaHoldingValues,
        expertise: expertiseValues,
      }),
    [
      q,
      statusValues,
      portalValues,
      employeeTypeValues,
      designationValues,
      departmentValues,
      employmentTypeValues,
      signatureGroupValues,
      visaHoldingValues,
      expertiseValues,
    ]
  );

  const selectedColumnSet = useMemo(() => new Set(selectedColumns), [selectedColumns]);

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleGroup = (groupId: (typeof EMPLOYEE_EXPORT_COLUMN_GROUPS)[number]['id'], checked: boolean) => {
    const keys = columnsByGroup(groupId).map((c) => c.key);
    setSelectedColumns((prev) => {
      const set = new Set(prev);
      for (const key of keys) {
        if (checked) set.add(key);
        else set.delete(key);
      }
      return EMPLOYEE_EXPORT_COLUMNS.map((c) => c.key).filter((key) => set.has(key));
    });
  };

  const runExport = async () => {
    if (selectedColumns.length === 0) {
      toast.error('Select at least one column to export');
      return;
    }

    try {
      let rows = await fetchEmployeesForExport(activeFilters).unwrap();
      if (rows.length === 0) {
        toast.error('No employees match your export settings');
        return;
      }

      rows = sortEmployeeExportRecords(rows, sortBy, sortDirection);

      const scopeLabel = hasEmployeeDirectoryFilters(activeFilters) ? 'employees-filtered' : 'employees';

      exportEmployeesToXlsx(rows, {
        label: scopeLabel,
        columns: selectedColumns,
        includeInstructions,
      });
      toast.success(`Exported ${rows.length} employee(s)`);
      onClose();
    } catch {
      toast.error('Failed to export employees');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export employees"
      description="Exports all employees matching your filters (up to 10,000). Choose columns and sort order below."
      size="2xl"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isFetching}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void runExport()} disabled={isFetching}>
            {isFetching ? 'Preparing…' : 'Download Excel'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">General filters</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, code, email, or phone"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterCheckboxGroup
                label="Status"
                options={STATUS_OPTIONS}
                selected={statusValues}
                onChange={setStatusValues}
              />
              <FilterCheckboxGroup
                label="Portal"
                options={PORTAL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                selected={portalValues}
                onChange={setPortalValues}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Employment options</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterCheckboxGroup
              label="Designation"
              options={designationOptions.map((option) => ({ value: option.name, label: option.name }))}
              selected={designationValues}
              onChange={setDesignationValues}
              loading={designationLoading}
              includeNotSet
            />
            <FilterCheckboxGroup
              label="Department"
              options={departmentOptions.map((option) => ({ value: option.name, label: option.name }))}
              selected={departmentValues}
              onChange={setDepartmentValues}
              loading={departmentLoading}
              includeNotSet
            />
            <FilterCheckboxGroup
              label="Employment type"
              options={employmentTypeOptions.map((option) => ({ value: option.name, label: option.name }))}
              selected={employmentTypeValues}
              onChange={setEmploymentTypeValues}
              loading={employmentTypeLoading}
              includeNotSet
            />
            <FilterCheckboxGroup
              label="Signature group"
              options={signatureGroupOptions.map((option) => ({ value: option.name, label: option.name }))}
              selected={signatureGroupValues}
              onChange={setSignatureGroupValues}
              loading={signatureGroupLoading}
              includeNotSet
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Workforce options</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterCheckboxGroup
              label="Workforce role"
              options={workforceRoleOptions}
              selected={employeeTypeValues}
              onChange={setEmployeeTypeValues}
              includeNotSet
            />
            <FilterCheckboxGroup
              label="Visa holding"
              options={WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              selected={visaHoldingValues}
              onChange={setVisaHoldingValues}
            />
            <div className="sm:col-span-2">
              <FilterCheckboxGroup
                label="Expertise"
                options={expertises
                  .filter((row) => row.isActive)
                  .map((row) => ({ value: row.name, label: row.name }))}
                selected={expertiseValues}
                onChange={setExpertiseValues}
                loading={expertisesLoading}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Columns</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelectedColumns(DEFAULT_EMPLOYEE_EXPORT_COLUMN_KEYS)}
              >
                Select all
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedColumns([])}>
                Clear all
              </Button>
            </div>
          </div>
          <div className="max-h-56 space-y-4 overflow-y-auto rounded-lg border border-border p-3">
            {EMPLOYEE_EXPORT_COLUMN_GROUPS.map((group) => {
              const cols = columnsByGroup(group.id);
              const allChecked = cols.every((c) => selectedColumnSet.has(c.key));
              const someChecked = cols.some((c) => selectedColumnSet.has(c.key));
              return (
                <div key={group.id} className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked;
                      }}
                      onChange={(e) => toggleGroup(group.id, e.target.checked)}
                    />
                    {group.label}
                  </label>
                  <div className="grid gap-1.5 pl-6 sm:grid-cols-2">
                    {cols.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={selectedColumnSet.has(col.key)}
                          onChange={() => toggleColumn(col.key)}
                        />
                        {col.label}
                        {col.exportOnly ? (
                          <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            report
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{selectedColumns.length} column(s) selected</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sort by</span>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as EmployeeExportSortKey)}>
              {EMPLOYEE_EXPORT_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Direction</span>
            <Select
              value={sortDirection}
              onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
        </section>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={includeInstructions}
            onChange={(e) => setIncludeInstructions(e.target.checked)}
          />
          Include instructions sheet in workbook
        </label>
      </div>
    </Modal>
  );
}
