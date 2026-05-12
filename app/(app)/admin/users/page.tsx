'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { isEmployeeSelfServiceAccount } from '@/lib/auth/selfService';
import { cn } from '@/lib/utils';
import type { Column } from '@/components/ui/DataTable';
import type { User } from '@/store/api/adminEndpoints/users';
import {
  useGetUsersQuery,
  useGetCompaniesQuery,
  useGetRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
} from '@/store/hooks';
import toast from 'react-hot-toast';

type UserTab = 'erp' | 'self-service';
type StatusFilter = 'all' | 'active' | 'inactive';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

const selectClass =
  'h-9 w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const formSelectClass =
  'flex-1 min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

function userMatchesCompanyFilter(u: User, companyId: string): boolean {
  if (companyId === 'all') return true;
  if (u.isSuperAdmin) return true;
  if (u.activeCompanyId === companyId) return true;
  return (u.companyAccess ?? []).some((a) => a.companyId === companyId);
}

export default function AdminUsersPage() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [userTab, setUserTab] = useState<UserTab>('erp');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');

  const { data: users = [], isLoading: usersLoading } = useGetUsersQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: companies = [], isLoading: companiesInitialLoading } = useGetCompaniesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: roles = [], isLoading: rolesInitialLoading } = useGetRolesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  /** `isFetching` would flip true on background refetch and swap the whole table for a skeleton — use first-load only. */
  const dataTableLoading = usersLoading;
  const filtersDisabled = (companiesInitialLoading && companies.length === 0) || (rolesInitialLoading && roles.length === 0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [accessRows, setAccessRows] = useState<{ companyId: string; roleId: string }[]>([]);

  const counts = useMemo(() => {
    let erp = 0;
    let self = 0;
    for (const u of users) {
      if (isEmployeeSelfServiceAccount(u)) self += 1;
      else erp += 1;
    }
    return { erp, self, total: users.length };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const inTab =
        userTab === 'self-service' ? isEmployeeSelfServiceAccount(u) : !isEmployeeSelfServiceAccount(u);
      if (!inTab) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (!userMatchesCompanyFilter(u, companyFilter)) return false;
      return true;
    });
  }, [users, userTab, statusFilter, companyFilter]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setPassword('');
    setIsSuperAdmin(false);
    setAccessRows([]);
    setModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setIsSuperAdmin(u.isSuperAdmin);
    setAccessRows(
      (u.companyAccess ?? []).map((a) => ({
        companyId: a.companyId,
        roleId: a.roleId,
      })),
    );
    setModal(true);
  };

  const addAccessRow = () =>
    setAccessRows((prev) => [...prev, { companyId: companies[0]?.id ?? '', roleId: roles[0]?.id ?? '' }]);

  const removeAccessRow = (i: number) => setAccessRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateAccessRow = (i: number, field: 'companyId' | 'roleId', value: string) =>
    setAccessRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const body: Record<string, unknown> = {
      name,
      isSuperAdmin,
      companyAccess: accessRows.filter((r) => r.companyId && r.roleId),
    };
    if (!editing) body.email = email;
    if (password) body.password = password;

    try {
      if (editing) {
        await updateUser({ id: editing.id, data: body }).unwrap();
      } else {
        await createUser(body as Partial<User> & { password: string }).unwrap();
      }
      setFormLoading(false);
      toast.success(editing ? 'User updated' : 'User created');
      setModal(false);
    } catch (error) {
      setFormLoading(false);
      const message = (error as { data?: { error?: string } }).data?.error ?? 'Save failed';
      toast.error(message);
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await updateUser({ id: u.id, data: { isActive: !u.isActive } }).unwrap();
      toast.success(u.isActive ? 'User deactivated' : 'User activated');
    } catch (error) {
      const message = (error as { data?: { error?: string } }).data?.error ?? 'Update failed';
      toast.error(message);
    }
  };

  const checkClass =
    'size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'isSuperAdmin',
      header: 'Role',
      render: (u) =>
        u.isSuperAdmin ? (
          <Badge variant="default" className="font-normal">
            Super admin
          </Badge>
        ) : isEmployeeSelfServiceAccount(u) ? (
          <Badge variant="secondary" className="font-normal">
            Self-service
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            ERP user
          </Badge>
        ),
    },
    {
      key: 'companyAccess',
      header: 'Company access',
      render: (u) =>
        u.isSuperAdmin ? (
          <span className="text-xs text-muted-foreground">All companies</span>
        ) : (u.companyAccess ?? []).length ? (
          <div className="flex flex-wrap gap-1">
            {(u.companyAccess ?? []).map((a, i) => (
              <span
                key={i}
                className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                {a.company?.name} / {a.role?.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No access</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (u) =>
        u.isActive ? (
          <Badge variant="secondary" className="font-normal">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Inactive
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (u) => (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(u)}>
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={u.isActive ? 'destructive' : 'default'}
            onClick={() => void handleToggleActive(u)}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  const emptyText =
    users.length === 0 ? 'No users found.' : 'No users match the current tab and filters.';

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">User management</h1>
          <p className="text-sm text-muted-foreground">
            {counts.total} user{counts.total !== 1 ? 's' : ''} · {counts.erp} ERP · {counts.self} self-service
          </p>
        </div>
        {userTab === 'erp' ? (
          <Button type="button" size="sm" onClick={openCreate}>
            Add user
          </Button>
        ) : (
          <p className="max-w-sm text-right text-xs text-muted-foreground sm:max-w-xs">
            Portal logins are usually created from HR when an employee is linked to a user.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <div className="inline-flex w-full max-w-md rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setUserTab('erp')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
              userTab === 'erp'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ERP users ({counts.erp})
          </button>
          <button
            type="button"
            onClick={() => setUserTab('self-service')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
              userTab === 'self-service'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Self-service ({counts.self})
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="user-filter-status" className={labelClass}>
              Status
            </label>
            <select
              id="user-filter-status"
              className={selectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              disabled={usersLoading}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="user-filter-company" className={labelClass}>
              Company (access)
            </label>
            <select
              id="user-filter-company"
              className={selectClass}
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              disabled={usersLoading || filtersDisabled}
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground sm:ml-auto sm:self-center">
            Showing {filteredUsers.length} of {userTab === 'erp' ? counts.erp : counts.self} in this tab
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredUsers}
        loading={dataTableLoading}
        emptyText={emptyText}
        searchKeys={['name', 'email']}
        preferenceKey={`admin-users-${userTab}`}
      />

      <Modal
        isOpen={modal}
        onClose={() => !formLoading && setModal(false)}
        title={editing ? 'Edit user' : 'Create user'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="user-name" className={labelClass}>
                Full name <span className="text-destructive">*</span>
              </label>
              <Input id="user-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="user-email" className={labelClass}>
                Email {!editing ? <span className="text-destructive">*</span> : null}
              </label>
              <Input
                id="user-email"
                type="email"
                required={!editing}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editing}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="user-password" className={labelClass}>
                {editing ? 'New password (optional)' : 'Password'} {!editing ? <span className="text-destructive">*</span> : null}
              </label>
              <Input
                id="user-password"
                type="password"
                required={!editing}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
                autoComplete="new-password"
              />
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-3">
            <input
              type="checkbox"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              className={checkClass}
            />
            <span className="text-sm text-foreground">
              Super admin <span className="text-muted-foreground">(full access to all companies)</span>
            </span>
          </label>

          {!isSuperAdmin ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={labelClass}>Company access</span>
                <Button type="button" size="sm" variant="outline" onClick={addAccessRow}>
                  Add row
                </Button>
              </div>
              {accessRows.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No company access assigned. Use Add row to grant access.
                </p>
              ) : null}
              <div className="space-y-2">
                {accessRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.companyId}
                      onChange={(e) => updateAccessRow(i, 'companyId', e.target.value)}
                      className={formSelectClass}
                    >
                      <option value="">Select company…</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.roleId}
                      onChange={(e) => updateAccessRow(i, 'roleId', e.target.value)}
                      className={formSelectClass}
                    >
                      <option value="">Select role…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAccessRow(i)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" disabled={formLoading} onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={formLoading}>
              {formLoading ? 'Saving…' : editing ? 'Update user' : 'Create user'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
