'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { formatExtraFileSize } from '@/lib/hr/employeeExtraFiles';
import { readApiJson } from '@/lib/utils/readApiResponse';

type ExtraFileRow = {
  id: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  mediaUrl: string;
  createdAt: string;
};

type Props = {
  employeeId: string;
  canView: boolean;
  canCreate: boolean;
  canDelete: boolean;
};

export default function EmployeeExtraFiles({ employeeId, canView, canCreate, canDelete }: Props) {
  const [files, setFiles] = useState<ExtraFileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [viewing, setViewing] = useState<ExtraFileRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExtraFileRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/employees/${employeeId}/extra-files`, { cache: 'no-store' });
      const json = await readApiJson<{ files?: ExtraFileRow[] }>(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Failed to load extra files');
        return;
      }
      setFiles(json.data?.files ?? []);
    } finally {
      setLoading(false);
    }
  }, [canView, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    if (!canCreate || uploading || selected.length === 0) return;
    setUploading(true);
    try {
      const body = new FormData();
      for (const file of selected) body.append('files', file);
      const res = await fetch(`/api/hr/employees/${employeeId}/extra-files`, { method: 'POST', body });
      const json = await readApiJson<{ created?: ExtraFileRow[]; errors?: Array<{ fileName: string; message: string }> }>(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Upload failed');
        return;
      }
      const errors = json.data?.errors ?? [];
      if (errors.length > 0) {
        toast.error(errors.map((error) => `${error.fileName}: ${error.message}`).join('\n'));
      } else {
        toast.success('Files uploaded');
      }
      setSelected([]);
      setUploadOpen(false);
      await load();
    } finally {
      setUploading(false);
    }
  };

  const download = async (file: ExtraFileRow) => {
    const res = await fetch(`/api/hr/employees/${employeeId}/extra-files/${file.id}`);
    if (!res.ok) {
      const json = await readApiJson(res);
      toast.error(json?.error ?? 'Download failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/hr/employees/${employeeId}/extra-files/${pendingDelete.id}`, { method: 'DELETE' });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Delete failed');
        return;
      }
      setPendingDelete(null);
      setViewing((current) => (current?.id === pendingDelete.id ? null : current));
      toast.success('File removed');
      await load();
    } finally {
      setDeleting(false);
    }
  };

  if (!canView) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Extra files</h3>
          <p className="text-sm text-slate-500">Upload one or more files. The file name is saved as the document name.</p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setUploadOpen(true)}>
            Upload files
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {['Name', 'Type', 'Uploaded'].map((heading) => (
                <th
                  key={heading}
                  className="sticky top-0 z-10 border-b border-white/10 bg-slate-950 px-4 py-3 text-xs font-medium uppercase text-slate-500"
                >
                  {heading}
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-white/10 bg-slate-950 px-4 py-3 text-xs font-medium uppercase text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading files…
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No extra files yet.
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.id}>
                  <td className="border-t border-white/5 px-4 py-3 font-medium text-white">{file.fileName}</td>
                  <td className="border-t border-white/5 px-4 py-3 font-mono text-xs uppercase text-slate-300">
                    {file.extension}
                  </td>
                  <td className="border-t border-white/5 px-4 py-3 text-xs text-slate-400">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td className="border-t border-white/5 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setViewing(file)}>
                        View
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void download(file)}>
                        Download
                      </Button>
                      {canDelete ? (
                        <Button type="button" size="sm" variant="destructive" onClick={() => setPendingDelete(file)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={uploadOpen}
        onClose={() => {
          if (!uploading) {
            setUploadOpen(false);
            setSelected([]);
          }
        }}
        title="Upload files"
        description="The file name is saved as the document name. Type is taken from the file extension."
        size="lg"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                setUploadOpen(false);
                setSelected([]);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={uploading || selected.length === 0} onClick={() => void upload()}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        }
      >
        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Files</span>
          <input
            type="file"
            multiple
            disabled={uploading}
            className="block w-full text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-white"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (picked.length === 0) return;
              setSelected((current) => {
                const next = [...current];
                for (const file of picked) {
                  const alreadyAdded = next.some(
                    (item) =>
                      item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
                  );
                  if (!alreadyAdded) next.push(file);
                }
                return next;
              });
            }}
          />
        </label>
        {selected.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {selected.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  type="button"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`Remove ${file.name}`}
                  disabled={uploading}
                  onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">PDF, images, Word, Excel, CSV, or TXT. Up to 10 files, 20 MB each.</p>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.fileName ?? 'File'}
        size="md"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
            {viewing ? (
              <Button type="button" variant="secondary" onClick={() => void download(viewing)}>
                Download
              </Button>
            ) : null}
            {viewing?.mediaUrl ? (
              <Button
                type="button"
                onClick={() => window.open(viewing.mediaUrl, '_blank', 'noopener,noreferrer')}
              >
                Open
              </Button>
            ) : null}
          </>
        }
      >
        {viewing ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Name</dt>
              <dd className="mt-1 text-sm text-white">{viewing.fileName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Type</dt>
              <dd className="mt-1 font-mono text-sm uppercase text-slate-200">{viewing.extension}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Size</dt>
              <dd className="mt-1 text-sm text-slate-200">{formatExtraFileSize(viewing.sizeBytes)}</dd>
            </div>
          </dl>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title="Delete file?"
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {`Remove "${pendingDelete?.fileName ?? ''}" from this employee? This cannot be undone.`}
        </p>
      </Modal>
    </section>
  );
}
