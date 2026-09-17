'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { AlertCircle, Clock3, FileText, Hash, ListTree, Tags } from 'lucide-react';

import {
  buildHubLinks,
  WorkspaceHubHeader,
  WorkspaceHubSection,
  WorkspaceHubSectionsGrid,
  type WorkspaceHubSectionData,
} from '@/components/workspace';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { P } from '@/lib/permissions';

export default function EmployeeSetupPage() {
  const { data: session } = useSession();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];

  const canEmploymentOptions = isSA || perms.includes('hr.employee.edit');
  const canEmployeeCodes =
    isSA || perms.includes('hr.employee.edit') || perms.includes('hr.employee.view');
  const canEmployeeTypes =
    isSA || perms.includes('hr.settings.employee_types') || perms.includes('hr.employee.view');
  const canExpertises =
    isSA || perms.includes('hr.settings.expertise_catalog') || perms.includes('hr.employee.view');
  const canDocumentTypes =
    isSA || perms.includes(P.HR_DOCUMENT_TYPE_VIEW) || perms.includes(P.HR_SETTINGS_DOC_TYPES);

  const sections = useMemo<WorkspaceHubSectionData[]>(() => {
    const links = buildHubLinks([
      ...(canEmploymentOptions
        ? [
            {
              href: '/hr/settings/employment-options',
              title: 'Employment options',
              description:
                'Company catalogs for designation, department, employment type, signature group, and related profile dropdowns.',
              badge: 'Catalog',
              tone: 'emerald' as const,
              icon: <ListTree />,
            },
          ]
        : []),
      ...(canEmployeeCodes
        ? [
            {
              href: '/hr/settings/employee-codes',
              title: 'Employee ID format',
              description:
                'Company-wise employee code prefix, padding, and counting style (sequential, yearly, or monthly).',
              badge: 'ID',
              tone: 'sky' as const,
              icon: <Hash />,
            },
          ]
        : []),
      ...(canEmployeeTypes
        ? [
            {
              href: '/hr/settings/employee-types',
              title: 'Employee type timings',
              description:
                'Default basic hours and duty/break windows by workforce role (office, hybrid, driver, labour).',
              badge: 'Timing',
              tone: 'sky' as const,
              icon: <Clock3 />,
            },
          ]
        : []),
      ...(canExpertises
        ? [
            {
              href: '/hr/settings/expertises',
              title: 'Expertise catalog',
              description:
                'Skills and trade labels tagged on employee profiles for schedule filtering and job staffing.',
              badge: 'Skills',
              tone: 'amber' as const,
              icon: <Tags />,
            },
          ]
        : []),
      ...(canDocumentTypes
        ? [
            {
              href: '/hr/settings/document-types',
              title: 'Document types',
              description:
                'File categories for employee documents (passport, visa, labour card) with expiry and alert rules.',
              badge: 'Documents',
              tone: 'muted' as const,
              icon: <FileText />,
            },
          ]
        : []),
    ]);

    return [
      {
        id: 'catalogs',
        title: 'Employee catalogs',
        description: 'Master data used across employee profiles, attendance defaults, and document uploads.',
        links,
      },
    ];
  }, [canDocumentTypes, canEmployeeCodes, canEmployeeTypes, canEmploymentOptions, canExpertises]);

  const hasAnyLink = sections.some((section) => section.links.length > 0);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="HR"
        title="Employee setup"
        description="Configure employment catalogs, employee ID format, type timings, expertise tags, and document types used across employee records."
      />

      {!hasAnyLink ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>You do not have permission to view employee setup catalogs.</AlertDescription>
        </Alert>
      ) : (
        <WorkspaceHubSectionsGrid columns={2}>
          {sections.map((section) => (
            <WorkspaceHubSection key={section.id} section={section} />
          ))}
        </WorkspaceHubSectionsGrid>
      )}
    </div>
  );
}
