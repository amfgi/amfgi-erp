'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';

const LINK_KIND_LABEL: Record<string, string> = {
  USER_PROFILE_IMAGE: 'Profile photo',
  USER_SIGNATURE: 'Signature',
};

type MediaRow = {
  id: string;
  fileUrl: string;
  previewUrl: string | null;
  mimeType: string;
  fileName: string;
  category: string;
  bytes: number | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string } | null;
  linkCount: number;
  links: { kind: string; entityId: string }[];
};

function formatBytes(value: number | null): string {
  if (value == null || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function usageSummary(row: MediaRow): string {
  if (row.linkCount === 0) return 'Not linked';
  return row.links.map((link) => LINK_KIND_LABEL[link.kind] ?? link.kind).join(' · ');
}

function LinkStatusBadge({ linked }: { linked: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide',
        linked
          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          : 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100',
      )}
    >
      {linked ? 'In use' : 'Unlinked'}
    </Badge>
  );
}

export function MediaLibraryPanel() {
  const { data: session, status } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canManage = isSA || perms.includes('settings.manage');

  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [qDraft, setQDraft] = useState('');
  const [qApplied, setQApplied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (category.trim()) sp.set('category', category.trim());
      if (orphansOnly) sp.set('orphansOnly', '1');
      if (qApplied.trim()) sp.set('q', qApplied.trim());
      const res = await fetch(`/api/media?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load media');
      setRows(json.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load media');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [category, orphansOnly, qApplied]);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    void load();
  }, [status, canManage, load]);

  const stats = useMemo(() => {
    const total = rows.length;
    const inUse = rows.filter((r) => r.linkCount > 0).length;
    const unused = total - inUse;
    const bytesTotal = rows.reduce((acc, r) => acc + (typeof r.bytes === 'number' && r.bytes > 0 ? r.bytes : 0), 0);
    return { total, inUse, unused, bytesTotal };
  }, [rows]);

  if (status === 'loading') {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Loading media library…
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Media library</CardTitle>
          <CardDescription>You do not have permission to manage settings for this company.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Files</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{stats.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">Matching current filters</p>
        </div>
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">In use</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">{stats.inUse}</p>
          <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">Linked to users or records</p>
        </div>
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-900 dark:text-amber-100">Unlinked</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-950 dark:text-amber-50">{stats.unused}</p>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">No active references</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setQApplied(qDraft.trim());
                }}
                placeholder="File name contains…"
              />
            </div>
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Category</span>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. profile_image"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
              <input
                type="checkbox"
                className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                checked={orphansOnly}
                onChange={(e) => setOrphansOnly(e.target.checked)}
              />
              <span className="text-sm font-medium text-foreground">Unlinked only</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={() => setQApplied(qDraft.trim())} disabled={loading}>
              Apply filters
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
        {stats.bytesTotal > 0 && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Approximate visible size:{' '}
            <span className="font-medium text-foreground">{formatBytes(stats.bytesTotal)}</span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-lg border border-border bg-muted/40"
            >
              <div className="aspect-4/3 bg-muted" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
          <p className="text-base font-medium text-foreground">No files match these filters</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Try clearing search or category, or turn off “Unlinked only” to see everything in the library.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <div className="relative aspect-4/3 bg-muted">
                {row.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs font-medium text-muted-foreground">
                    No preview
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <LinkStatusBadge linked={row.linkCount > 0} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={row.fileName}>
                  {row.fileName}
                </p>
                <p className="text-xs text-muted-foreground">{row.mimeType}</p>
                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{formatBytes(row.bytes)}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span>{row.category || '—'}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{usageSummary(row)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                  {row.uploadedBy ? ` · ${row.uploadedBy.name || row.uploadedBy.email}` : ''}
                </p>
                <a
                  href={row.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open in new tab →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
