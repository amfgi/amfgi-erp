'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import {
  downloadPayPreviewXlsx,
  type PayPreviewExportPayload,
} from '@/lib/hr/payroll/exportPayPreviewXlsx';
import {
  countPayPreviewExportSelections,
  DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS,
  PAY_PREVIEW_BREAKDOWN_FIELDS,
  PAY_PREVIEW_DAY_COLUMNS,
  PAY_PREVIEW_DETAIL_FIELDS,
  PAY_PREVIEW_EXPORT_SECTIONS,
  PAY_PREVIEW_HEALTH_FIELDS,
  PAY_PREVIEW_SALARY_COMPONENT_FIELDS,
  PAY_PREVIEW_SUMMARY_COLUMNS,
  type PayPreviewBreakdownFieldKey,
  type PayPreviewDayColumnKey,
  type PayPreviewDetailFieldKey,
  type PayPreviewExportOptions,
  type PayPreviewExportSectionKey,
  type PayPreviewHealthFieldKey,
  type PayPreviewSalaryComponentFieldKey,
  type PayPreviewSummaryColumnKey,
} from '@/lib/hr/payroll/payPreviewExportConfig';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  payload: PayPreviewExportPayload | null;
};

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function setGroupValues<T extends string>(groupKeys: T[], selected: T[], checked: boolean): T[] {
  const groupSet = new Set(groupKeys);
  const kept = selected.filter((key) => !groupSet.has(key));
  if (!checked) return kept;
  return [...kept, ...groupKeys];
}

function FieldCheckboxGroup<T extends string>({
  title,
  hint,
  options,
  selected,
  onChange,
  disabled,
}: {
  title: string;
  hint?: string;
  options: Array<{ key: T; label: string }>;
  selected: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  const keys = options.map((option) => option.key);
  const allChecked = keys.length > 0 && keys.every((key) => selected.includes(key));
  const someChecked = keys.some((key) => selected.includes(key));

  return (
    <div className={`space-y-2 rounded-lg border border-border p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked && !allChecked;
            }}
            onChange={(e) => onChange(setGroupValues(keys, selected, e.target.checked))}
            disabled={disabled}
          />
          {title}
        </label>
        <span className="text-xs text-muted-foreground">
          {selected.filter((key) => keys.includes(key)).length}/{keys.length}
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={selected.includes(option.key)}
              onChange={() => onChange(toggleValue(selected, option.key))}
              disabled={disabled}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function PayPreviewExportModal({ isOpen, onClose, payload }: Props) {
  const [summaryColumns, setSummaryColumns] = useState<PayPreviewSummaryColumnKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.summaryColumns
  );
  const [sections, setSections] = useState<PayPreviewExportSectionKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.sections
  );
  const [detailFields, setDetailFields] = useState<PayPreviewDetailFieldKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.detailFields
  );
  const [salaryComponentFields, setSalaryComponentFields] = useState<PayPreviewSalaryComponentFieldKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.salaryComponentFields
  );
  const [breakdownFields, setBreakdownFields] = useState<PayPreviewBreakdownFieldKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.breakdownFields
  );
  const [healthFields, setHealthFields] = useState<PayPreviewHealthFieldKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.healthFields
  );
  const [dayColumns, setDayColumns] = useState<PayPreviewDayColumnKey[]>(
    DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.dayColumns
  );

  useEffect(() => {
    if (!isOpen) return;
    setSummaryColumns(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.summaryColumns);
    setSections(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.sections);
    setDetailFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.detailFields);
    setSalaryComponentFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.salaryComponentFields);
    setBreakdownFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.breakdownFields);
    setHealthFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.healthFields);
    setDayColumns(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.dayColumns);
  }, [isOpen]);

  const currentOptions = useMemo<PayPreviewExportOptions>(
    () => ({
      summaryColumns,
      sections,
      detailFields,
      salaryComponentFields,
      breakdownFields,
      healthFields,
      dayColumns,
    }),
    [summaryColumns, sections, detailFields, salaryComponentFields, breakdownFields, healthFields, dayColumns]
  );

  const includeEmployeeSheets = sections.includes('employeeSheets');
  const includeDailyBreakdown = sections.includes('dailyBreakdown');
  const identityColumns = useMemo(
    () => PAY_PREVIEW_SUMMARY_COLUMNS.filter((column) => column.group === 'identity'),
    []
  );
  const payColumns = useMemo(
    () => PAY_PREVIEW_SUMMARY_COLUMNS.filter((column) => column.group === 'pay'),
    []
  );
  const profileFields = useMemo(
    () => PAY_PREVIEW_DETAIL_FIELDS.filter((field) => field.group === 'profile'),
    []
  );
  const totalFields = useMemo(
    () => PAY_PREVIEW_DETAIL_FIELDS.filter((field) => field.group === 'totals'),
    []
  );

  const runExport = () => {
    if (!payload) return;
    if (summaryColumns.length === 0 && !includeEmployeeSheets) {
      toast.error('Select at least one summary column or enable employee sheets');
      return;
    }
    if (includeEmployeeSheets && detailFields.length === 0 && salaryComponentFields.length === 0 && breakdownFields.length === 0 && healthFields.length === 0 && !includeDailyBreakdown) {
      toast.error('Select at least one employee-sheet field or daily breakdown');
      return;
    }
    if (includeDailyBreakdown && dayColumns.length === 0) {
      toast.error('Select at least one daily column, or turn off daily breakdown');
      return;
    }

    downloadPayPreviewXlsx(payload, currentOptions);
    toast.success('Excel downloaded');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export payroll preview"
      description="Pick exact fields for Summary and each employee sheet. Employee name stays on Summary for navigation."
      size="2xl"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={runExport} disabled={!payload}>
            Download Excel
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {countPayPreviewExportSelections(currentOptions)} field(s) selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSummaryColumns(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.summaryColumns);
                setSections(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.sections);
                setDetailFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.detailFields);
                setSalaryComponentFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.salaryComponentFields);
                setBreakdownFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.breakdownFields);
                setHealthFields(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.healthFields);
                setDayColumns(DEFAULT_PAY_PREVIEW_EXPORT_OPTIONS.dayColumns);
              }}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSummaryColumns([]);
                setSections([]);
                setDetailFields([]);
                setSalaryComponentFields([]);
                setBreakdownFields([]);
                setHealthFields([]);
                setDayColumns([]);
              }}
            >
              Clear all
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Workbook structure</h3>
          <div className="space-y-2 rounded-lg border border-border p-3">
            {PAY_PREVIEW_EXPORT_SECTIONS.map((section) => (
              <label key={section.key} className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-border"
                  checked={sections.includes(section.key)}
                  onChange={() => setSections((prev) => toggleValue(prev, section.key))}
                />
                <span>
                  <span className="font-medium">{section.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{section.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Summary sheet columns</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <FieldCheckboxGroup
              title="Identity"
              options={identityColumns}
              selected={summaryColumns}
              onChange={setSummaryColumns}
            />
            <FieldCheckboxGroup
              title="Pay totals"
              options={payColumns}
              selected={summaryColumns}
              onChange={setSummaryColumns}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Employee sheet fields</h3>
            {!includeEmployeeSheets ? (
              <p className="text-xs text-muted-foreground">Enable “One sheet per employee” to use these.</p>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <FieldCheckboxGroup
              title="Profile"
              options={profileFields}
              selected={detailFields}
              onChange={setDetailFields}
              disabled={!includeEmployeeSheets}
            />
            <FieldCheckboxGroup
              title="Month totals strip"
              options={totalFields}
              selected={detailFields}
              onChange={setDetailFields}
              disabled={!includeEmployeeSheets}
            />
            <FieldCheckboxGroup
              title="Salary components"
              options={PAY_PREVIEW_SALARY_COMPONENT_FIELDS}
              selected={salaryComponentFields}
              onChange={setSalaryComponentFields}
              disabled={!includeEmployeeSheets}
            />
            <FieldCheckboxGroup
              title="Health check"
              options={PAY_PREVIEW_HEALTH_FIELDS}
              selected={healthFields}
              onChange={setHealthFields}
              disabled={!includeEmployeeSheets}
            />
          </div>
          <FieldCheckboxGroup
            title="Pay calculation breakdown"
            hint="Only lines that exist for an employee are written."
            options={PAY_PREVIEW_BREAKDOWN_FIELDS}
            selected={breakdownFields}
            onChange={setBreakdownFields}
            disabled={!includeEmployeeSheets}
          />
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Daily breakdown columns</h3>
            {!includeEmployeeSheets || !includeDailyBreakdown ? (
              <p className="text-xs text-muted-foreground">
                Enable employee sheets and daily breakdown to use these.
              </p>
            ) : null}
          </div>
          <FieldCheckboxGroup
            title="Day columns"
            options={PAY_PREVIEW_DAY_COLUMNS}
            selected={dayColumns}
            onChange={setDayColumns}
            disabled={!includeEmployeeSheets || !includeDailyBreakdown}
          />
        </section>
      </div>
    </Modal>
  );
}
