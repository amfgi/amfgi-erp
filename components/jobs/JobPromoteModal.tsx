'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import { useGetCustomersQuery, useGetJobByIdQuery, usePromoteProvisionalJobMutation } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';
export type JobPromoteTarget = Pick<Job, 'id' | 'jobNumber' | 'customerId'> & {
  isProvisional?: boolean;
  customerName?: string | null;
};

interface JobPromoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobPromoteTarget | null;
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

export default function JobPromoteModal({ isOpen, onClose, job }: JobPromoteModalProps) {
  const jobId = job?.id ?? '';
  const { data: jobDetail, isFetching } = useGetJobByIdQuery(jobId, {
    skip: !isOpen || !jobId,
  });
  const { data: customers = [] } = useGetCustomersQuery(undefined, { skip: !isOpen });
  const [promoteJob, { isLoading: isSaving }] = usePromoteProvisionalJobMutation();

  const customerSearchItems = useMemo(
    () => customers.map((customer) => ({ id: customer.id, label: customer.name })),
    [customers],
  );

  const [jobNumber, setJobNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen || !jobDetail) return;
    setJobNumber(jobDetail.jobNumber ?? '');
    setCustomerId(jobDetail.customerId ?? '');
    setNote('');
  }, [isOpen, jobDetail]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!job) return;

    const trimmedNumber = jobNumber.trim();
    if (!trimmedNumber) {
      toast.error('Job number is required');
      return;
    }
    if (!customerId) {
      toast.error('Customer is required');
      return;
    }

    try {
      const result = await promoteJob({
        id: job.id,
        jobNumber: trimmedNumber,
        customerId,
        note: note.trim() || undefined,
      }).unwrap();
      const scheduleNote =
        result.assignmentsUpdated > 0
          ? ` Updated ${result.assignmentsUpdated} schedule row${result.assignmentsUpdated === 1 ? '' : 's'}.`
          : '';
      const variationNote =
        result.variationsUpdated > 0
          ? ` Renumbered ${result.variationsUpdated} variation${result.variationsUpdated === 1 ? '' : 's'}.`
          : '';
      toast.success(`Job number confirmed.${variationNote}${scheduleNote}`);
      onClose();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to confirm job number'));
    }
  };

  const currentNumber = job?.jobNumber ?? jobDetail?.jobNumber ?? '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm job number"
      description={
        job
          ? `Replace provisional parent ${currentNumber} with the formal job number and customer. Linked variations are renumbered automatically.`
          : undefined
      }
      size="md"
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="job-promote-form" disabled={isSaving || isFetching || !jobDetail}>
            {isSaving ? 'Saving…' : 'Confirm'}
          </Button>
        </>
      }
    >
      <form id="job-promote-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Current number: <span className="font-medium text-foreground">{currentNumber}</span>
          {jobDetail?.isProvisional && !jobDetail?.parentJobId ? (
            <span className="ml-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Provisional
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-promote-number" className="text-sm font-medium text-foreground">
            Final job number
          </label>
          <Input
            id="job-promote-number"
            value={jobNumber}
            onChange={(e) => setJobNumber(e.target.value)}
            disabled={isFetching}
            required
            placeholder="e.g. 2026-1042-A"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-promote-customer" className="text-sm font-medium text-foreground">
            Customer
          </label>
          <SearchSelect
            items={customerSearchItems}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Search customers…"
            required
            disabled={isFetching}
            openOnFocus
            minCharactersToSearch={0}
            dropdownInPortal
            inputProps={{
              id: 'job-promote-customer',
              required: true,
              className: cn(
                'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-60',
              ),
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-promote-note" className="text-sm font-medium text-foreground">
            Note (optional)
          </label>
          <textarea
            id="job-promote-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            disabled={isFetching}
            placeholder="e.g. LPO received, PM system job issued"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Variations under this parent keep their suffix and receive the new parent prefix. Schedule snapshots for the
          parent and variations are updated automatically. Stock and dispatch already use job ids.
        </p>

        {isFetching ? <p className="text-sm text-muted-foreground">Loading job details…</p> : null}
      </form>
    </Modal>
  );
}
