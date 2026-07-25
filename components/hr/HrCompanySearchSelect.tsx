'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

import SearchSelect from '@/components/ui/SearchSelect';
import { cn } from '@/lib/utils';
import { useGetCompaniesQuery, type Company } from '@/store/api/adminEndpoints/companies';

export type HrCompanyOption = {
  id: string;
  label: string;
  searchText: string;
};

export function useHrAccessibleCompanies() {
  const { data: session } = useSession();
  const { data: companies = [], isLoading } = useGetCompaniesQuery();

  const accessibleCompanies = useMemo(() => {
    const active = companies.filter((company) => company.isActive);
    if (session?.user?.isSuperAdmin) return active;
    const allowed = session?.user?.allowedCompanyIds ?? [];
    return active.filter((company) => allowed.includes(company.id));
  }, [companies, session?.user?.allowedCompanyIds, session?.user?.isSuperAdmin]);

  const options = useMemo<HrCompanyOption[]>(
    () =>
      accessibleCompanies.map((company) => ({
        id: company.id,
        label: company.name,
        searchText: `${company.name} ${company.slug}`,
      })),
    [accessibleCompanies],
  );

  return { companies: accessibleCompanies, options, isLoading };
}

type HrCompanySearchSelectProps = {
  value: string;
  onChange: (companyId: string) => void;
  required?: boolean;
  allowClear?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
  inputClassName?: string;
  placeholder?: string;
};

export default function HrCompanySearchSelect({
  value,
  onChange,
  required,
  allowClear = false,
  label = 'Company',
  className,
  disabled,
  inputClassName,
  placeholder = 'Search company…',
}: HrCompanySearchSelectProps) {
  const { options, isLoading } = useHrAccessibleCompanies();

  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      {label ? (
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      ) : null}
      <SearchSelect
        items={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled || isLoading}
        openOnFocus
        browseAllOnOpen
        minCharactersToSearch={0}
        dropdownInPortal
        allowClearButton={allowClear}
        clearOnEmptyInput={allowClear}
        loading={isLoading}
        inputProps={{
          className: cn(
            'h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-inner focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50',
            inputClassName,
          ),
        }}
      />
    </div>
  );
}

export type { Company };
