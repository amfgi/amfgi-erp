'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import Spinner from '@/components/ui/Spinner';
import { jobSerialNumber, splitJobSerial } from '@/lib/jobs/jobSerial';
import { useChangeJobSerialMutation, useCheckJobSerialQuery } from '@/store/hooks';

function apiError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }
  return null;
}

export default function JobSerialModal({
  jobId,
  jobNumber,
  isOpen,
  onClose,
  onChanged,
}: {
  jobId: string;
  jobNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: (jobNumber: string) => void;
}) {
  const parts = splitJobSerial(jobNumber);
  const [serial, setSerial] = useState(parts?.serial ?? '');
  const [debounced, setDebounced] = useState(parts?.serial ?? '');
  const [changeSerial, changeState] = useChangeJobSerialMutation();
  const typed = parts ? jobSerialNumber(parts.prefix, serial) : null;
  const candidate = parts ? jobSerialNumber(parts.prefix, debounced) : null;

  useEffect(() => {
    if (!isOpen) return;
    const next = parts?.serial ?? '';
    setSerial(next);
    setDebounced(next);
  }, [isOpen, jobId, parts?.serial]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(serial), 300);
    return () => window.clearTimeout(timer);
  }, [serial]);

  const check = useCheckJobSerialQuery(
    { id: jobId, serial: debounced },
    { skip: !isOpen || !candidate },
  );
  const pending = serial !== debounced || check.isFetching || check.isLoading;
  const result = !pending && candidate && !check.isError ? check.currentData : undefined;
  const changed = Boolean(result && result.number !== jobNumber.trim());
  const canSave = Boolean(result?.available && changed && !changeState.isLoading);
  const status = check.isError ? apiError(check.error) || 'Could not check that serial' : null;

  async function onSave() {
    if (!canSave || !typed) return;
    try {
      const saved = await changeSerial({ id: jobId, serial }).unwrap();
      toast.success('Job number changed');
      onChanged?.(saved.jobNumber);
      onClose();
    } catch (error) {
      toast.error(apiError(error) || 'Could not change the job number');
    }
  }

  if (!parts) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!changeState.isLoading) onClose();
      }}
      title="Change job number"
      description="The prefix stays the same. Only the serial can change. Variations of this job follow the new number."
      size="sm"
      actions={
        <>
          <Button type="button" variant="outline" size="sm" disabled={changeState.isLoading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!canSave} onClick={() => void onSave()}>
            {changeState.isLoading ? <Spinner size="sm" /> : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-medium tabular-nums text-foreground">{parts.prefix}</span>
        <Input
          value={serial}
          inputMode="numeric"
          autoFocus
          aria-label="Job serial"
          onChange={(event) => setSerial(event.target.value.replace(/\D/g, ''))}
        />
      </div>
      <div className="mt-3 grid h-11 grid-rows-2">
        <p className="truncate text-sm tabular-nums leading-5 text-foreground">{typed ?? ''}</p>
        <p
          className={`truncate text-sm leading-5 ${
            result?.available ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
          }`}
        >
          {status ?? (result ? (result.available ? 'Number available' : 'Not available, try another') : '')}
        </p>
      </div>
    </Modal>
  );
}
