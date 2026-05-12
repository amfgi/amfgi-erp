'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { useGetHrExpertisesQuery } from '@/store/api/endpoints/hr';

interface Row {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export default function HrExpertisesPage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view') || perms.includes('hr.employee.edit');
  const canEdit = isSA || perms.includes('hr.employee.edit');
  const { data: list = [], isLoading: loading, refetch } = useGetHrExpertisesQuery(undefined, {
    skip: !canView,
  });

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch('/api/hr/expertises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
    else {
      toast.success('Expertise created');
      setShowCreate(false);
      await refetch();
    }
    setSaving(false);
  };

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || !editing || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch(`/api/hr/expertises/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else {
      toast.success('Expertise saved');
      setEditing(null);
      await refetch();
    }
    setSaving(false);
  };

  const onDelete = async (id: string) => {
    if (!canEdit || saving || !window.confirm('Delete this expertise?')) return;
    setSaving(true);
    const res = await fetch(`/api/hr/expertises/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Expertise deleted');
      if (editing?.id === id) setEditing(null);
      await refetch();
    }
    setSaving(false);
  };

  const closeCreate = () => {
    if (!saving) setShowCreate(false);
  };
  const closeEdit = () => {
    if (!saving) setEditing(null);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Expertise catalog</CardTitle>
            <CardDescription>You do not have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="h-7 w-56 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Expertise catalog</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Skills used in employee matching and schedule suggestions.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            New expertise
          </Button>
        ) : null}
      </header>

      {showCreate && canEdit ? (
        <Modal isOpen onClose={closeCreate} title="Create expertise" size="md">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="exp-create-name" className={labelClass}>
                Name
              </label>
              <Input id="exp-create-name" name="name" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="exp-create-order" className={labelClass}>
                Sort order
              </label>
              <Input id="exp-create-order" name="sortOrder" type="number" defaultValue={0} />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked
                className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <span className="text-sm text-foreground">Active</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeCreate} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing && canEdit ? (
        <Modal isOpen onClose={closeEdit} title="Edit expertise" size="md">
          <form key={editing.id} onSubmit={onSave} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="exp-edit-name" className={labelClass}>
                Name
              </label>
              <Input id="exp-edit-name" name="name" required defaultValue={editing.name} />
            </div>
            <div className="space-y-2">
              <label htmlFor="exp-edit-order" className={labelClass}>
                Sort order
              </label>
              <Input id="exp-edit-order" name="sortOrder" type="number" defaultValue={editing.sortOrder} />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={editing.isActive}
                className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <span className="text-sm text-foreground">Active</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEdit} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? <th className="w-36 px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 4 : 3} className="px-4 py-10 text-center text-muted-foreground">
                    No expertise items yet.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{r.sortOrder}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.isActive ? 'active' : 'inactive'}</td>
                    {canEdit ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className={cn('h-auto p-0 text-destructive')}
                            onClick={() => void onDelete(r.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
