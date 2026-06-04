'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import type { DocumentTemplate, ItemType } from '@/lib/types/documentTemplate';
import { ITEM_TYPE_LABELS, getItemTypeLabel } from '@/lib/utils/itemTypeFields';
import { KNOWN_ITEM_TYPES } from '@/lib/types/documentTemplate';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { NEW_PRINT_TEMPLATE_SESSION_KEY } from '@/lib/utils/printTemplateSession';
import {
  readCompanyDocumentTemplates,
  writeCompanyDocumentTemplates,
} from '@/lib/utils/companyPrintTemplates';
import { createWorkScheduleTemplateDraft } from '@/lib/utils/documentDefaults';

const SETTINGS_TABS = [
  { id: 'template', label: 'Print formats', description: 'Document layouts and defaults' },
  { id: 'drive', label: 'Drive', description: 'Global Google Drive connection and root folder' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

function TemplateMetaBadge({ isDefault, itemType }: { isDefault: boolean; itemType: string }) {
  const label = isDefault ? 'Default' : getItemTypeLabel(String(itemType));
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide',
        isDefault
          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function SettingsPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = (session?.user?.isSuperAdmin ?? false) || perms.includes('settings.manage');

  const [activeTab, setActiveTab] = useState<SettingsTabId>('template');

  const [companyPrintTemplatesRaw, setCompanyPrintTemplatesRaw] = useState<unknown>(undefined);
  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    connectedAt: string | null;
    connectedEmail: string | null;
    rootFolderId: string | null;
    rootFolderConfigured: boolean;
    rootFolderSource: 'global' | 'env' | 'none';
    oauthClientConfigured: boolean;
  } | null>(null);
  const [driveRootFolderIdDraft, setDriveRootFolderIdDraft] = useState('');
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveDisconnecting, setDriveDisconnecting] = useState(false);
  const [driveFieldUnlocked, setDriveFieldUnlocked] = useState(false);

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [newTplModal, setNewTplModal] = useState(false);
  const [newTplForm, setNewTplForm] = useState({
    name: '',
    itemType: 'delivery-note' as ItemType,
    customItemKind: '',
  });
  const [tplSaving, setTplSaving] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'api') {
      router.replace('/settings/api', { scroll: false });
      return;
    }
    if (SETTINGS_TABS.some((item) => item.id === tab)) {
      setActiveTab(tab as SettingsTabId);
    }
  }, [router, searchParams]);

  useEffect(() => {
    router.replace(`/settings?tab=${activeTab}`, { scroll: false });
  }, [activeTab, router]);

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanyPrintTemplates = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`);
        if (res.ok) {
          const data = await res.json();
          const company = data.data;
          setCompanyPrintTemplatesRaw(company.printTemplates);
          const parsedTemplates = readCompanyDocumentTemplates(company.printTemplates);
          if (parsedTemplates.length > 0) {
            setTemplates(parsedTemplates);
          } else if (company.printTemplate) {
            setTemplates([company.printTemplate]);
          } else {
            setTemplates([]);
          }
        }
      } catch (err) {
        console.error('Failed to load company print templates:', err);
      }
    };
    void loadCompanyPrintTemplates();
  }, [session?.user?.activeCompanyId]);

  const loadDriveStatus = useCallback(async () => {
    setDriveStatusLoading(true);
    try {
      const res = await fetch('/api/settings/google-drive/status', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load Google Drive status');
      setDriveStatus(json.data);
      setDriveRootFolderIdDraft(typeof json.data?.rootFolderId === 'string' ? json.data.rootFolderId : '');
      setDriveFieldUnlocked(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Google Drive status');
      setDriveStatus(null);
    } finally {
      setDriveStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'drive') return;
    void loadDriveStatus();
  }, [activeTab, loadDriveStatus]);

  useEffect(() => {
    const driveResult = searchParams.get('driveConnected');
    const driveMessage = searchParams.get('driveMessage');
    if (!driveResult) return;
    if (driveResult === 'connected') {
      toast.success(driveMessage || 'Google Drive connected');
      void loadDriveStatus();
    } else if (driveResult === 'error') {
      toast.error(driveMessage || 'Google Drive connection failed');
    }
  }, [searchParams, loadDriveStatus]);

  const handleTemplateDelete = async (index: number) => {
    if (!session?.user?.activeCompanyId) return;
    if (!window.confirm('Delete this template?')) return;

    setTplSaving(true);
    try {
      const newTemplates = templates.filter((_, i) => i !== index);
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Template deleted');
      } else {
        toast.error('Failed to delete template');
      }
    } catch {
      toast.error('Failed to delete template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleTemplateDuplicate = async (index: number) => {
    const original = templates[index];
    const duplicated: DocumentTemplate = {
      ...original,
      id: `template-${Date.now()}`,
      name: `${original.name} (Copy)`,
      isDefault: false,
    };

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const newTemplates = [...templates, duplicated];
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Template duplicated');
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch {
      toast.error('Failed to duplicate template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleSetDefault = async (index: number) => {
    const itemType = templates[index].itemType;
    const newTemplates = templates.map((t, i) => ({
      ...t,
      isDefault: t.itemType === itemType && i === index,
    }));

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Default template set');
      } else {
        toast.error('Failed to set default');
      }
    } catch {
      toast.error('Failed to set default');
    } finally {
      setTplSaving(false);
    }
  };

  const activeTabMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

  const closeNewTemplateModal = () => {
    setNewTplModal(false);
    setNewTplForm({ name: '', itemType: 'delivery-note', customItemKind: '' });
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {!canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>You do not have permission to manage settings.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings workspace</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Connect Google Drive and manage print document formats for the active company.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-2">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
                <Link
                  href="/settings/api"
                  className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  API Center
                </Link>
                <Link
                  href="/settings/email"
                  className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Email
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{activeTabMeta.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activeTabMeta.description}</p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {SETTINGS_TABS.length} sections
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Print formats</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{templates.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Saved document layouts</p>
              </div>
            </div>
          </header>

          <div className="flex flex-col gap-5">
            {activeTab === 'drive' && (
              <div className="space-y-5">
                <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h2 className="text-lg font-semibold tracking-tight text-foreground">Google Drive (Global)</h2>
                      <p className="text-sm text-muted-foreground">
                        Shared Drive connection and root folder used by all companies.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void loadDriveStatus()}
                        disabled={driveStatusLoading}
                      >
                        {driveStatusLoading ? 'Refreshing…' : 'Refresh'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          window.location.href = '/api/settings/google-drive/oauth/start';
                        }}
                      >
                        Connect Google Drive
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Connection</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {driveStatusLoading ? 'Checking…' : driveStatus?.connected ? 'Connected' : 'Not connected'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Google account</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{driveStatus?.connectedEmail || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Root folder</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {driveStatus?.rootFolderConfigured
                          ? driveStatus.rootFolderSource === 'global'
                            ? 'Configured (global setting)'
                            : 'Configured (.env fallback)'
                          : 'Not configured'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OAuth client</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {driveStatus?.oauthClientConfigured ? 'Configured' : 'Missing'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <label className="block text-sm font-medium text-foreground">Global Drive root folder ID</label>
                        <p className="text-xs text-muted-foreground">Leave empty to use `.env` fallback.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDriveFieldUnlocked((prev) => !prev)}
                      >
                        {driveFieldUnlocked ? 'Lock' : 'Edit'}
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        type="text"
                        value={driveRootFolderIdDraft}
                        onChange={(e) => setDriveRootFolderIdDraft(e.target.value)}
                        placeholder="e.g. 1AbCdEfGhIjKlMnOpQrStUvWxYz"
                        disabled={!driveFieldUnlocked}
                        className="font-mono text-xs"
                      />
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!driveFieldUnlocked || driveSaving}
                          onClick={async () => {
                            try {
                              setDriveSaving(true);
                              const res = await fetch('/api/settings/google-drive/status', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rootFolderId: driveRootFolderIdDraft.trim() }),
                              });
                              const json = await res.json();
                              if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save Drive config');
                              toast.success('Global Drive root folder saved');
                              await loadDriveStatus();
                              setDriveFieldUnlocked(false);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to save Drive config');
                            } finally {
                              setDriveSaving(false);
                            }
                          }}
                        >
                          {driveSaving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={!driveFieldUnlocked || driveSaving}
                          onClick={() => setDriveRootFolderIdDraft('')}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>

                  {!driveStatus?.oauthClientConfigured ? (
                    <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                      OAuth client is not configured. Add Google OAuth environment variables first, then reconnect.
                    </div>
                  ) : null}

                  {driveStatus?.connected ? (
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={driveDisconnecting}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              'Disconnect global Google Drive connection? Existing uploaded files will stay in Drive.',
                            )
                          )
                            return;
                          try {
                            setDriveDisconnecting(true);
                            const res = await fetch('/api/settings/google-drive/status', { method: 'DELETE' });
                            const json = await res.json();
                            if (!res.ok || !json.success) throw new Error(json.error || 'Failed to disconnect');
                            toast.success('Google Drive disconnected');
                            await loadDriveStatus();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
                          } finally {
                            setDriveDisconnecting(false);
                          }
                        }}
                      >
                        {driveDisconnecting ? 'Disconnecting…' : 'Disconnect Google Drive'}
                      </Button>
                    </div>
                  ) : null}
                </section>
              </div>
            )}

            {activeTab === 'template' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Print formats</h2>
                    <p className="text-sm text-muted-foreground">
                      Create, edit, and assign default document layouts for delivery notes and other print outputs.
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={() => setNewTplModal(true)} disabled={tplSaving}>
                    + New Template
                  </Button>
                </div>

                {templates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
                    <p className="mb-4 text-muted-foreground">No print formats saved yet.</p>
                    <Button type="button" onClick={() => setNewTplModal(true)}>
                      + New Template
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map((tpl, idx) => (
                      <div
                        key={tpl.id || `tpl-${idx}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const options: ContextMenuOption[] = [
                            {
                              label: 'Edit',
                              icon: (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              ),
                              action: () => router.push(`/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`),
                            },
                            { divider: true },
                            {
                              label: 'Duplicate',
                              icon: (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              ),
                              action: () => handleTemplateDuplicate(idx),
                            },
                            {
                              label: tpl.isDefault ? 'Unset as Default' : 'Set as Default',
                              icon: (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                                  />
                                </svg>
                              ),
                              action: () => handleSetDefault(idx),
                            },
                            { divider: true },
                            {
                              label: 'Delete',
                              icon: (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              ),
                              action: () => handleTemplateDelete(idx),
                              danger: true,
                            },
                          ];
                          openContextMenu(e.clientX, e.clientY, options);
                        }}
                      >
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-foreground">{tpl.name}</h3>
                            <TemplateMetaBadge isDefault={tpl.isDefault} itemType={String(tpl.itemType)} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{tpl.itemType}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push(`/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`)}
                          disabled={tplSaving}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Modal isOpen={newTplModal} onClose={closeNewTemplateModal} title="Create New Template">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTplForm.name.trim()) {
              toast.error('Template name is required');
              return;
            }
            const kind = newTplForm.customItemKind.trim().replace(/\s+/g, '-') || newTplForm.itemType;
            const newTemplate: DocumentTemplate =
              kind === 'work-schedule'
                ? createWorkScheduleTemplateDraft(`template-${Date.now()}`, newTplForm.name)
                : {
                    id: `template-${Date.now()}`,
                    name: newTplForm.name,
                    itemType: kind as ItemType,
                    isDefault: false,
                    pageMargins: { top: 10, right: 12, bottom: 10, left: 12 },
                    sections: [],
                    canvasMode: true,
                    canvasRects: [],
                  };
            try {
              sessionStorage.setItem(
                NEW_PRINT_TEMPLATE_SESSION_KEY,
                JSON.stringify({
                  template: newTemplate,
                  insertIndex: templates.length,
                }),
              );
            } catch {
              toast.error('Could not start editor (storage blocked).');
              return;
            }
            closeNewTemplateModal();
            router.push('/settings/print-template/edit?new=1');
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="new-template-name" className="text-sm font-medium text-foreground">
              Template name *
            </label>
            <Input
              id="new-template-name"
              type="text"
              value={newTplForm.name}
              onChange={(e) => setNewTplForm({ ...newTplForm, name: e.target.value })}
              placeholder="e.g., Delivery Note - Standard"
              autoFocus
              required
            />
          </div>
          <div className="space-y-3">
            <span className="text-sm font-medium text-foreground">Document type *</span>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {KNOWN_ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewTplForm({ ...newTplForm, itemType: type, customItemKind: '' })}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors',
                    newTplForm.itemType === type && !newTplForm.customItemKind.trim()
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                  )}
                >
                  {ITEM_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Or enter a custom document kind (slug, e.g. <code className="text-foreground">work-order</code>). Register
              fields in code with <code className="text-foreground">registerPrintItemTypeFields</code>, or the builder
              will show the merged field catalog.
            </p>
            <Input
              type="text"
              value={newTplForm.customItemKind}
              onChange={(e) => setNewTplForm({ ...newTplForm, customItemKind: e.target.value })}
              placeholder="Custom kind (optional)…"
            />
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={closeNewTemplateModal}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Create & edit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
