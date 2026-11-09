'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';

import FileInput from '@/components/ui/FileInput';
import Modal from '@/components/ui/Modal';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import Spinner from '@/components/ui/Spinner';
import { groupQuotationDocuments } from '@/lib/sales/quotationDocumentList';
import { driveStoredUrlToOpenUrl } from '@/lib/utils/googleDriveUrl';
import { cn } from '@/lib/utils';
import {
  useAddQuotationDocumentMutation,
  useCreateQuotationDocumentTypeMutation,
  useRemoveQuotationDocumentTypeMutation,
  useGetQuotationDocumentsQuery,
  useRemoveQuotationDocumentMutation,
  useUpdateQuotationDocumentNoteMutation,
} from '@/store/hooks';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';
const LABEL_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function formatDocumentTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function apiError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return 'Something went wrong';
}

export default function QuotationDocumentsModal({
  salesQueryId,
  canManage,
  isOpen,
  onClose,
}: {
  salesQueryId: string;
  canManage: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  const query = useGetQuotationDocumentsQuery(salesQueryId, { skip: !isOpen });
  const [addDocument, addState] = useAddQuotationDocumentMutation();
  const [createType, createTypeState] = useCreateQuotationDocumentTypeMutation();
  const [removeType, removeTypeState] = useRemoveQuotationDocumentTypeMutation();
  const [updateNote] = useUpdateQuotationDocumentNoteMutation();
  const [removeDocument, removeState] = useRemoveQuotationDocumentMutation();
  const [adding, setAdding] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [selectedTypeName, setSelectedTypeName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; fileName: string } | null>(null);
  const [pendingRemoveType, setPendingRemoveType] = useState<{ id: string; name: string } | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);
  const [typeMenuBox, setTypeMenuBox] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
    top: number;
    bottom: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setAdding(false);
    setAddingNew(false);
    setTypeOpen(false);
    setTypeId('');
    setSelectedTypeName('');
    setNewTypeName('');
    setFile(null);
    setNote('');
    setNotes({});
    setEditingNoteId(null);
    setPendingRemove(null);
    setPendingRemoveType(null);
  }, [isOpen]);

  useEffect(() => {
    if (!adding) return;
    addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [adding]);

  useEffect(() => {
    if (!typeOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!typeMenuRef.current?.contains(event.target as Node)) setTypeOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [typeOpen]);

  useLayoutEffect(() => {
    if (!typeOpen) {
      setTypeMenuBox(null);
      return;
    }
    function placeTypeMenu() {
      const button = typeButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const bounds = (button.closest('.overflow-y-auto') ?? button.closest('[role="dialog"]'))?.getBoundingClientRect();
      const preferred = 192;
      const spaceBelow = (bounds?.bottom ?? window.innerHeight) - rect.bottom - 8;
      const spaceAbove = rect.top - (bounds?.top ?? 0) - 8;
      const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(preferred, openUp ? spaceAbove : spaceBelow));
      setTypeMenuBox({
        left: rect.left,
        width: rect.width,
        maxHeight,
        openUp,
        top: rect.bottom,
        bottom: window.innerHeight - rect.top,
      });
    }
    placeTypeMenu();
    window.addEventListener('resize', placeTypeMenu);
    window.addEventListener('scroll', placeTypeMenu, true);
    return () => {
      window.removeEventListener('resize', placeTypeMenu);
      window.removeEventListener('scroll', placeTypeMenu, true);
    };
  }, [typeOpen]);

  const types = query.data?.types ?? [];
  const groups = useMemo(() => groupQuotationDocuments(query.data?.documents ?? []), [query.data?.documents]);

  function resetAdd() {
    setAdding(false);
    setAddingNew(false);
    setTypeOpen(false);
    setTypeId('');
    setSelectedTypeName('');
    setNewTypeName('');
    setFile(null);
    setNote('');
  }

  function chooseType(id: string, name: string) {
    setTypeId(id);
    setSelectedTypeName(name);
    setTypeOpen(false);
    setAddingNew(false);
  }

  async function onSaveType() {
    if (createTypeState.isLoading) return;
    const name = newTypeName.trim();
    if (!name) {
      toast.error('Enter a document type');
      return;
    }
    try {
      const created = await createType({ id: salesQueryId, name }).unwrap();
      chooseType(created.id, created.name);
      setNewTypeName('');
      toast.success('Type saved');
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function onSubmit() {
    if (!file) {
      toast.error('Choose a file');
      return;
    }
    if (addingNew) {
      toast.error('Save the new type first');
      return;
    }
    if (!typeId) {
      toast.error('Select a document type');
      return;
    }
    const body = new FormData();
    body.set('file', file);
    body.set('typeId', typeId);
    if (note.trim()) body.set('note', note.trim());
    try {
      await addDocument({ id: salesQueryId, body }).unwrap();
      toast.success('Document added');
      resetAdd();
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  function startEditNote(id: string, current: string | null) {
    setNotes({ [id]: notes[id] ?? current ?? '' });
    setEditingNoteId(id);
  }

  function cancelEditNote(id: string) {
    setNotes((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEditingNoteId((current) => (current === id ? null : current));
  }

  async function saveNote(id: string, current: string | null) {
    const next = (notes[id] ?? current ?? '').trim();
    if (next === (current ?? '').trim() || savingNoteId) return;
    setSavingNoteId(id);
    try {
      await updateNote({ id, salesQueryId, note: next }).unwrap();
      setNotes((currentNotes) => {
        const cleared = { ...currentNotes };
        delete cleared[id];
        return cleared;
      });
      setEditingNoteId((currentId) => (currentId === id ? null : currentId));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingNoteId(null);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove || removeState.isLoading) return;
    try {
      await removeDocument({ id: pendingRemove.id, salesQueryId }).unwrap();
      toast.success('Document removed');
      setPendingRemove(null);
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  async function confirmRemoveType() {
    if (!pendingRemoveType || removeTypeState.isLoading) return;
    try {
      await removeType({ id: salesQueryId, typeId: pendingRemoveType.id }).unwrap();
      if (typeId === pendingRemoveType.id) {
        setTypeId('');
        setSelectedTypeName('');
      }
      toast.success('Type removed');
      setPendingRemoveType(null);
    } catch (error) {
      toast.error(apiError(error));
    }
  }

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (pendingRemove || pendingRemoveType) return;
        onClose();
      }}
      title="Documents"
      description="Files stay with this quotation. The latest file of each type is carried when the purchase order is received."
      size="lg"
    >
      <div className="flex flex-col gap-3">
        {query.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          groups.map((group) => (
            <section key={group.typeId} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.typeName}</h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">{group.files.length}</span>
              </div>
              <ul>
                {group.files.map((fileRow, index) => {
                  const savedNote = fileRow.note ?? '';
                  const draft = notes[fileRow.id] ?? savedNote;
                  const editing = editingNoteId === fileRow.id;
                  const dirty = draft.trim() !== savedNote.trim();
                  const saving = savingNoteId === fileRow.id;
                  return (
                    <li
                      key={fileRow.id}
                      className="grid grid-cols-[minmax(0,1fr)_3.25rem_7.5rem_max-content] items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <p className="min-w-0 truncate text-sm font-medium text-foreground" title={fileRow.fileName}>
                        {fileRow.fileName}
                      </p>
                      <span className="flex justify-center">
                        {index === 0 ? (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                            Latest
                          </Badge>
                        ) : null}
                      </span>
                      <time className="text-right text-xs tabular-nums text-muted-foreground" dateTime={fileRow.createdAt}>
                        {formatDocumentTime(fileRow.createdAt)}
                      </time>
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <a href={driveStoredUrlToOpenUrl(fileRow.viewerUrl) ?? fileRow.viewerUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                          View
                        </a>
                        <a href={`/api/sales/documents/${fileRow.id}/download`} className="font-medium text-foreground underline-offset-2 hover:underline">
                          Download
                        </a>
                        {canManage ? (
                          <button
                            type="button"
                            className="font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-60"
                            disabled={removeState.isLoading}
                            onClick={() => setPendingRemove({ id: fileRow.id, fileName: fileRow.fileName })}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {editing ? (
                        <div className="col-span-4 flex items-center gap-1.5">
                          <input
                            value={draft}
                            autoFocus
                            maxLength={500}
                            aria-label={`Note for ${fileRow.fileName}`}
                            placeholder="Add a note"
                            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                            onChange={(event) => setNotes((current) => ({ ...current, [fileRow.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                event.stopPropagation();
                                cancelEditNote(fileRow.id);
                                return;
                              }
                              if (event.key !== 'Enter' || !dirty || saving) return;
                              event.preventDefault();
                              event.stopPropagation();
                              void saveNote(fileRow.id, fileRow.note);
                            }}
                          />
                          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void saveNote(fileRow.id, fileRow.note)}>
                            {saving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => cancelEditNote(fileRow.id)}>
                            Cancel
                          </Button>
                        </div>
                      ) : canManage ? (
                        <>
                          <p className="col-span-3 line-clamp-2 min-w-0 text-xs text-muted-foreground" title={savedNote || undefined}>
                            {savedNote || 'Add note'}
                          </p>
                          <button
                            type="button"
                            className="inline-flex items-center justify-self-end gap-1 text-xs font-medium text-foreground"
                            aria-label={`Edit note for ${fileRow.fileName}`}
                            onClick={() => startEditNote(fileRow.id, fileRow.note)}
                          >
                            <Pencil className="size-3" aria-hidden="true" />
                            Edit
                          </button>
                        </>
                      ) : savedNote ? (
                        <p className="col-span-4 line-clamp-2 text-xs text-muted-foreground" title={savedNote}>
                          {savedNote}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {canManage ? (
          adding ? (
            <div ref={addPanelRef} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className={LABEL_CLASS}>Type</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAddingNew((current) => !current);
                    setTypeOpen(false);
                    setNewTypeName('');
                  }}
                >
                  {addingNew ? 'Choose existing' : 'Add new'}
                </Button>
              </div>
              {addingNew ? (
                <label className={LABEL_CLASS}>
                  New type
                  <div className="mt-1.5 flex items-stretch gap-2">
                    <input
                      value={newTypeName}
                      onChange={(event) => setNewTypeName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void onSaveType();
                      }}
                      maxLength={80}
                      className={cn(INPUT_CLASS, 'mt-0 min-w-0 flex-1')}
                    />
                    <Button type="button" className="h-auto shrink-0 self-stretch px-4" disabled={createTypeState.isLoading} onClick={() => void onSaveType()}>
                      {createTypeState.isLoading ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </label>
              ) : (
                <div ref={typeMenuRef}>
                  <button
                    ref={typeButtonRef}
                    type="button"
                    className={`${INPUT_CLASS} text-left`}
                    style={
                      typeOpen
                        ? typeMenuBox?.openUp
                          ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
                          : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                        : undefined
                    }
                    onClick={() => setTypeOpen((open) => !open)}
                  >
                    {selectedTypeName || 'Select type'}
                  </button>
                  {typeOpen && typeMenuBox ? (
                    <div
                      className={cn(
                        'type-menu-out fixed z-30 overflow-y-auto border border-border bg-background shadow-lg',
                        typeMenuBox.openUp ? 'rounded-t-md border-b-0' : 'rounded-b-md border-t-0',
                      )}
                      style={{
                        left: typeMenuBox.left,
                        width: typeMenuBox.width,
                        maxHeight: typeMenuBox.maxHeight,
                        transformOrigin: typeMenuBox.openUp ? 'bottom center' : 'top center',
                        ...(typeMenuBox.openUp ? { bottom: typeMenuBox.bottom } : { top: typeMenuBox.top }),
                      }}
                    >
                      {types.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">No types yet.</p>
                      ) : (
                        types.map((type) => (
                          <div key={type.id} className="flex items-center hover:bg-muted">
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate px-4 py-2.5 text-left text-sm text-foreground"
                              onClick={() => chooseType(type.id, type.name)}
                            >
                              {type.name}
                            </button>
                            <button
                              type="button"
                              className="mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                              aria-label={`Remove ${type.name}`}
                              onClick={() => setPendingRemoveType({ id: type.id, name: type.name })}
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              )}
              <div className={LABEL_CLASS}>
                File
                <FileInput
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.dwf,.dwfx,.dgn"
                  className={INPUT_CLASS}
                  selectedNames={file ? [file.name] : []}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <label className={LABEL_CLASS}>
                Note
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={INPUT_CLASS} />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={addState.isLoading} onClick={() => void onSubmit()}>
                  {addState.isLoading ? 'Submitting…' : 'Submit'}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={addState.isLoading} onClick={resetAdd}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
              Add document
            </Button>
          )
        ) : null}
      </div>
    </Modal>
    <Modal
      isOpen={Boolean(pendingRemove)}
      onClose={() => {
        if (!removeState.isLoading) setPendingRemove(null);
      }}
      title="Remove this file?"
      size="sm"
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={removeState.isLoading} onClick={() => setPendingRemove(null)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={removeState.isLoading} onClick={() => void confirmRemove()}>
            {removeState.isLoading ? <Spinner size="sm" /> : 'Remove'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {pendingRemove ? `${pendingRemove.fileName} will be removed from this quotation.` : null}
      </p>
    </Modal>
    <Modal
      isOpen={Boolean(pendingRemoveType)}
      onClose={() => {
        if (!removeTypeState.isLoading) setPendingRemoveType(null);
      }}
      title="Remove this type?"
      size="sm"
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={removeTypeState.isLoading} onClick={() => setPendingRemoveType(null)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={removeTypeState.isLoading} onClick={() => void confirmRemoveType()}>
            {removeTypeState.isLoading ? <Spinner size="sm" /> : 'Delete'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {pendingRemoveType ? `${pendingRemoveType.name} will be removed from the type list.` : null}
      </p>
    </Modal>
    </>
  );
}
