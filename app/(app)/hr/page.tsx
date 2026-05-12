'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';

type HubItem = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  tone: 'emerald' | 'sky' | 'amber';
  perms?: string[];
};

const HUB_SECTIONS: Array<{
  title: string;
  description: string;
  cards: HubItem[];
}> = [
  {
    title: 'Daily Operations',
    description: 'Move through the core HR day from workforce planning into attendance confirmation.',
    cards: [
      {
        href: '/hr/schedule',
        title: 'Schedule Planning',
        description: 'Create team groups, assign drivers and workers, and prepare day timing before attendance opens.',
        eyebrow: 'Planning',
        tone: 'emerald',
        perms: ['hr.schedule.view'],
      },
      {
        href: '/hr/attendance',
        title: 'Attendance Management',
        description: 'Review published schedules, generate attendance sheets, and correct daily worked-hour records.',
        eyebrow: 'Attendance',
        tone: 'sky',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/reports/attendance',
        title: 'Monthly Attendance Reports',
        description: 'Review employee-wise monthly attendance and export Excel files for one employee or the full month.',
        eyebrow: 'Reports',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
    ],
  },
  {
    title: 'Workforce',
    description: 'Maintain the employee master file and monitor the people records that support planning and payroll.',
    cards: [
      {
        href: '/hr/employees',
        title: 'Employees',
        description: 'Manage employee records, profile details, default timing, documents, and workforce attributes.',
        eyebrow: 'People',
        tone: 'emerald',
        perms: ['hr.employee.view'],
      },
    ],
  },
  {
    title: 'HR Setup',
    description: 'Configure the reference data that keeps the HR module structured and consistent across companies.',
    cards: [
      {
        href: '/hr/settings/document-types',
        title: 'Document Types',
        description: 'Define passport, visa, licence, and other tracked document categories with compliance rules.',
        eyebrow: 'Compliance',
        tone: 'amber',
        perms: ['hr.settings.document_types', 'hr.document.view'],
      },
      {
        href: '/hr/settings/expertises',
        title: 'Expertise Catalog',
        description: 'Maintain the workforce skill catalog used when matching employees to jobs and teams.',
        eyebrow: 'Skills',
        tone: 'sky',
        perms: ['hr.settings.expertise_catalog', 'hr.employee.view'],
      },
      {
        href: '/hr/settings/employee-types',
        title: 'Employee Type Timings',
        description: 'Set baseline timing and hours logic for office staff, drivers, hybrid roles, and labour teams.',
        eyebrow: 'Timing Rules',
        tone: 'emerald',
        perms: ['hr.settings.employee_types', 'hr.employee.view'],
      },
    ],
  },
];

const toneBadgeClass: Record<HubItem['tone'], string> = {
  emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  sky: 'border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  amber: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200',
};

function canSeeItem(isSuperAdmin: boolean, permissions: string[], item: HubItem) {
  if (isSuperAdmin) return true;
  if (!item.perms || item.perms.length === 0) return true;
  return item.perms.some((perm) => permissions.includes(perm));
}

export default function HrHubPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const permissions = (session?.user?.permissions ?? []) as string[];

  const visibleSections = HUB_SECTIONS.map((section) => ({
    ...section,
    cards: section.cards.filter((item) => canSeeItem(isSuperAdmin, permissions, item)),
  })).filter((section) => section.cards.length > 0);

  const totalVisibleLinks = visibleSections.reduce((sum, section) => sum + section.cards.length, 0);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">People</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">HR operations hub</h1>
          <p className="text-sm text-muted-foreground">
            Run daily workforce planning, attendance control, employee records, and HR setup from one entry point for
            operations teams.
          </p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {totalVisibleLinks} link{totalVisibleLinks === 1 ? '' : 's'}
        </p>
      </header>

      {visibleSections.length === 0 ? (
        <Alert>
          <AlertTitle>No HR sections available</AlertTitle>
          <AlertDescription>Your account does not currently have HR permissions for this company.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSections.map((section, sectionIndex) => {
            const headingId = `hr-hub-section-${sectionIndex}`;
            return (
              <section
                key={section.title}
                className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                aria-labelledby={headingId}
              >
                <div className="flex flex-col gap-0.5 bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 id={headingId} className="text-sm font-semibold text-foreground">
                      {section.title}
                    </h2>
                    <span className="text-xs tabular-nums text-muted-foreground">{section.cards.length}</span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{section.description}</p>
                </div>
                <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border" role="list">
                  {section.cards.map((item) => (
                    <li key={item.href} role="listitem">
                      <Link
                        href={item.href}
                        className={cn(
                          'flex min-h-13 items-start gap-3 px-4 py-3 transition-colors',
                          'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap',
                                toneBadgeClass[item.tone],
                              )}
                            >
                              {item.eyebrow}
                            </Badge>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <span className="shrink-0 pt-1 text-xs font-medium text-muted-foreground" aria-hidden>
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
