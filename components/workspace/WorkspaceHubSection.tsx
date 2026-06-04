import { WorkspaceHubLinkRow, type WorkspaceHubLink } from '@/components/workspace/WorkspaceHubLinkRow';
import { WorkspaceHubSectionHeader } from '@/components/workspace/WorkspaceHubSectionHeader';

export type WorkspaceHubSectionData = {
  id: string;
  title: string;
  description: string;
  links: WorkspaceHubLink[];
};

export function WorkspaceHubSection({ section }: { section: WorkspaceHubSectionData }) {
  const headingId = `workspace-hub-section-${section.id}`;
  const { links } = section;

  if (links.length === 0) return null;

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      aria-labelledby={headingId}
    >
      <WorkspaceHubSectionHeader
        headingId={headingId}
        title={section.title}
        description={section.description}
        count={links.length}
      />
      <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border bg-background/40" role="list">
        {links.map((link) => (
          <li key={link.href} role="listitem">
            <WorkspaceHubLinkRow link={link} />
          </li>
        ))}
      </ul>
    </section>
  );
}
