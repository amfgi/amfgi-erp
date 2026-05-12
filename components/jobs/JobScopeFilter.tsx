'use client';

import { useEffect, useRef, useState } from 'react';

export interface JobScopeOption {
  id: string;
  jobNumber: string;
  description?: string | null;
  isParent: boolean;
}

interface JobScopeFilterProps {
  options: JobScopeOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

/** Small dropdown checkbox group used to pick which jobs (parent + variations) drive the ledger sections. */
export default function JobScopeFilter({ options, selectedIds, onChange }: JobScopeFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const allSelected = options.length > 0 && options.every((o) => selectedIds.includes(o.id));
  const buttonLabel = allSelected
    ? `All jobs (${options.length})`
    : selectedIds.length === 0
    ? 'No jobs selected'
    : `${selectedIds.length} of ${options.length} selected`;

  return (
    <div className="relative w-full max-w-xs" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-slate-600"
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Scope</span>
          <span className="mt-0.5 text-sm font-semibold">{buttonLabel}</span>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(95vw,22rem)] rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.id))}
              className="flex-1 rounded-xl bg-emerald-600/15 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-600/25 dark:text-emerald-300"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              None
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto p-2">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 rounded-xl p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(option.id)}
                  onChange={() => toggle(option.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{option.jobNumber}</p>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        option.isParent
                          ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                          : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200'
                      }`}
                    >
                      {option.isParent ? 'Parent' : 'Variation'}
                    </span>
                  </div>
                  {option.description ? (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-500">{option.description}</p>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
          <div className="border-t border-slate-200 p-3 text-center text-xs text-slate-500 dark:border-slate-700">
            {selectedIds.length}/{options.length} selected
          </div>
        </div>
      ) : null}
    </div>
  );
}
