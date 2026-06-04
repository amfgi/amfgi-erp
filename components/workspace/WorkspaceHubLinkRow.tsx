'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { workspaceHubToneBadgeClass, type WorkspaceHubTone } from '@/components/workspace/hubTones';

export type WorkspaceHubLink = {
  href: string;
  title: string;
  description: string;
  badge?: string;
  tone?: WorkspaceHubTone;
  /** Shown beside the title (e.g. dashboard nav label). */
  subtitle?: string;
  icon?: ReactNode;
  onClick?: () => void;
};

export function WorkspaceHubLinkRow({ link }: { link: WorkspaceHubLink }) {
  const tone = link.tone ?? 'muted';

  return (
    <Link
      href={link.href}
      onClick={link.onClick}
      className={cn(
        'group flex items-center gap-3 px-4 py-3.5 transition-colors',
        'hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
    >
      {link.icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:bg-primary/5 [&_svg]:size-5">
          {link.icon}
        </span>
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:bg-primary/5 group-hover:text-foreground">
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{link.title}</span>
          {link.subtitle ? (
            <span className="text-xs text-muted-foreground">{link.subtitle}</span>
          ) : null}
          {link.badge ? (
            <Badge
              variant="outline"
              className={cn(
                'h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide',
                workspaceHubToneBadgeClass[tone],
              )}
            >
              {link.badge}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{link.description}</p>
      </div>
    </Link>
  );
}
