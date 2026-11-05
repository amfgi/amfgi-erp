'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import SearchSelect from '@/components/ui/SearchSelect';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import {
  contraExplanation,
  oppositeSide,
} from '@/lib/accounting/rules';
import type { AccountNormalSide, FinancialStatementSection } from '@prisma/client';

type StatementGroupRow = {
  id: string;
  name: string;
  normalSide: AccountNormalSide;
  reportsOn: FinancialStatementSection;
};

type AccountTypeRow = {
  id: string;
  name: string;
  statementGroupId: string;
  increaseSide: AccountNormalSide;
  isActive: boolean;
  statementGroup: StatementGroupRow;
};

type ApiFailure = { error?: string; details?: { code?: string } };

async function readJson(res: Response): Promise<ApiFailure & { data?: unknown }> {
  return res.json().catch(() => ({}));
}

const PICKER_CLASS = '!h-9 !rounded-md !border-border !bg-background !px-3 !py-1.5 !text-sm !text-foreground focus:!ring-2 focus:!ring-ring';

const emptyType = {
  id: '',
  name: '',
  statementGroupId: '',
  increaseSide: 'CREDIT' as AccountNormalSide,
  isActive: true,
};

const emptyGroup = {
  id: '',
  name: '',
  normalSide: 'DEBIT' as AccountNormalSide,
  reportsOn: 'BALANCE_SHEET' as FinancialStatementSection,
};

function reportsLabel(value: FinancialStatementSection) {
  return value === 'BALANCE_SHEET' ? 'Balance sheet' : 'Profit and loss';
}

export default function AccountsSettings() {
  const [tab, setTab] = useState<'groups' | 'types'>('types');
  const [groups, setGroups] = useState<StatementGroupRow[]>([]);
  const [types, setTypes] = useState<AccountTypeRow[]>([]);
  const [typeForm, setTypeForm] = useState(emptyType);
  const [confirmContra, setConfirmContra] = useState(false);
  const [confirmGroup, setConfirmGroup] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [confirmReportsOn, setConfirmReportsOn] = useState(false);
  const [confirmNormalSide, setConfirmNormalSide] = useState(false);
  const [editorKind, setEditorKind] = useState<'group' | 'type' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'group' | 'type'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const closeEditor = useCallback(() => setEditorKind(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const load = useCallback(async () => {
    const [groupRes, typeRes] = await Promise.all([
      fetch('/api/accounting/statement-groups', { cache: 'no-store' }),
      fetch('/api/accounting/account-types', { cache: 'no-store' }),
    ]);
    const groupJson = await readJson(groupRes);
    const typeJson = await readJson(typeRes);
    if (!groupRes.ok) toast.error(groupJson.error ?? 'Could not load statement groups');
    else setGroups((groupJson.data as StatementGroupRow[]) ?? []);
    if (!typeRes.ok) toast.error(typeJson.error ?? 'Could not load account types');
    else setTypes((typeJson.data as AccountTypeRow[]) ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedGroup = groups.find((row) => row.id === typeForm.statementGroupId);
  const contraText = selectedGroup
    ? contraExplanation(selectedGroup.name, selectedGroup.normalSide, typeForm.increaseSide)
    : null;
  const groupOptions = useMemo(
    () => groups.map((row) => ({
      id: row.id,
      label: row.name,
      searchText: `${row.name} ${reportsLabel(row.reportsOn)}`,
    })),
    [groups],
  );
  async function saveType() {
    setSaving(true);
    try {
      const payload = {
        name: typeForm.name,
        statementGroupId: typeForm.statementGroupId,
        increaseSide: typeForm.increaseSide,
        isActive: typeForm.isActive,
        confirmContra,
        confirmStatementGroup: confirmGroup,
      };
      const res = await fetch(typeForm.id ? `/api/accounting/account-types/${typeForm.id}` : '/api/accounting/account-types', {
        method: typeForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await readJson(res);
      if (res.status === 409 && json.details?.code === 'CONTRA_CONFIRM') {
        setConfirmContra(true);
        toast.error(json.error ?? 'Confirm the contra account.');
        return;
      }
      if (res.status === 409 && json.details?.code === 'STATEMENT_GROUP_CONFIRM') {
        setConfirmGroup(true);
        toast.error(json.error ?? 'Confirm the statement group change.');
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      toast.success('Account type saved');
      setTypeForm(emptyType);
      setConfirmContra(false);
      setConfirmGroup(false);
      setEditorKind(null);
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
      const res = await fetch(
        deleteTarget.kind === 'group'
          ? `/api/accounting/statement-groups/${deleteTarget.id}`
          : `/api/accounting/account-types/${deleteTarget.id}`,
        { method: 'DELETE' },
      );
      const json = await readJson(res);
      if (!res.ok) {
        toast.error(json.error ?? 'Delete failed');
        return;
      }
      toast.success(deleteTarget.kind === 'group' ? 'Statement group deleted' : 'Account type deleted');
      setDeleteTarget(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveGroup() {
    setSaving(true);
    try {
      const payload = {
        name: groupForm.name,
        normalSide: groupForm.normalSide,
        reportsOn: groupForm.reportsOn,
        confirmReportsOn,
        confirmNormalSide,
      };
      const res = await fetch(groupForm.id ? `/api/accounting/statement-groups/${groupForm.id}` : '/api/accounting/statement-groups', {
        method: groupForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await readJson(res);
      if (res.status === 409 && json.details?.code === 'REPORTS_ON_CONFIRM') {
        setConfirmReportsOn(true);
        toast.error(json.error ?? 'Confirm where this group reports.');
        return;
      }
      if (res.status === 409 && json.details?.code === 'NORMAL_SIDE_CONFIRM') {
        setConfirmNormalSide(true);
        toast.error(json.error ?? 'Confirm the normal side change.');
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      toast.success('Statement group saved');
      setGroupForm(emptyGroup);
      setConfirmReportsOn(false);
      setConfirmNormalSide(false);
      setEditorKind(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function showGroups() {
    setTab('groups');
    setEditorKind(null);
    setDeleteTarget(null);
  }

  function showTypes() {
    setTab('types');
    setEditorKind(null);
    setDeleteTarget(null);
  }

  function openNewGroup() {
    setGroupForm(emptyGroup);
    setConfirmReportsOn(false);
    setConfirmNormalSide(false);
    setEditorKind('group');
  }

  function openNewType() {
    setTypeForm(emptyType);
    setConfirmContra(false);
    setConfirmGroup(false);
    setEditorKind('type');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Accounts</h1>
        <p className="text-sm text-muted-foreground">Statement groups and account types. Create accounts under Accounting → Chart of accounts.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={tab === 'groups' ? 'default' : 'outline'} onClick={showGroups}>Statement groups</Button>
          <Button type="button" variant={tab === 'types' ? 'default' : 'outline'} onClick={showTypes}>Account types</Button>
        </div>
        {tab === 'groups' ? (
          <Button type="button" onClick={openNewGroup}>New statement group</Button>
        ) : (
          <Button type="button" onClick={openNewType}>New account type</Button>
        )}
      </div>

      {tab === 'groups' ? (
        <Card>
          <CardContent className="overflow-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Normal side</th>
                  <th className="px-3 py-2 font-medium">Reports on</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {groups.map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.normalSide === 'DEBIT' ? 'Debit' : 'Credit'}</td>
                    <td className="px-3 py-2">{reportsLabel(row.reportsOn)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setGroupForm(row); setConfirmReportsOn(false); setConfirmNormalSide(false); setEditorKind('group'); }}>Edit</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget({ kind: 'group', id: row.id, name: row.name })}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Money in</th>
                  <th className="px-3 py-2 font-medium">Money out</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {types.map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-3 py-2">{row.name}{row.isActive ? '' : ' (inactive)'}</td>
                    <td className="px-3 py-2">{row.statementGroup?.name}</td>
                    <td className="px-3 py-2">{row.increaseSide === 'DEBIT' ? 'Debit' : 'Credit'}</td>
                    <td className="px-3 py-2">{oppositeSide(row.increaseSide) === 'DEBIT' ? 'Debit' : 'Credit'}</td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setTypeForm({ id: row.id, name: row.name, statementGroupId: row.statementGroupId, increaseSide: row.increaseSide, isActive: row.isActive }); setConfirmContra(false); setConfirmGroup(false); setEditorKind('type'); }}>Edit</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget({ kind: 'type', id: row.id, name: row.name })}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Modal
        isOpen={editorKind === 'group'}
        onClose={closeEditor}
        title={groupForm.id ? 'Edit statement group' : 'New statement group'}
        description="Account types pick a group from this list."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveGroup()}>Save</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="block text-sm text-muted-foreground">Statement group name
            <Input className="mt-1" value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} />
          </label>
          <label className="block text-sm text-muted-foreground">Normal increase side
            <Select
              className="mt-1"
              value={groupForm.normalSide}
              onChange={(event) => {
                setConfirmNormalSide(false);
                setGroupForm({ ...groupForm, normalSide: event.target.value as AccountNormalSide });
              }}
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">A normal account in this group increases on this side. Changing it does not rewrite saved journals.</p>
          <label className="block text-sm text-muted-foreground">Reports on
            <Select
              className="mt-1"
              value={groupForm.reportsOn}
              onChange={(event) => {
                setConfirmReportsOn(false);
                setGroupForm({ ...groupForm, reportsOn: event.target.value as FinancialStatementSection });
              }}
            >
              <option value="BALANCE_SHEET">Balance sheet</option>
              <option value="PROFIT_AND_LOSS">Profit and loss</option>
            </Select>
          </label>
          {confirmReportsOn ? <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Saving will move account types in this group between the balance sheet and profit and loss. Save again to confirm.</p> : null}
          {confirmNormalSide ? <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Saving will not change posted amounts. Types that no longer match this side become contra accounts. Save again to confirm.</p> : null}
        </div>
      </Modal>

      <Modal
        isOpen={editorKind === 'type'}
        onClose={closeEditor}
        title={typeForm.id ? 'Edit account type' : 'New account type'}
        description="When money going out is always the opposite side."
        actions={(
          <>
            <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveType()}>Save</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <label className="block text-sm text-muted-foreground">Account type name
            <Input className="mt-1" value={typeForm.name} onChange={(event) => setTypeForm({ ...typeForm, name: event.target.value })} />
          </label>
          <div className="text-sm text-muted-foreground">Statement group
            <div className="mt-1">
              <SearchSelect
                items={groupOptions}
                value={typeForm.statementGroupId}
                onChange={(id) => {
                  const group = groups.find((row) => row.id === id);
                  setConfirmContra(false);
                  setConfirmGroup(false);
                  setTypeForm({
                    ...typeForm,
                    statementGroupId: id,
                    increaseSide: group?.normalSide ?? typeForm.increaseSide,
                  });
                }}
                openOnFocus
                browseAllOnOpen
                minCharactersToSearch={0}
                placeholder="Choose a statement group"
                dropdownInPortal
                inputProps={{ className: PICKER_CLASS }}
              />
            </div>
            <button type="button" className="mt-1 text-xs underline" onClick={showGroups}>Create or edit statement groups</button>
          </div>
          <label className="block text-sm text-muted-foreground">When money going in
            <Select
              className="mt-1"
              value={typeForm.increaseSide}
              onChange={(event) => {
                setConfirmContra(false);
                setTypeForm({ ...typeForm, increaseSide: event.target.value as AccountNormalSide });
              }}
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">This is the side that increases this account, not the company’s cash.</p>
          <label className="block text-sm text-muted-foreground">When money going out
            <Select className="mt-1" value={oppositeSide(typeForm.increaseSide)} disabled>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </Select>
          </label>
          {contraText ? <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{contraText}</p> : null}
          {confirmGroup ? <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Saving will move this type between the balance sheet and profit and loss. Save again to confirm.</p> : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={typeForm.isActive} onChange={(event) => setTypeForm({ ...typeForm, isActive: event.target.checked })} />
            Active
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title={deleteTarget?.kind === 'group' ? 'Delete statement group' : 'Delete account type'}
        size="sm"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={closeDelete}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirmDelete()}>Delete</Button>
          </>
        )}
      >
        <p className="text-sm text-foreground">
          Delete {deleteTarget?.name}? A group that still has account types, or a type that still has accounts, stays in the list.
        </p>
      </Modal>
    </div>
  );
}
