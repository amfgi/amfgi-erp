'use client';

import { useSession } from 'next-auth/react';

import {
  WorkspaceHubHeader,
  WorkspaceHubSection,
  WorkspaceHubSectionsGrid,
  type WorkspaceHubSectionData,
  type WorkspaceHubTone,
} from '@/components/workspace';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';

type HubItem = {
  href: string;
  title: string;
  description: string;
  badge: string;
  tone: WorkspaceHubTone;
  perms?: string[];
};

const HUB_SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  cards: HubItem[];
}> = [
  {
    id: 'schedule-attendance',
    title: 'Schedule & attendance',
    description: 'Plan daily work, manage attendance sheets, and export monthly records.',
    cards: [
      {
        href: '/hr/schedule',
        title: 'Schedule planning',
        description: 'Create team groups, assign drivers and workers, and prepare day timing before attendance opens.',
        badge: 'Planning',
        tone: 'emerald',
        perms: ['hr.schedule.view'],
      },
      {
        href: '/hr/attendance',
        title: 'Attendance management',
        description: 'Review published schedules, generate attendance sheets, and correct daily worked-hour records.',
        badge: 'Attendance',
        tone: 'sky',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/attendance/employee',
        title: 'Employee attendance',
        description: 'Add, edit, or delete individual attendance rows for one employee and month at a time.',
        badge: 'Individual',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/reports/attendance',
        title: 'Monthly attendance reports',
        description: 'Review employee-wise monthly attendance and export Excel files for one employee or the full month.',
        badge: 'Reports',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
    ],
  },
];

function canSeeItem(isSuperAdmin: boolean, permissions: string[], item: HubItem) {
  if (isSuperAdmin) return true;
  if (!item.perms || item.perms.length === 0) return true;
  return item.perms.some((perm) => permissions.includes(perm));
}

export default function HrHubPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const permissions = (session?.user?.permissions ?? []) as string[];

  const visibleSections: WorkspaceHubSectionData[] = HUB_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    links: section.cards
      .filter((item) => canSeeItem(isSuperAdmin, permissions, item))
      .map(({ href, title, description, badge, tone }) => ({ href, title, description, badge, tone })),
  })).filter((section) => section.links.length > 0);

  const totalVisibleLinks = visibleSections.reduce((sum, section) => sum + section.links.length, 0);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="People"
        title="Schedule & attendance"
        description="Plan daily schedules, manage attendance sheets, and export monthly records. Employees, leave, and payroll each have their own sidebar section."
        trailing={`${totalVisibleLinks} link${totalVisibleLinks === 1 ? '' : 's'}`}
      />

      {visibleSections.length === 0 ? (
        <Alert>
          <AlertTitle>No schedule or attendance sections available</AlertTitle>
          <AlertDescription>Your account does not currently have schedule or attendance permissions for this company.</AlertDescription>
        </Alert>
      ) : (
        <WorkspaceHubSectionsGrid columns={3}>
          {visibleSections.map((section) => (
            <WorkspaceHubSection key={section.id} section={section} />
          ))}
        </WorkspaceHubSectionsGrid>
      )}
    </div>
  );
}
