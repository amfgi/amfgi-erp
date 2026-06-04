'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/shadcn/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/shadcn/sidebar';
import {
  filterSidebarNavEntries,
  isSidebarGroupActive,
  isSidebarPathActive,
  SIDEBAR_NAV_ENTRIES,
  SIDEBAR_SELF_SERVICE_ENTRIES,
  type SidebarNavEntry,
  type SidebarNavGroup,
  type SidebarNavLink,
  type SidebarNavVisibility,
} from '@/lib/navigation/sidebarNav';

function SidebarNavLinkItem({
  item,
  pathname,
  onNavigate,
}: {
  item: SidebarNavLink;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isSidebarPathActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link href={item.href} onClick={onNavigate}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarNavGroupItem({
  group,
  pathname,
  onNavigate,
}: {
  group: SidebarNavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const isIconCollapsed = state === 'collapsed' && !isMobile;
  const groupActive = isSidebarGroupActive(pathname, group);
  const [open, setOpen] = useState(groupActive);
  const Icon = group.icon;
  const childHrefs = group.children.map((c) => c.href);
  const showOverview =
    Boolean(group.href) && !group.children.some((child) => child.href === group.href);

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  if (isIconCollapsed) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={groupActive} tooltip={group.label}>
              <Icon />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-48">
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {showOverview && group.href ? (
              <DropdownMenuItem asChild>
                <Link
                  href={group.href}
                  onClick={onNavigate}
                  className={isSidebarPathActive(pathname, group.href, childHrefs) ? 'bg-accent' : undefined}
                >
                  Overview
                </Link>
              </DropdownMenuItem>
            ) : null}
            {group.children.map((child) => (
              <DropdownMenuItem key={child.href} asChild>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={
                    isSidebarPathActive(pathname, child.href, childHrefs) ? 'bg-accent' : undefined
                  }
                >
                  {child.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={groupActive} tooltip={group.label}>
            <Icon />
            <span>{group.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {showOverview && group.href ? (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  isActive={isSidebarPathActive(pathname, group.href, childHrefs)}
                >
                  <Link href={group.href} onClick={onNavigate}>
                    <span>Overview</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ) : null}
            {group.children.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={isSidebarPathActive(pathname, child.href, childHrefs)}
                >
                  <Link href={child.href} onClick={onNavigate}>
                    <span>{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarNavEntryItem({
  entry,
  pathname,
  onNavigate,
}: {
  entry: SidebarNavEntry;
  pathname: string;
  onNavigate: () => void;
}) {
  if (entry.type === 'link') {
    return <SidebarNavLinkItem item={entry} pathname={pathname} onNavigate={onNavigate} />;
  }
  return <SidebarNavGroupItem group={entry} pathname={pathname} onNavigate={onNavigate} />;
}

export function SidebarNavMenu({ visibility }: { visibility: SidebarNavVisibility }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const source = visibility.selfServiceOnly ? SIDEBAR_SELF_SERVICE_ENTRIES : SIDEBAR_NAV_ENTRIES;
  const entries = filterSidebarNavEntries(source, visibility);

  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu className="gap-1">
      {entries.map((entry) => (
        <SidebarNavEntryItem
          key={entry.type === 'link' ? entry.href : entry.id}
          entry={entry}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </SidebarMenu>
  );
}
