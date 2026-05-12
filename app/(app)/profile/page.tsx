'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { ContextMenu } from '@/components/ui/ContextMenu';
import toast from 'react-hot-toast';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';
import { cn } from '@/lib/utils';

function previewSrc(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  const converted = convertGoogleDriveUrl(url.trim());
  return converted || url.trim();
}

function EmptyAvatar({ name, compact }: { name: string; compact?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center bg-linear-to-br from-emerald-500/20 to-sky-500/20 font-semibold text-foreground',
        compact ? 'text-2xl sm:text-3xl' : 'text-3xl',
      )}
    >
      {initial}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState<{ x: number; y: number } | null>(null);
  const [signatureMenu, setSignatureMenu] = useState<{ x: number; y: number } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load profile');
      const user = json.data as {
        name: string;
        email: string;
        image: string | null;
        signatureUrl: string | null;
      };
      setName(user.name);
      setImageUrl(user.image);
      setSignatureUrl(user.signatureUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadProfile();
  }, [status, loadProfile]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }

    setSavingName(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setName(json.data.name);
      await update({ name: json.data.name });
      toast.success('Name updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingName(false);
    }
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload/user-profile-image', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const url = json.data.url as string;
      setImageUrl(url);
      await update({ image: url });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSignatureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingSig(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload/user-signature', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const url = json.data.url as string;
      setSignatureUrl(url);
      await update({ signatureUrl: url });
      toast.success('Signature updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingSig(false);
    }
  };

  const avatarPreview = previewSrc(imageUrl);
  const signaturePreview = previewSrc(signatureUrl);
  const sessionName = session?.user?.name ?? name;
  const sessionEmail = session?.user?.email ?? '';
  const avatarMenuOptions = useMemo(
    () => [
      {
        label: uploadingAvatar ? 'Uploading photo...' : 'Update photo',
        action: uploadingAvatar ? undefined : () => avatarInputRef.current?.click(),
        disabled: uploadingAvatar,
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7h4l2-2h6l2 2h4v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm9 9a4 4 0 100-8 4 4 0 000 8z"
            />
          </svg>
        ),
      },
    ],
    [uploadingAvatar]
  );
  const signatureMenuOptions = useMemo(
    () => [
      {
        label: uploadingSig ? 'Uploading signature...' : 'Upload signature',
        action: uploadingSig ? undefined : () => signatureInputRef.current?.click(),
        disabled: uploadingSig,
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
        ),
      },
    ],
    [uploadingSig]
  );

  if (status === 'loading' || loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-7 w-48 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{sessionName}</span>
            {sessionEmail ? <span className="text-muted-foreground"> · {sessionEmail}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-end gap-3">
          <div className="flex flex-col items-end gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onAvatarChange}
              disabled={uploadingAvatar}
            />
            <button
              type="button"
              onClick={(event) => setAvatarMenu({ x: event.clientX, y: event.clientY })}
              onContextMenu={(event) => {
                event.preventDefault();
                setAvatarMenu({ x: event.clientX, y: event.clientY });
              }}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted text-left shadow-sm transition hover:border-primary/50 sm:h-20 sm:w-20 sm:rounded-xl"
              aria-label="Open profile photo menu"
            >
              {avatarPreview ? (
                <Image src={avatarPreview} alt="" fill className="object-cover" sizes="80px" />
              ) : (
                <EmptyAvatar name={sessionName} compact />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-foreground/80 px-1 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-background opacity-0 transition group-hover:opacity-100 sm:text-[10px]">
                Menu
              </div>
            </button>
            {uploadingAvatar ? (
              <div className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Uploading…
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Identity</p>
          <p className="mt-1 text-sm font-medium text-foreground">Session account</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Photo</p>
          <p className="mt-1 text-sm font-medium text-foreground">{avatarPreview ? 'Configured' : 'Not uploaded'}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Signature</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {signaturePreview ? 'Ready for print' : 'Not uploaded'}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-0.5 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Account details</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Keep your display identity up to date across the application.
              </p>
            </div>
            <span className="mt-2 w-fit rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:mt-0">
              Session
            </span>
          </div>
          <div className="flex flex-col gap-6 p-4 sm:p-5">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-foreground">Current identity</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{sessionName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                    <p className="mt-1 break-all text-sm text-foreground">{sessionEmail}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label htmlFor="profile-display-name" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Display name
                  </label>
                  <Input id="profile-display-name" value={name} onChange={(e) => setName(e.target.value)} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    This name is shown in the app and used for account context.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={() => void saveName()} disabled={savingName}>
                    {savingName ? 'Saving…' : 'Save name'}
                  </Button>
                  <span className="text-xs text-muted-foreground">Updates your session after save.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Print assets</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Signature on Google Drive for use in print templates.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">
              Template field: <code className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-foreground">user.signatureUrl</code>
            </p>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onSignatureChange}
                disabled={uploadingSig}
              />
              <div className="mb-3">
                <h3 className="text-xs font-semibold text-foreground">Signature</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Transparent PNG ideal · JPEG, PNG, or WebP · up to 3 MB
                </p>
              </div>
              <button
                type="button"
                onClick={(event) => setSignatureMenu({ x: event.clientX, y: event.clientY })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSignatureMenu({ x: event.clientX, y: event.clientY });
                }}
                className="group relative min-h-[160px] w-full overflow-hidden rounded-lg border border-border bg-background text-left transition hover:border-primary/40 sm:min-h-[170px]"
                aria-label="Open signature menu"
              >
                {signaturePreview ? (
                  <div className="relative h-[160px] w-full sm:h-[170px]">
                    <Image
                      src={signaturePreview}
                      alt="Signature preview"
                      fill
                      className="object-contain p-4"
                      sizes="(max-width: 768px) 100vw, 520px"
                    />
                  </div>
                ) : (
                  <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground sm:h-[170px]">
                    No signature uploaded yet
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-foreground/80 px-3 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-background opacity-0 transition group-hover:opacity-100">
                  Signature menu
                </div>
              </button>
              {uploadingSig ? (
                <div className="mt-2 w-fit rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Uploading…
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">Click or right-click the preview</p>
            </div>
          </div>
        </section>
      </div>

      {avatarMenu && (
        <ContextMenu
          x={avatarMenu.x}
          y={avatarMenu.y}
          options={avatarMenuOptions}
          onClose={() => setAvatarMenu(null)}
        />
      )}
      {signatureMenu && (
        <ContextMenu
          x={signatureMenu.x}
          y={signatureMenu.y}
          options={signatureMenuOptions}
          onClose={() => setSignatureMenu(null)}
        />
      )}
    </div>
  );
}
