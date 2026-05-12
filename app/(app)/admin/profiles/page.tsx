'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import {
  useGetCompanyProfilesQuery,
  useCreateCompanyProfileMutation,
  type CompanyProfile,
} from '@/store/hooks';
import toast from 'react-hot-toast';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

const textareaClass =
  'min-h-[4.5rem] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background resize-none';

function autoSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function AdminProfilesPage() {
  const [modal, setModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const { data: profiles = [], isLoading, isError, refetch } = useGetCompanyProfilesQuery();
  const [createProfile] = useCreateCompanyProfileMutation();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  const openModal = () => {
    setName('');
    setSlug('');
    setDescription('');
    setModal(true);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await createProfile({ name, slug, description: description || undefined }).unwrap();
      toast.success('Division created');
      setModal(false);
      setName('');
      setSlug('');
      setDescription('');
    } catch (err) {
      const message = (err as { data?: { error?: string } }).data?.error ?? 'Failed to create';
      toast.error(message);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Company divisions</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Internal company profiles that partition data across the organization.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openModal}>
          Add division
        </Button>
      </header>

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load divisions</CardTitle>
            <CardDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Check your connection and try again.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {profiles.map((p: CompanyProfile) => (
            <Card key={p.id}>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <code className="block truncate font-mono text-xs text-muted-foreground">{p.slug}</code>
                  </div>
                  {p.isActive ? (
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                {p.description ? <CardDescription className="text-sm">{p.description}</CardDescription> : null}
              </CardHeader>
            </Card>
          ))}
          {profiles.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">No divisions created yet.</div>
          ) : null}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => !formLoading && setModal(false)} title="Create division">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="division-name" className={labelClass}>
              Division name <span className="text-destructive">*</span>
            </label>
            <Input
              id="division-name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(autoSlug(e.target.value));
              }}
              placeholder="Fiber Glass Work"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="division-slug" className={labelClass}>
              Slug (URL-safe) <span className="text-destructive">*</span>
            </label>
            <Input
              id="division-slug"
              required
              pattern="^[a-z0-9-]+$"
              value={slug}
              onChange={(e) => setSlug(autoSlug(e.target.value))}
              placeholder="fiber-glass-work"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="division-desc" className={labelClass}>
              Description
            </label>
            <textarea
              id="division-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={textareaClass}
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" disabled={formLoading} onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={formLoading}>
              {formLoading ? 'Creating…' : 'Create division'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
