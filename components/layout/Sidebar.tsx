'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building,
  Building2,
  Calendar,
  ChevronsUpDown,
  ClipboardList,
  Image,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  User,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react';
import CompanySwitcher from '@/components/layout/CompanySwitcher';
import { SidebarNavUser } from '@/components/layout/SidebarNavUser';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/shadcn/sidebar';

type NavDef = {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: string;
  anyPerms?: string[];
  adminOnly?: boolean;
  linkedEmployeeOnly?: boolean;
};

const NAV_ITEMS: NavDef[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/stock',
    label: 'Stock',
    icon: Package,
    anyPerms: [
      'material.view',
      'job.view',
      'transaction.stock_in',
      'transaction.stock_out',
      'transaction.reconcile',
    ],
  },
  { href: '/suppliers', label: 'Suppliers', icon: Building2, perm: 'supplier.view' },
  { href: '/customers', label: 'Customers', icon: Users, perm: 'customer.view' },
  { href: '/customers/jobs', label: 'Jobs', icon: ClipboardList, perm: 'job.view' },
  { href: '/hr', label: 'HR', icon: UserCircle, perm: 'hr.employee.view' },
  { href: '/me', label: 'My HR', icon: User, linkedEmployeeOnly: true },
  { href: '/reports/job-profitability', label: 'Reports', icon: BarChart3, perm: 'report.view' },
  { href: '/settings/media', label: 'Media', icon: Image, perm: 'settings.manage' },
  { href: '/admin/users', label: 'Users', icon: UserCog, perm: 'user.view' },
  { href: '/admin/roles', label: 'Roles', icon: ShieldCheck, perm: 'role.manage' },
  { href: '/admin/companies', label: 'Companies', icon: Building, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
];

const SELF_SERVICE_ITEMS: NavDef[] = [
  { href: '/me/profile', label: 'My Profile', icon: User, linkedEmployeeOnly: true },
  { href: '/me/attendance', label: 'My Attendance', icon: Calendar, linkedEmployeeOnly: true },
];

export default function AppNavigationSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const permissions = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const linkedEmployeeId = (session?.user as { linkedEmployeeId?: string | null } | undefined)?.linkedEmployeeId;
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);

  const source = selfServiceOnly ? SELF_SERVICE_ITEMS : NAV_ITEMS;
  const visible = source.filter((item) => {
    if (item.adminOnly) return isSuperAdmin;
    if (item.linkedEmployeeOnly) return Boolean(linkedEmployeeId);
    if (item.anyPerms?.length) return isSuperAdmin || item.anyPerms.some((p) => permissions.includes(p));
    if (item.perm) return isSuperAdmin || permissions.includes(item.perm);
    return true;
  });

  const activeCompanyName = session?.user?.activeCompanyName;
  const initial = activeCompanyName?.[0]?.toUpperCase() ?? 'A';
  const workspaceTitle = selfServiceOnly ? 'Employee Portal' : (activeCompanyName ?? 'Select company');
  const workspaceSubtitle = selfServiceOnly ? 'Self service' : 'AMFGI ERP';
  const homeHref = selfServiceOnly ? '/me/profile' : '/dashboard';
  const teamTooltip = selfServiceOnly ? 'Employee Portal' : (activeCompanyName ?? 'Workspace');

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-border dark:border-white/5">
        <SidebarMenu>
          {selfServiceOnly ? (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={teamTooltip}>
                <Link
                  href={homeHref}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-border/40">
                    <span aria-hidden>{initial}</span>
                  </div>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold tracking-tight">{workspaceTitle}</span>
                    <span className="truncate text-xs font-normal text-sidebar-foreground/60">{workspaceSubtitle}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" aria-hidden />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            <CompanySwitcher />
          )}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0">
        <SidebarGroup className="p-0 px-2 py-3 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:py-2">
          <SidebarGroupLabel className="px-0 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visible.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border dark:border-white/5">
        <SidebarNavUser />
        <div
          className={cn(
            'mt-1 px-0 py-1 text-center text-[11px] leading-relaxed text-sidebar-foreground/45',
            'group-data-[collapsible=icon]:hidden',
          )}
        >
          Almuraqib FGI © {new Date().getFullYear()}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
