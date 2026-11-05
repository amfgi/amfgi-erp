'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight } from 'lucide-react';

import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { formatMoney } from '@/lib/accounting/rules';

type AccountTypeRow = {
  id: string;
  name: string;
  isActive: boolean;
  statementGroup?: { name: string } | null;
};

type AccountRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  note: string | null;
  isActive: boolean;
  accountTypeId: string;
  parentId: string | null;
  accountType: { name: string } | null;
  parent: { id: string; name: string } | null;
  balanceFils: number;
};

type AccountForm = {
  id: string;
  name: string;
  accountTypeId: string;
  parentId: string;
  isSub: boolean;
  code: string;
  description: string;
  note: string;
  isActive: boolean;
};

type ApiFailure = { error?: string; details?: { code?: string } };

type ReportRow = {
  id: string;
  type: string;
  date: string;
  num: number;
  name: string;
  memo: string;
  split: string;
  amountFils: number;
};

type AccountReport = {
  accountName: string;
  typeName: string;
  rows: ReportRow[];
  totalFils: number;
};

function dubaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function yearStart(today: string): string {
  return `${today.slice(0, 4)}-01-01`;
}

function reportDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function reportHeading(from: string, to: string): string {
  const format = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  return `${format(from)} through ${format(to)}`;
}

const PICKER_CLASS = '!h-9 !rounded-md !border-border !bg-background !px-3 !py-1.5 !text-sm !text-foreground focus:!ring-2 focus:!ring-ring';

const emptyAccount: AccountForm = {
  id: '',
  name: '',
  accountTypeId: '',
  parentId: '',
  isSub: false,
  code: '',
  description: '',
  note: '',
  isActive: true,
};

async function readJson(res: Response): Promise<ApiFailure & { data?: unknown }> {
  return res.json().catch(() => ({}));
}

export default function ChartOfAccounts() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedId = searchParams.get('id') ?? '';
  const [types, setTypes] = useState<AccountTypeRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsReady, setAccountsReady] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccount);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmChildren, setConfirmChildren] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reportFrom, setReportFrom] = useState(() => yearStart(dubaiToday()));
  const [reportTo, setReportTo] = useState(() => dubaiToday());
  const [report, setReport] = useState<AccountReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    const [typeRes, accountRes] = await Promise.all([
      fetch('/api/accounting/account-types', { cache: 'no-store' }),
      fetch('/api/accounting/accounts', { cache: 'no-store' }),
    ]);
    const typeJson = await readJson(typeRes);
    const accountJson = await readJson(accountRes);
    if (!typeRes.ok) toast.error(typeJson.error ?? 'Could not load account types');
    else setTypes((typeJson.data as AccountTypeRow[]) ?? []);
    if (!accountRes.ok) toast.error(accountJson.error ?? 'Could not load accounts');
    else setAccounts((accountJson.data as AccountRow[]) ?? []);
    setAccountsReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadReport = useCallback(async (accountId: string, from: string, to: string) => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/accounting/accounts/${accountId}/activity?${params.toString()}`, { cache: 'no-store' });
      const json = await readJson(res);
      if (!res.ok) {
        toast.error(json.error ?? 'Could not open the account');
        setReport(null);
        return;
      }
      setReport(json.data as AccountReport);
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openedId || !/^\d{4}-\d{2}-\d{2}$/.test(reportFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(reportTo)) return;
    const timer = window.setTimeout(() => {
      void loadReport(openedId, reportFrom, reportTo);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openedId, reportFrom, reportTo, loadReport]);

  useEffect(() => {
    if (openedId) return;
    setReport(null);
    setEditorOpen(false);
    setDeleteTarget(null);
    setConfirmChildren(false);
  }, [openedId]);

  useEffect(() => {
    if (!openedId || !accountsReady) return;
    if (accounts.some((row) => row.id === openedId)) return;
    toast.error('Account not found.');
    router.replace('/accounting/chart');
  }, [accounts, accountsReady, openedId, router]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setConfirmChildren(false);
  }, []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const typeOptions = useMemo(
    () => types.filter((row) => row.isActive || row.id === accountForm.accountTypeId).map((row) => ({
      id: row.id,
      label: row.name,
      searchText: `${row.name} ${row.statementGroup?.name ?? ''}`,
    })),
    [types, accountForm.accountTypeId],
  );
  const parentOptions = useMemo(() => {
    const blocked = new Set<string>();
    if (accountForm.id) {
      const stack = [accountForm.id];
      while (stack.length > 0) {
        const id = stack.pop();
        if (!id || blocked.has(id)) continue;
        blocked.add(id);
        for (const child of accounts) {
          if (child.parentId === id) stack.push(child.id);
        }
      }
    }
    return accounts
      .filter((row) => accountForm.accountTypeId !== '' && row.accountTypeId === accountForm.accountTypeId && !blocked.has(row.id))
      .map((row) => ({
        id: row.id,
        label: row.parentId ? `— ${row.name}` : row.name,
        searchText: row.accountType?.name ?? '',
      }));
  }, [accounts, accountForm.id, accountForm.accountTypeId]);
  const byParent = useMemo(() => {
    const map = new Map<string | null, AccountRow[]>();
    for (const account of accounts) {
      const list = map.get(account.parentId) ?? [];
      list.push(account);
      map.set(account.parentId, list);
    }
    return map;
  }, [accounts]);
  const balanceTotal = useMemo(() => {
    const cache = new Map<string, number>();
    function total(id: string): number {
      const cached = cache.get(id);
      if (cached != null) return cached;
      const account = accounts.find((row) => row.id === id);
      const sum = (account?.balanceFils ?? 0) + (byParent.get(id) ?? []).reduce((running, child) => running + total(child.id), 0);
      cache.set(id, sum);
      return sum;
    }
    for (const account of accounts) total(account.id);
    return cache;
  }, [accounts, byParent]);

  function pathName(account: AccountRow): string {
    const names = [account.name];
    let parentId = account.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = accounts.find((row) => row.id === parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(':');
  }

  function accountMatches(account: AccountRow, query: string): boolean {
    if (!query) return true;
    const code = (account.code ?? '').toLowerCase();
    return pathName(account).toLowerCase().includes(query) || code.includes(query);
  }

  function branchMatches(account: AccountRow, query: string): boolean {
    if (accountMatches(account, query)) return true;
    return (byParent.get(account.id) ?? []).some((child) => branchMatches(child, query));
  }

  const visibleRows = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    const rows: Array<{ account: AccountRow; depth: number }> = [];
    function walk(parentId: string | null, depth: number) {
      for (const account of byParent.get(parentId) ?? []) {
        if (query && !branchMatches(account, query)) continue;
        rows.push({ account, depth });
        const hasChildren = (byParent.get(account.id) ?? []).length > 0;
        if (hasChildren && (query || !collapsed.has(account.id))) walk(account.id, depth + 1);
      }
    }
    walk(null, 0);
    return rows;
  }, [appliedSearch, byParent, collapsed]);

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const opened = accounts.find((row) => row.id === openedId) ?? null;

  function openAccount(id: string) {
    setReport(null);
    router.push(`/accounting/chart?id=${id}`);
  }

  function backToList() {
    setReport(null);
    setEditorOpen(false);
    setDeleteTarget(null);
    setConfirmChildren(false);
    router.push('/accounting/chart');
  }

  function openNew() {
    setAccountForm(emptyAccount);
    setConfirmChildren(false);
    setEditorOpen(true);
  }

  function openEdit(row: AccountRow) {
    setAccountForm({
      id: row.id,
      name: row.name,
      accountTypeId: row.accountTypeId,
      parentId: row.parentId ?? '',
      isSub: Boolean(row.parentId),
      code: row.code ?? '',
      description: row.description ?? '',
      note: row.note ?? '',
      isActive: row.isActive,
    });
    setConfirmChildren(false);
    setEditorOpen(true);
  }

  async function saveAccount() {
    setSaving(true);
    try {
      const payload = {
        name: accountForm.name,
        accountTypeId: accountForm.accountTypeId,
        parentId: accountForm.isSub ? accountForm.parentId : null,
        code: accountForm.code,
        description: accountForm.description,
        note: accountForm.note,
        isActive: accountForm.isActive,
        applyToChildren: confirmChildren,
      };
      const res = await fetch(accountForm.id ? `/api/accounting/accounts/${accountForm.id}` : '/api/accounting/accounts', {
        method: accountForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await readJson(res);
      if (res.status === 409 && json.details?.code === 'CHILDREN_TYPE') {
        setConfirmChildren(true);
        toast.error(json.error ?? 'Confirm the type change for subaccounts.');
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const saved = json.data as { parentId?: string | null };
      if (accountForm.isSub && accountForm.parentId && !saved?.parentId) {
        toast.success('Account saved. The parent was cleared because the type did not match.');
      } else {
        toast.success('Account saved');
      }
      setAccountForm(emptyAccount);
      setConfirmChildren(false);
      setEditorOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await readJson(res);
      if (!res.ok) {
        toast.error(json.error ?? 'Delete failed');
        return;
      }
      toast.success('Account deleted');
      setDeleteTarget(null);
      if (deleteTarget.id === openedId) router.push('/accounting/chart');
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {openedId ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{opened ? pathName(opened) : 'Account'}</p>
              <h1 className="text-xl font-semibold text-foreground">Account QuickReport</h1>
              <p className="text-sm text-muted-foreground">{reportHeading(reportFrom, reportTo)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={backToList}>Back to list view</Button>
              <Button type="button" variant="outline" disabled={!opened} onClick={() => { if (opened) setDeleteTarget(opened); }}>Delete</Button>
              <Button type="button" disabled={!opened} onClick={() => { if (opened) openEdit(opened); }}>Edit</Button>
            </div>
          </div>
          <Card>
            <CardContent className="overflow-auto p-0">
              <div className="flex flex-wrap items-end gap-3 border-b border-border p-3">
                <label className="text-xs font-medium text-muted-foreground">From
                  <Input className="mt-1 w-40" type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} />
                </label>
                <label className="text-xs font-medium text-muted-foreground">To
                  <Input className="mt-1 w-40" type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} />
                </label>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Num</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Memo</th>
                    <th className="px-3 py-2 font-medium">Split</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reportLoading ? (
                    <tr><td className="px-3 py-6 text-muted-foreground" colSpan={7}>Loading transactions.</td></tr>
                  ) : !report || report.rows.length === 0 ? (
                    <tr><td className="px-3 py-6 text-muted-foreground" colSpan={7}>No transactions in this period.</td></tr>
                  ) : report.rows.map((row, index) => (
                    <tr key={row.id} className={`border-b border-border/70 ${index % 2 === 1 ? 'bg-muted/30' : ''}`}>
                      <td className="px-3 py-2">{row.type}</td>
                      <td className="px-3 py-2">{reportDate(row.date)}</td>
                      <td className="px-3 py-2">{row.num}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.memo}</td>
                      <td className="px-3 py-2">{row.split}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.amountFils)}</td>
                    </tr>
                  ))}
                </tbody>
                {report && !reportLoading ? (
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td className="px-3 py-2" colSpan={6}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(report.totalFils)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Chart of accounts</h1>
              <p className="text-sm text-muted-foreground">Open an account from the list. Edit is inside the account.</p>
            </div>
            <Button type="button" onClick={openNew}>New account</Button>
          </div>
          <Card>
            <CardContent className="overflow-auto p-0">
              <form
                className="flex flex-wrap items-center gap-2 border-b border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAppliedSearch(searchInput);
                }}
              >
                <Input
                  className="w-full max-w-sm"
                  value={searchInput}
                  placeholder="Look for account name or number"
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <Button type="submit">Search</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchInput('');
                    setAppliedSearch('');
                  }}
                >
                  Reset
                </Button>
              </form>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Balance total</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={4}>No accounts match.</td>
                    </tr>
                  ) : visibleRows.map(({ account, depth }, index) => {
                    const children = byParent.get(account.id) ?? [];
                    return (
                      <tr
                        key={account.id}
                        className={`cursor-pointer border-b border-border/70 hover:bg-muted/60 ${index % 2 === 1 ? 'bg-muted/30' : ''}`}
                        onClick={() => openAccount(account.id)}
                      >
                        <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 20 }}>
                          <span className="inline-flex items-center gap-1">
                            {children.length > 0 ? (
                              <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                                aria-label={collapsed.has(account.id) ? 'Expand' : 'Collapse'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleCollapsed(account.id);
                                }}
                              >
                                {collapsed.has(account.id) ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                              </button>
                            ) : (
                              <span className="inline-block size-4" />
                            )}
                            <span>{pathName(account)}{account.isActive ? '' : ' (inactive)'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2">{account.accountType?.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(balanceTotal.get(account.id) ?? 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(account.balanceFils ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <Modal
        isOpen={editorOpen}
        onClose={closeEditor}
        title={accountForm.id ? 'Edit account' : 'New account'}
        description="A subaccount uses the same type as the account it sits under."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveAccount()}>Save</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="block text-sm text-muted-foreground">Account name
            <Input className="mt-1" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
          </label>
          <div className="text-sm text-muted-foreground">Account type
            <div className="mt-1">
              <SearchSelect
                items={typeOptions}
                value={accountForm.accountTypeId}
                onChange={(id) => {
                  setConfirmChildren(false);
                  setAccountForm({ ...accountForm, accountTypeId: id, parentId: '' });
                }}
                openOnFocus
                browseAllOnOpen
                minCharactersToSearch={0}
                placeholder="Choose a type"
                dropdownInPortal
                inputProps={{ className: PICKER_CLASS }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={accountForm.isSub}
              onChange={(event) => setAccountForm({ ...accountForm, isSub: event.target.checked, parentId: event.target.checked ? accountForm.parentId : '' })}
            />
            Subaccount of
          </label>
          {accountForm.isSub ? (
            <SearchSelect
              items={parentOptions}
              value={accountForm.parentId}
              onChange={(id) => setAccountForm({ ...accountForm, parentId: id })}
              openOnFocus
              browseAllOnOpen
              minCharactersToSearch={0}
              placeholder={accountForm.accountTypeId ? 'Parent account' : 'Choose a type first'}
              dropdownInPortal
              inputProps={{ className: PICKER_CLASS, autoFocus: true }}
              renderItem={(item) => (
                <span className="flex items-center justify-between gap-3">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.searchText}</span>
                </span>
              )}
            />
          ) : null}
          <label className="block text-sm text-muted-foreground">Account number
            <Input className="mt-1" value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} placeholder="Optional" />
          </label>
          <label className="block text-sm text-muted-foreground">Description
            <Input className="mt-1" value={accountForm.description} onChange={(event) => setAccountForm({ ...accountForm, description: event.target.value })} />
          </label>
          <label className="block text-sm text-muted-foreground">Note
            <Input className="mt-1" value={accountForm.note} onChange={(event) => setAccountForm({ ...accountForm, note: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={accountForm.isActive} onChange={(event) => setAccountForm({ ...accountForm, isActive: event.target.checked })} />
            Active
          </label>
          {confirmChildren ? (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Saving will apply this type to the subaccounts. Save again to confirm.</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title="Delete account"
        size="sm"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={closeDelete}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirmDelete()}>Delete</Button>
          </>
        )}
      >
        <p className="text-sm text-foreground">Delete {deleteTarget?.name}? An account used on a journal, or one that still has subaccounts, stays in the list.</p>
      </Modal>
    </div>
  );
}
