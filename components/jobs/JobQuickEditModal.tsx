'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { useGetJobByIdQuery, useUpdateJobMutation } from '@/store/hooks';
import type { Job } from '@/store/api/endpoints/jobs';

type JobStatus = Job['status'];

export type JobQuickEditTarget = Pick<Job, 'id' | 'jobNumber'>;

interface JobQuickEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: JobQuickEditTarget | null;
}

function dateInputValue(value?: string | Date | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().split('T')[0];
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

export default function JobQuickEditModal({ isOpen, onClose, job }: JobQuickEditModalProps) {
  const jobId = job?.id ?? '';
  const { data: jobDetail, isFetching } = useGetJobByIdQuery(jobId, {
    skip: !isOpen || !jobId,
  });
  const [updateJob, { isLoading: isSaving }] = useUpdateJobMutation();

  const [workProcessDetails, setWorkProcessDetails] = useState('');
  const [status, setStatus] = useState<JobStatus>('ACTIVE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!isOpen || !jobDetail) return;
    setWorkProcessDetails(jobDetail.description ?? '');
    setStatus(jobDetail.status);
    setStartDate(dateInputValue(jobDetail.startDate));
    setEndDate(dateInputValue(jobDetail.endDate));
  }, [isOpen, jobDetail]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!job) return;

    try {
      await updateJob({
        id: job.id,
        data: {
          description: workProcessDetails.trim(),
          status,
          startDate,
          endDate,
        },
      }).unwrap();
      toast.success('Job updated');
      onClose();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Failed to update job'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick edit"
      description={job ? `Update schedule fields for ${job.jobNumber}.` : undefined}
      size="md"
      actions={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="job-quick-edit-form" disabled={isSaving || isFetching || !jobDetail}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="job-quick-edit-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-quick-edit-work-process" className="text-sm font-medium text-foreground">
            Work process details
          </label>
          <textarea
            id="job-quick-edit-work-process"
            value={workProcessDetails}
            onChange={(e) => setWorkProcessDetails(e.target.value)}
            rows={4}
            disabled={isFetching}
            placeholder="Scope, phases, or site work notes"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <label htmlFor="job-quick-edit-status" className="text-sm font-medium text-foreground">
              Status
            </label>
            <Select
              id="job-quick-edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as JobStatus)}
              disabled={isFetching}
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On hold</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="job-quick-edit-start-date" className="text-sm font-medium text-foreground">
              Start date
            </label>
            <Input
              id="job-quick-edit-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isFetching}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="job-quick-edit-end-date" className="text-sm font-medium text-foreground">
              End date
            </label>
            <Input
              id="job-quick-edit-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isFetching}
            />
          </div>
        </div>

        {isFetching ? <p className="text-sm text-muted-foreground">Loading job details…</p> : null}
      </form>
    </Modal>
  );
}
