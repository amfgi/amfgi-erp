import type { WorkspaceHubLink } from '@/components/workspace/WorkspaceHubLinkRow';

/** Preserves `WorkspaceHubTone` literals when building hub link lists from conditional spreads. */
export function buildHubLinks(links: WorkspaceHubLink[]): WorkspaceHubLink[] {
  return links;
}
