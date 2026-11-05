'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Bookmark,
  Copy,
  Paperclip,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  FilePlus,
} from 'lucide-react';

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { formatMoney, filsToDecimalString, parseMoney } from '@/lib/accounting/rules';
import { prepareJournalLines, type JournalLineInput } from '@/lib/accounting/posting';

type AccountOption = { id: string; name: string; parentId: string | null; isActive: boolean };
type Attachment = { id: string; fileName: string };
type JournalLine = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
  partyName: string;
  vatItem: string;
  billable: boolean;
  jobLabel: string;
};
type JournalEntry = {
  id: string;
  entryNumber: number;
  entryDate: string;
  status: 'DRAFT' | 'SAVED';
  reversedById: string | null;
  lines: Array<JournalLine & { account?: { name: string } }>;
  attachments: Attachment[];
};
type TemplateRow = { id: string; name: string };

const VAT_ITEMS = ['', 'SR 5%', 'ZR 0%', 'EX Exempt', 'OS Out of scope'];
const COLUMNS = ['account', 'debit', 'credit', 'memo', 'name', 'vat', 'bill', 'job'] as const;
type ColumnKey = (typeof COLUMNS)[number];
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  account: 220,
  debit: 110,
  credit: 110,
  memo: 180,
  name: 160,
  vat: 120,
  bill: 80,
  job: 160,
};
const WIDTH_KEY = 'amfgi-journal-column-widths';
const CELL = 'h-7 rounded-none border-0 bg-transparent px-1.5 py-0 text-xs shadow-none focus-visible:bg-background/80 focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-80';
const PICKER_CLASS = '!h-7 !rounded-none !border-0 !bg-transparent !px-1.5 !py-0 !text-xs !text-foreground !shadow-none focus:!bg-background/80 focus:!ring-1 focus:!ring-ring';

function emptyLine(): JournalLine {
  return { accountId: '', debit: '', credit: '', memo: '', partyName: '', vatItem: '', billable: false, jobLabel: '' };
}

function padLines(lines: JournalLine[]): JournalLine[] {
  const next = lines.slice();
  while (next.length < 8) next.push(emptyLine());
  return next;
}

function dateInputValue(value: string): string {
  return value.slice(0, 10);
}

function dubaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formHasWork(lines: JournalLine[]): boolean {
  return lines.some((line) => line.accountId || line.debit.trim() || line.credit.trim() || line.memo || line.partyName || line.vatItem || line.billable || line.jobLabel);
}

function journalSnapshot(date: string, rows: JournalLine[]): string {
  return JSON.stringify({
    date,
    lines: rows.map((line) => [line.accountId, line.debit, line.credit, line.memo, line.partyName, line.vatItem, line.billable, line.jobLabel]),
  });
}

type PendingLeave = { kind: 'list' } | { kind: 'new' } | { kind: 'open'; id: string } | { kind: 'clear' };

function moneyInput(value: number): string {
  if (!value) return '';
  return filsToDecimalString(Math.round(value * 100));
}

async function readJson(res: Response) {
  return res.json().catch(() => ({})) as Promise<{ error?: string; data?: unknown }>;
}

export default function JournalWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedId = searchParams.get('id') ?? '';
  const creating = searchParams.get('new') === '1';
  const viewKey = openedId ? `id:${openedId}` : creating ? 'new' : 'list';
  const [screen, setScreen] = useState<'list' | 'entry'>('list');
  const [journalRows, setJournalRows] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [lines, setLines] = useState<JournalLine[]>(padLines([]));
  const [entryDate, setEntryDate] = useState('');
  const [findQuery, setFindQuery] = useState('');
  const [found, setFound] = useState<JournalEntry[]>([]);
  const [searched, setSearched] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [showMemorised, setShowMemorised] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const findRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const saveKey = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const baselineRef = useRef(journalSnapshot('', padLines([])));
  const placeRef = useRef({ entry: null as JournalEntry | null, screen: 'list' as 'list' | 'entry', dirty: false });
  const keepDraft = useRef(false);
  const skipLeavePrompt = useRef(false);
  const [leaveAction, setLeaveAction] = useState<PendingLeave | null>(null);
  const dirty = journalSnapshot(entryDate, lines) !== baselineRef.current;
  placeRef.current = { entry, screen, dirty };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(WIDTH_KEY);
      if (stored) setWidths({ ...DEFAULT_WIDTHS, ...JSON.parse(stored) });
    } catch {
      /* ignore broken local widths */
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/accounting/accounts', { cache: 'no-store' });
    const json = await readJson(res);
    if (res.ok) setAccounts((json.data as AccountOption[]) ?? []);
  }, []);

  const applyEntry = useCallback((next: JournalEntry) => {
    const date = dateInputValue(next.entryDate);
    const nextLines = padLines(next.lines.map((line) => ({
      accountId: line.accountId,
      debit: moneyInput(Number(line.debit) || 0),
      credit: moneyInput(Number(line.credit) || 0),
      memo: line.memo ?? '',
      partyName: line.partyName ?? '',
      vatItem: line.vatItem ?? '',
      billable: Boolean(line.billable),
      jobLabel: line.jobLabel ?? '',
    })));
    baselineRef.current = journalSnapshot(date, nextLines);
    setEntry(next);
    setEntryDate(date);
    setLines(nextLines);
    saveKey.current = null;
  }, []);

  const showBlank = useCallback(async () => {
    const res = await fetch('/api/accounting/journals/next', { cache: 'no-store' });
    const json = await readJson(res);
    const data = json.data as { entryNumber?: number } | undefined;
    if (res.ok && data?.entryNumber) setNextNumber(data.entryNumber);
    else toast.error(json.error ?? 'Could not read the next entry number');
    const date = dubaiToday();
    const nextLines = padLines([]);
    baselineRef.current = journalSnapshot(date, nextLines);
    setEntry(null);
    setEntryDate(date);
    setLines(nextLines);
    saveKey.current = null;
  }, []);

  const loadJournalList = useCallback(async () => {
    const res = await fetch('/api/accounting/journals', { cache: 'no-store' });
    const json = await readJson(res);
    if (!res.ok) {
      toast.error(json.error ?? 'Could not load journals');
      return;
    }
    setJournalRows((json.data as JournalEntry[]) ?? []);
  }, []);

  useEffect(() => {
    const id = viewKey.startsWith('id:') ? viewKey.slice(3) : '';
    if (viewKey === 'new') {
      if (keepDraft.current) {
        keepDraft.current = false;
        setScreen('entry');
        void loadAccounts();
        return;
      }
      setScreen('entry');
      void loadAccounts();
      void showBlank();
      return;
    }
    if (id) {
      if (keepDraft.current) {
        keepDraft.current = false;
        setScreen('entry');
        return;
      }
      let cancelled = false;
      void (async () => {
        const res = await fetch(`/api/accounting/journals/${id}`, { cache: 'no-store' });
        const json = await readJson(res);
        if (cancelled) return;
        if (!res.ok) {
          toast.error(json.error ?? 'Could not open the entry');
          return;
        }
        applyEntry(json.data as JournalEntry);
        setShowFind(false);
        setScreen('entry');
        void loadAccounts();
      })();
      return () => {
        cancelled = true;
      };
    }
    const current = placeRef.current;
    if (!skipLeavePrompt.current && current.screen === 'entry' && current.dirty) {
      keepDraft.current = true;
      setLeaveAction({ kind: 'list' });
      router.replace(current.entry ? `/accounting/journal?id=${current.entry.id}` : '/accounting/journal?new=1');
      return;
    }
    skipLeavePrompt.current = false;
    const nextLines = padLines([]);
    baselineRef.current = journalSnapshot('', nextLines);
    setEntry(null);
    setEntryDate('');
    setLines(nextLines);
    setShowFind(false);
    setScreen('list');
    void loadJournalList();
  }, [applyEntry, loadAccounts, loadJournalList, router, showBlank, viewKey]);

  const childIds = useMemo(() => new Set(accounts.map((row) => row.parentId).filter(Boolean)), [accounts]);
  const accountItems = useMemo(
    () => accounts
      .filter((row) => (row.isActive && !childIds.has(row.id)) || lines.some((line) => line.accountId === row.id))
      .map((row) => ({
        id: row.id,
        label: row.parentId ? `— ${row.name}` : row.name,
      })),
    [accounts, childIds, lines],
  );

  const prepared = prepareJournalLines(lines);
  const locked = entry?.status === 'SAVED';
  const started = formHasWork(lines);
  const debitTotal = lines.reduce((sum, line) => {
    const parsed = parseMoney(line.debit);
    return sum + (parsed.ok ? parsed.fils : 0);
  }, 0);
  const creditTotal = lines.reduce((sum, line) => {
    const parsed = parseMoney(line.credit);
    return sum + (parsed.ok ? parsed.fils : 0);
  }, 0);

  function updateLine(index: number, patch: Partial<JournalLine>) {
    setLines((current) => {
      const next = current.slice();
      const line = { ...next[index], ...patch };
      if (patch.debit && patch.debit.trim()) line.credit = '';
      if (patch.credit && patch.credit.trim()) line.debit = '';
      next[index] = line;
      const last = next[next.length - 1];
      if (last.accountId || last.debit || last.credit) next.push(emptyLine());
      return next;
    });
  }

  function resizeStart(key: ColumnKey, event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const start = widths[key];
    const move = (mouse: globalThis.MouseEvent) => {
      const width = Math.max(72, start + mouse.clientX - startX);
      setWidths((current) => ({ ...current, [key]: width }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setWidths((current) => {
        localStorage.setItem(WIDTH_KEY, JSON.stringify(current));
        return current;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  async function save(): Promise<boolean> {
    if (locked || !prepared.ok) return false;
    setSaving(true);
    if (!saveKey.current) saveKey.current = crypto.randomUUID();
    try {
      const res = await fetch(entry ? `/api/accounting/journals/${entry.id}` : '/api/accounting/journals', {
        method: entry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryDate, idempotencyKey: saveKey.current, lines }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const saved = json.data as JournalEntry;
      applyEntry(saved);
      if (saved.id && searchParams.get('id') !== saved.id) router.replace(`/accounting/journal?id=${saved.id}`);
      toast.success('Journal saved');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runAction(path: string, success: string, body?: unknown) {
    if (!entry && !path.includes('/templates/')) {
      toast.error('Save the journal before using that action.');
      return;
    }
    const res = await fetch(path, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = await readJson(res);
    if (!res.ok) {
      toast.error(json.error ?? 'That action failed');
      return;
    }
    if (json.data && typeof json.data === 'object' && 'entryNumber' in (json.data as object)) {
      const next = json.data as JournalEntry;
      applyEntry(next);
      if (next.id) router.replace(`/accounting/journal?id=${next.id}`);
    }
    toast.success(success);
  }

  async function removeDraft() {
    if (locked) {
      toast.error('A saved entry cannot be deleted. Reverse it.');
      return;
    }
    if (!entry) {
      if (dirty) {
        setLeaveAction({ kind: 'clear' });
        return;
      }
      setLines(padLines([]));
      return;
    }
    const res = await fetch(`/api/accounting/journals/${entry.id}`, { method: 'DELETE' });
    const json = await readJson(res);
    if (!res.ok) {
      toast.error(json.error ?? 'Delete failed');
      return;
    }
    toast.success('Draft discarded');
    await showBlank();
  }

  useEffect(() => {
    if (!showFind) return;
    function onPointerDown(event: MouseEvent) {
      if (!findRef.current?.contains(event.target as Node)) setShowFind(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowFind(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showFind]);

  async function findEntries() {
    const q = findQuery.trim();
    if (!q) {
      toast.error('Type a number, account, name, or amount.');
      return;
    }
    const params = new URLSearchParams({ q });
    const res = await fetch(`/api/accounting/journals?${params.toString()}`, { cache: 'no-store' });
    const json = await readJson(res);
    if (!res.ok) {
      toast.error(json.error ?? 'Search failed');
      return;
    }
    setShowMemorised(false);
    setSearched(true);
    setFound((json.data as JournalEntry[]) ?? []);
  }

  useEffect(() => {
    if (!showFind || !findQuery.trim()) return;
    const timer = window.setTimeout(() => {
      void findEntries();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [findQuery, showFind]);

  function openEntry(id: string) {
    requestLeave({ kind: 'open', id });
  }

  function accountLabel(row: JournalEntry) {
    const names = [...new Set(row.lines.map((line) => line.account?.name).filter(Boolean))];
    return names.join(', ');
  }

  function openNewJournal() {
    router.push('/accounting/journal?new=1');
  }

  function requestLeave(action: PendingLeave) {
    if (!dirty) {
      void performLeave(action);
      return;
    }
    setLeaveAction(action);
  }

  async function performLeave(action: PendingLeave) {
    setLeaveAction(null);
    keepDraft.current = false;
    if (action.kind === 'clear') {
      await showBlank();
      return;
    }
    if (action.kind === 'new') {
      if (entry?.status === 'DRAFT') {
        const res = await fetch(`/api/accounting/journals/${entry.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const json = await readJson(res);
          toast.error(json.error ?? 'Could not discard the draft');
          return;
        }
      }
      await showBlank();
      router.push('/accounting/journal?new=1');
      return;
    }
    if (action.kind === 'open') {
      router.push(`/accounting/journal?id=${action.id}`);
      return;
    }
    returnToList();
  }

  function backToList() {
    requestLeave({ kind: 'list' });
  }

  function returnToList() {
    skipLeavePrompt.current = true;
    const nextLines = padLines([]);
    baselineRef.current = journalSnapshot('', nextLines);
    placeRef.current = { entry: null, screen: 'list', dirty: false };
    setEntry(null);
    setEntryDate('');
    setLines(nextLines);
    setShowFind(false);
    router.push('/accounting/journal');
  }

  function startNew() {
    requestLeave({ kind: 'new' });
  }

  async function startFresh() {
    await showBlank();
    router.push('/accounting/journal?new=1');
  }

  async function loadTemplates() {
    const res = await fetch('/api/accounting/templates', { cache: 'no-store' });
    const json = await readJson(res);
    if (res.ok) setTemplates((json.data as TemplateRow[]) ?? []);
  }

  function printEntry() {
    if (!entry) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!popup) return;
    const body = lines
      .filter((line) => line.accountId)
      .map((line) => {
        const name = accounts.find((row) => row.id === line.accountId)?.name ?? line.accountId;
        return `<tr><td>${name}</td><td>${line.debit}</td><td>${line.credit}</td><td>${line.memo}</td><td>${line.partyName}</td><td>${line.vatItem}</td><td>${line.jobLabel}</td></tr>`;
      })
      .join('');
    popup.document.write(`<!doctype html><title>Journal ${entry.entryNumber}</title><body style="font-family:sans-serif"><h1>Journal ${entry.entryNumber}</h1><p>${entryDate}</p><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Memo</th><th>Name</th><th>VAT item</th><th>Class</th></tr></thead><tbody>${body}</tbody></table><script>print()<\/script></body>`);
    popup.document.close();
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    if (!entry) {
      toast.error('Save the journal before attaching a file name.');
      return;
    }
    const res = await fetch(`/api/accounting/journals/${entry.id}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name }),
    });
    const json = await readJson(res);
    if (!res.ok) {
      toast.error(json.error ?? 'Could not attach the file name');
      return;
    }
    setEntry({ ...entry, attachments: [...entry.attachments, json.data as Attachment] });
    toast.success('File name stored. The file itself is not uploaded.');
  }

  const saveLabel = !dirty && entry?.status === 'SAVED' ? 'Saved' : 'Save';
  const tools: Array<{ label: string; hint: string; icon: typeof Save; onClick: () => void; disabled?: boolean }> = [
    { label: 'Find', hint: 'Search by a number, account, name, or amount.', icon: Search, onClick: () => { setFound([]); setSearched(false); setShowMemorised(false); setShowFind((open) => !open); } },
    { label: 'New', hint: 'Clear the screen. Nothing is stored until Save.', icon: FilePlus, onClick: () => void startNew() },
    {
      label: saveLabel,
      hint: saveLabel === 'Saved' ? 'This entry is saved.' : 'Store this entry only when debit equals credit.',
      icon: Save,
      onClick: () => void save(),
      disabled: !dirty || locked || !prepared.ok || saving,
    },
    { label: 'Delete', hint: 'Discard this draft. A saved entry must be reversed.', icon: Trash2, onClick: () => void removeDraft() },
    { label: 'Create a copy', hint: 'Copy the lines into a new unsaved entry dated today.', icon: Copy, onClick: () => void runAction(`/api/accounting/journals/${entry?.id}/copy`, 'Copy created. Save it to post.') },
    { label: 'Memorise', hint: 'Keep these lines as a template. Nothing is posted.', icon: Bookmark, onClick: () => void runAction(`/api/accounting/journals/${entry?.id}/memorise`, 'Entry memorised', { lines }).then(loadTemplates) },
    { label: 'Reverse', hint: 'Create the opposite entry. The original stays.', icon: RotateCcw, onClick: () => void runAction(`/api/accounting/journals/${entry?.id}/reverse`, 'Reverse draft created. Save it to post.') },
    { label: 'Print', hint: 'Print this journal entry.', icon: Printer, onClick: printEntry },
    { label: 'Attach file', hint: 'Store the file name on this entry. The file is not uploaded.', icon: Paperclip, onClick: () => fileRef.current?.click() },
  ];

  if (screen === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">General journal</h1>
            <p className="text-sm text-muted-foreground">Open a journal from the list. A new journal is stored only when you save it.</p>
          </div>
          <Button type="button" onClick={() => void openNewJournal()}>New general journal</Button>
        </div>
        <Card>
          <CardContent className="overflow-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Entry</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Accounts</th>
                </tr>
              </thead>
              <tbody>
                {journalRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={4}>No journals yet.</td>
                  </tr>
                ) : journalRows.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-b border-border/70 hover:bg-muted/60" onClick={() => openEntry(row.id)}>
                    <td className="px-3 py-2 font-medium">{row.entryNumber}</td>
                    <td className="px-3 py-2">{dateInputValue(row.entryDate)}</td>
                    <td className="px-3 py-2">{row.status === 'SAVED' ? 'Saved' : 'Draft'}</td>
                    <td className="px-3 py-2">{accountLabel(row) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">General journal</h1>
          <p className="text-sm text-muted-foreground">Nothing is stored until Save. VAT item is a label only and does not post tax.</p>
        </div>
        <Button type="button" variant="outline" onClick={backToList}>Back to list view</Button>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
          {tools.map((tool) => (
            <div key={tool.label} ref={tool.label === 'Find' ? findRef : undefined} className="relative">
              <HoverTooltip label={tool.hint}>
                <Button type="button" variant="ghost" size="sm" disabled={tool.disabled} onClick={tool.onClick}>
                  <tool.icon className="size-4" />
                  {tool.label}
                </Button>
              </HoverTooltip>
              {tool.label === 'Find' && showFind ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-2 shadow-md">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void findEntries();
                    }}
                  >
                    <Input
                      autoFocus
                      value={findQuery}
                      placeholder="Search"
                      onChange={(event) => {
                        setFindQuery(event.target.value);
                        setShowMemorised(false);
                        if (!event.target.value.trim()) {
                          setSearched(false);
                          setFound([]);
                        }
                      }}
                    />
                  </form>
                  {searched ? (
                    <ul className="mt-2 max-h-48 overflow-auto text-sm">
                      {found.length === 0 ? (
                        <li className="px-1 py-1 text-muted-foreground">No match.</li>
                      ) : found.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="w-full rounded px-1 py-1 text-left hover:bg-muted"
                            onClick={() => void openEntry(row.id)}
                          >
                            <span className="font-medium">{row.entryNumber}</span>
                            <span className="text-muted-foreground"> {dateInputValue(row.entryDate)}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[...new Set(row.lines.map((line) => line.account?.name).filter(Boolean))].join(', ') || (row.status === 'SAVED' ? 'Saved' : 'Draft')}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {showMemorised ? (
                    <ul className="mt-2 max-h-48 overflow-auto text-sm">
                      {templates.length === 0 ? <li className="px-1 py-1 text-muted-foreground">No memorised journals.</li> : null}
                      {templates.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="w-full rounded px-1 py-1 text-left hover:bg-muted"
                            onClick={() => { setShowFind(false); void runAction(`/api/accounting/templates/${row.id}/use`, 'Template opened as a draft'); }}
                          >
                            {row.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    className="mt-1 px-1 text-xs text-muted-foreground underline"
                    onClick={() => { setShowMemorised(true); setSearched(false); void loadTemplates(); }}
                  >
                    Memorised
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <input ref={fileRef} type="file" className="hidden" onChange={(event) => void attachFile(event.target.files?.[0])} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-2 py-1.5 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">Date
            <Input className="h-7 w-36 rounded-md px-2 text-xs" type="date" value={entryDate} disabled={locked} onChange={(event) => setEntryDate(event.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">Entry no.
            <Input className="h-7 w-20 rounded-md px-2 text-xs" value={entry?.entryNumber ?? nextNumber ?? ''} readOnly />
          </label>
          <p className={prepared.ok ? 'text-emerald-700 dark:text-emerald-400/90' : started ? 'text-destructive' : 'text-muted-foreground'}>
            {prepared.ok
              ? `In balance. ${formatMoney(prepared.debitFils)}`
              : prepared.error}
            {locked ? ' Saved entries are not edited.' : ''}
          </p>
        </div>
        {entry?.attachments?.length ? (
          <p className="px-3 pb-2 text-xs text-muted-foreground">Files named: {entry.attachments.map((file) => file.fileName).join(', ')}</p>
        ) : null}
        <div className="overflow-auto">
          <table className="table-fixed border-collapse text-xs" style={{ width: 32 + Object.values(widths).reduce((sum, width) => sum + width, 0) }}>
            <thead>
              <tr className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                <th className="w-8 border border-border/70 px-1 py-1 text-center font-medium">#</th>
                {([
                  ['account', 'Account'],
                  ['debit', 'Debit'],
                  ['credit', 'Credit'],
                  ['memo', 'Memo'],
                  ['name', 'Name'],
                  ['vat', 'VAT item'],
                  ['bill', 'Billable'],
                  ['job', 'Class (job)'],
                ] as Array<[ColumnKey, string]>).map(([key, label]) => (
                  <th key={key} className="relative border border-border/70 px-1.5 py-1 font-medium" style={{ width: widths[key], minWidth: widths[key] }}>
                    {label}
                    <span
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize"
                      onMouseDown={(event) => resizeStart(key, event)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className={index % 2 === 1 ? 'bg-muted/25' : ''}>
                  <td className="border border-border/70 px-1 text-center tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="border border-border/70 p-0" style={{ width: widths.account }}>
                    <SearchSelect
                      items={accountItems}
                      value={line.accountId}
                      onChange={(id) => updateLine(index, { accountId: id })}
                      openOnFocus
                      browseAllOnOpen
                      minCharactersToSearch={0}
                      placeholder=""
                      disabled={locked}
                      dropdownInPortal
                      inputProps={{ className: PICKER_CLASS }}
                    />
                  </td>
                  <td className="border border-border/70 p-0"><Input disabled={locked} className={`${CELL} text-right tabular-nums`} value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value })} /></td>
                  <td className="border border-border/70 p-0"><Input disabled={locked} className={`${CELL} text-right tabular-nums`} value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value })} /></td>
                  <td className="border border-border/70 p-0"><Input disabled={locked} className={CELL} value={line.memo} onChange={(event) => updateLine(index, { memo: event.target.value })} /></td>
                  <td className="border border-border/70 p-0"><Input disabled={locked} className={CELL} value={line.partyName} onChange={(event) => updateLine(index, { partyName: event.target.value })} /></td>
                  <td className="border border-border/70 p-0">
                    <Select disabled={locked} className={CELL} value={line.vatItem} onChange={(event) => updateLine(index, { vatItem: event.target.value })}>
                      {VAT_ITEMS.map((item) => <option key={item || 'none'} value={item}>{item || ''}</option>)}
                    </Select>
                  </td>
                  <td className="border border-border/70 p-0 text-center">
                    <input className="size-3.5 align-middle" type="checkbox" disabled={locked} checked={line.billable} onChange={(event) => updateLine(index, { billable: event.target.checked })} />
                  </td>
                  <td className="border border-border/70 p-0"><Input disabled={locked} className={CELL} value={line.jobLabel} onChange={(event) => updateLine(index, { jobLabel: event.target.value })} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td className="border border-border/70" />
                <td className="border border-border/70 px-1.5 py-1">Total</td>
                <td className="border border-border/70 px-1.5 py-1 text-right tabular-nums">{formatMoney(debitTotal)}</td>
                <td className="border border-border/70 px-1.5 py-1 text-right tabular-nums">{formatMoney(creditTotal)}</td>
                <td className="border border-border/70" colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex justify-between gap-2 border-t border-border px-2 py-2">
          <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, emptyLine()])}>Add row</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={locked} onClick={() => setLines(padLines([]))}>Clear</Button>
            <Button type="button" variant="outline" disabled={locked || !prepared.ok || saving} onClick={() => void save().then((saved) => { if (saved) void startFresh(); })}>Save & New</Button>
            <Button type="button" disabled={locked || !prepared.ok || saving} onClick={() => void save().then((saved) => { if (saved) returnToList(); })}>Save & Close</Button>
          </div>
        </div>
      </div>
      <Modal
        isOpen={leaveAction !== null}
        onClose={() => setLeaveAction(null)}
        title={leaveAction?.kind === 'clear' ? 'Discard journal' : 'Unsaved journal'}
        size="sm"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => setLeaveAction(null)}>
              {leaveAction?.kind === 'clear' ? 'Cancel' : 'Stay'}
            </Button>
            <Button type="button" variant="destructive" onClick={() => { if (leaveAction) void performLeave(leaveAction); }}>
              {leaveAction?.kind === 'clear' ? 'Discard' : 'Leave'}
            </Button>
          </>
        )}
      >
        <p className="text-sm text-foreground">
          {leaveAction?.kind === 'clear'
            ? 'Discard the changes on this journal?'
            : 'Leave this journal without saving? The changes will be lost.'}
        </p>
      </Modal>
    </div>
  );
}
