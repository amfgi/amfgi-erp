'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ChevronsUpDown } from 'lucide-react';
import { useAppDispatch } from '@/store/hooks';
import { switchActiveCompany } from '@/store/slices/companySlice';
import toast from 'react-hot-toast';
import { useGetCompaniesQuery } from '@/store/hooks';
import { appApi } from '@/store/api/appApi';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/shadcn/sidebar';

const Z_CONFIRM_BACKDROP = 6020;
const Z_CONFIRM_DIALOG = 6030;

interface Company {
  id: string;
  name: string;
  slug: string;
}

/** Sidebar team switcher (shadcn sidebar-07). */
export default function CompanySwitcher() {
  const { data: session, update } = useSession();
  const dispatch = useAppDispatch();
  const { data: companiesData = [] } = useGetCompaniesQuery();
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; targetId: string | null }>({
    show: false,
    targetId: null,
  });
  const { isMobile, setOpenMobile } = useSidebar();

  const companies: Company[] = companiesData.map((c: { id: string; name: string; slug: string }) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  const activeCompany = companies.find((c) => c.id === session?.user?.activeCompanyId);

  const targetCompany = confirmDialog.targetId
    ? companies.find((c) => c.id === confirmDialog.targetId)
    : null;

  const closeMobileIfNeeded = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSwitchConfirmed = async (companyId: string | null) => {
    setConfirmDialog({ show: false, targetId: null });
    setLoading(true);
    closeMobileIfNeeded();
    try {
      const res = await fetch('/api/session/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Switch failed');
      }
      const { data } = json;

      await update({
        activeCompanyId: data.activeCompanyId,
        activeCompanySlug: data.activeCompanySlug,
        activeCompanyName: data.activeCompanyName,
        permissions: data.permissions,
        allowedCompanyIds: data.allowedCompanyIds,
        isSuperAdmin: data.isSuperAdmin,
      });

      dispatch(
        switchActiveCompany({
          activeCompanyId: data.activeCompanyId,
          activeCompanySlug: data.activeCompanySlug,
          activeCompanyName: data.activeCompanyName,
          permissions: data.permissions,
        }),
      );

      dispatch(appApi.util.resetApiState());

      toast.success(
        data.activeCompanyName ? `Switched to ${data.activeCompanyName}` : 'Viewing all companies',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch company';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = (companyId: string | null) => {
    if (companyId === session?.user?.activeCompanyId) {
      closeMobileIfNeeded();
      return;
    }
    setConfirmDialog({ show: true, targetId: companyId });
  };

  const visibleCompanies = session?.user?.isSuperAdmin
    ? companies
    : companies.filter((c) => session?.user?.allowedCompanyIds?.includes(c.id));

  const activeCompanyName = session?.user?.activeCompanyName;
  const initial = activeCompanyName?.[0]?.toUpperCase() ?? 'A';
  const title = activeCompany?.name ?? (session?.user?.isSuperAdmin ? 'Select company' : 'No company');
  const subtitle = session?.user?.isSuperAdmin ? 'Admin' : 'Workspace';

  const companyMenu = (
    <>
      {session?.user?.isSuperAdmin && (
        <>
          <DropdownMenuLabel className="text-muted-foreground">Companies</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={loading}
            className={
              !session?.user?.activeCompanyId
                ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
                : 'cursor-pointer'
            }
            onSelect={() => handleSwitch(null)}
          >
            <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
            All companies (admin)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {visibleCompanies.map((c) => {
        const active = c.id === session?.user?.activeCompanyId;
        return (
          <DropdownMenuItem
            key={c.id}
            disabled={loading}
            className={
              active
                ? 'cursor-pointer bg-emerald-500/10 text-emerald-700 focus:bg-emerald-500/15 focus:text-emerald-800 dark:text-emerald-300 dark:focus:text-emerald-200'
                : 'cursor-pointer'
            }
            onSelect={() => handleSwitch(c.id)}
          >
            <span
              className={`mr-2 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
            />
            <span className="truncate">{c.name}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );

  const confirmPortal =
    confirmDialog.show && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50"
              style={{ zIndex: Z_CONFIRM_BACKDROP }}
              onClick={() => setConfirmDialog({ show: false, targetId: null })}
              aria-hidden
            />
            <div
              className="fixed left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-xl"
              style={{ zIndex: Z_CONFIRM_DIALOG }}
            >
              <h2 className="mb-2 text-lg font-semibold">Switch company?</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Switching to <strong className="text-foreground">{targetCompany?.name || 'Admin view'}</strong> will
                refresh all data.
                <span className="mt-2 block text-xs text-muted-foreground">
                  Materials, jobs, and customers will reload for the selected company.
                </span>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog({ show: false, targetId: null })}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSwitchConfirmed(confirmDialog.targetId)}
                  disabled={loading}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? 'Switching…' : 'Switch'}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  if (visibleCompanies.length === 0) {
    return (
      <>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild tooltip={activeCompanyName ?? 'Workspace'}>
            <Link href="/dashboard" onClick={closeMobileIfNeeded}>
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-border/40">
                <span aria-hidden>{initial}</span>  
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold tracking-tight">{title}</span>
                <span className="truncate text-xs font-normal text-sidebar-foreground/60">{subtitle}</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {confirmPortal}
      </>
    );
  }

  return (
    <>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={activeCompanyName ?? 'Switch company'}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-border/40">
                <span aria-hidden>{initial}</span>
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold tracking-tight">{title}</span>
                <span className="truncate text-xs font-normal text-sidebar-foreground/60">{subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side="right"
            align="start"
            sideOffset={8}
          >
            {companyMenu}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      {confirmPortal}
    </>
  );
}
