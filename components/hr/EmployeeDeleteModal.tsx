'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/shadcn/button';
import type { EmployeeDeleteCheckResult } from '@/lib/hr/checkEmployeeDeleteEligibility';
import { invalidateEmployeeCaches } from '@/lib/hr/invalidateEmployeeCaches';
import { useAppDispatch } from '@/store/hooks';

export type EmployeeDeleteTarget = {
  id: string;
  fullName: string;
  employeeCode?: string | null;
};

interface EmployeeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: EmployeeDeleteTarget | null;
  onDeleted?: (employeeId: string) => void;
}

function formatLinkLine(link: EmployeeDeleteCheckResult['links'][number]) {
  const noun = link.count === 1 ? link.label.toLowerCase() : `${link.label.toLowerCase()}s`;
  return `${link.count} ${noun}`;
}

export default function EmployeeDeleteModal({
  isOpen,
  onClose,
  employee,
  onDeleted,
}: EmployeeDeleteModalProps) {
  const dispatch = useAppDispatch();
  const [check, setCheck] = useState<EmployeeDeleteCheckResult | null>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !employee) {
      setCheck(null);
      setLoadingCheck(false);
      setDeleting(false);
      return;
    }

    let cancelled = false;
    setLoadingCheck(true);
    setCheck(null);

    void (async () => {
      try {
        const res = await fetch(`/api/hr/employees/${employee.id}/check-delete`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.data) {
          setCheck(json.data as EmployeeDeleteCheckResult);
        } else if (!cancelled) {
          toast.error(json?.error ?? 'Failed to check employee dependencies');
          onClose();
        }
      } catch {
        if (!cancelled) {
          toast.error('Failed to check employee dependencies');
          onClose();
        }
      } finally {
        if (!cancelled) setLoadingCheck(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, employee, onClose]);

  if (!isOpen || !employee) return null;

  const busy = loadingCheck || deleting;

  const handleDelete = async () => {
    if (!check?.canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/hr/employees/${employee.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Failed to delete employee');
        setDeleting(false);
        return;
      }
      invalidateEmployeeCaches(dispatch);
      toast.success('Employee deleted');
      onDeleted?.(employee.id);
      onClose();
    } catch {
      toast.error('Failed to delete employee');
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50"
        aria-label="Close"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delete employee</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{employee.fullName}</h2>
          {employee.employeeCode ? (
            <p className="mt-1 font-mono text-sm text-muted-foreground">{employee.employeeCode}</p>
          ) : null}

          {loadingCheck ? (
            <p className="mt-4 text-sm text-muted-foreground">Checking linked data…</p>
          ) : check?.canDelete ? (
            <p className="mt-4 text-sm text-muted-foreground">
              This employee has no linked HR or schedule records. Deleting permanently removes the master
              record and cannot be undone.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                This employee cannot be deleted while linked data exists. Remove or reassign the linked
                records first, or mark the employee as exited instead.
              </p>
              {check && check.links.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-foreground">
                  {check.links.map((link) => (
                    <li key={link.category}>{formatLinkLine(link)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            {check?.canDelete ? (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
