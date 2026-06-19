'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/shadcn/button';
import type { JobDeleteCheckResult } from '@/lib/jobs/checkJobDeleteEligibility';
import { useDeleteJobMutation, useUpdateJobMutation } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';

export type JobDeleteTarget = Pick<Job, 'id' | 'jobNumber'> & {
  parentJobId?: string | null;
};

interface JobDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobDeleteTarget | null;
  canEdit?: boolean;
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'object' &&
    (error as { data?: { error?: unknown } }).data?.error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return fallback;
}

function formatLinkLine(link: JobDeleteCheckResult['links'][number]) {
  const noun = link.count === 1 ? link.label.toLowerCase() : `${link.label.toLowerCase()}s`;
  return `${link.count} ${noun}`;
}

export default function JobDeleteModal({ isOpen, onClose, job, canEdit = false }: JobDeleteModalProps) {
  const [check, setCheck] = useState<JobDeleteCheckResult | null>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [actionLoading, setActionLoading] = useState<'delete' | 'on_hold' | 'cancel' | null>(null);

  const [deleteJob] = useDeleteJobMutation();
  const [updateJob] = useUpdateJobMutation();

  useEffect(() => {
    if (!isOpen || !job) {
      setCheck(null);
      setLoadingCheck(false);
      setActionLoading(null);
      return;
    }

    let cancelled = false;
    setLoadingCheck(true);
    setCheck(null);

    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/check-delete`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && json?.data) {
          setCheck(json.data as JobDeleteCheckResult);
        } else if (!cancelled) {
          toast.error('Failed to check job dependencies');
          onClose();
        }
      } catch {
        if (!cancelled) {
          toast.error('Failed to check job dependencies');
          onClose();
        }
      } finally {
        if (!cancelled) setLoadingCheck(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, job, onClose]);

  if (!isOpen || !job) return null;

  const isVariation = Boolean(job.parentJobId);
  const title = isVariation ? 'Delete variation' : 'Delete job';
  const busy = loadingCheck || actionLoading !== null;

  const handleDelete = async () => {
    if (!check?.canDelete) return;
    setActionLoading('delete');
    try {
      await deleteJob(job.id).unwrap();
      toast.success(isVariation ? 'Variation deleted' : 'Job deleted');
      onClose();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete job'));
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (status: 'ON_HOLD' | 'CANCELLED') => {
    setActionLoading(status === 'ON_HOLD' ? 'on_hold' : 'cancel');
    try {
      await updateJob({ id: job.id, data: { status } }).unwrap();
      toast.success(status === 'ON_HOLD' ? 'Job marked on hold' : 'Job cancelled');
      onClose();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to update job status'));
      setActionLoading(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50"
        aria-label="Close dialog"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-delete-title"
        className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-destructive">{title}</p>
        <h2 id="job-delete-title" className="mt-2 text-lg font-semibold text-foreground">
          {job.jobNumber}
        </h2>

        {loadingCheck ? (
          <p className="mt-3 text-sm text-muted-foreground">Checking linked records…</p>
        ) : check?.deleteBlockedReason === 'external_api' ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Jobs synced from an external system cannot be deleted here. Mark the job on hold or cancelled instead.
            </p>
            {canEdit ? (
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleStatusChange('ON_HOLD')}
                  disabled={busy || check.status === 'ON_HOLD'}
                >
                  {actionLoading === 'on_hold' ? 'Saving…' : 'Put on hold'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleStatusChange('CANCELLED')}
                  disabled={busy || check.status === 'CANCELLED'}
                >
                  {actionLoading === 'cancel' ? 'Saving…' : 'Cancel job'}
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}
          </>
        ) : check?.canDelete ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              No dispatch, delivery, schedule, attendance, stock, or variation records are linked. This{' '}
              {isVariation ? 'variation' : 'job'} can be removed permanently.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Close
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={busy}>
                {actionLoading === 'delete' ? 'Deleting…' : isVariation ? 'Delete variation' : 'Delete job'}
              </Button>
            </div>
          </>
        ) : check ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              This {isVariation ? 'variation' : 'job'} has linked activity and cannot be deleted.
              {check.isParent && check.links.some((link) => link.category === 'variations')
                ? ' Remove or reassign variations first, or mark the parent on hold / cancelled.'
                : ' Put it on hold or cancel it instead.'}
            </p>
            <ul className="mt-3 space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
              {check.links.map((link) => (
                <li key={link.category}>{formatLinkLine(link)}</li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Close
              </Button>
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleStatusChange('ON_HOLD')}
                    disabled={busy || check.status === 'ON_HOLD'}
                  >
                    {actionLoading === 'on_hold' ? 'Saving…' : 'Put on hold'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleStatusChange('CANCELLED')}
                    disabled={busy || check.status === 'CANCELLED'}
                  >
                    {actionLoading === 'cancel' ? 'Saving…' : isVariation ? 'Cancel variation' : 'Cancel job'}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
