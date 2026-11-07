import { formatSerial } from '@/lib/sales/format';

export const JOB_NUMBER_MAX_LENGTH = 100;

export function splitJobSerial(jobNumber: string): { prefix: string; serial: string } | null {
  const match = jobNumber.trim().match(/^(.*-)(\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { prefix: match[1], serial: match[2] };
}

export function jobSerialNumber(prefix: string, serialDigits: string): string | null {
  if (!/^\d+$/.test(serialDigits)) return null;
  const serial = Number(serialDigits);
  if (!Number.isInteger(serial) || serial < 1) return null;
  const number = `${prefix}${formatSerial(serial)}`;
  return number.length <= JOB_NUMBER_MAX_LENGTH ? number : null;
}

export function canChangeJobSerial(
  job: { parentJobId?: string | null; source?: string | null; jobNumber?: string | null } | null | undefined,
  canEdit: boolean,
): boolean {
  if (!canEdit || !job?.jobNumber || job.parentJobId || job.source === 'EXTERNAL_API') return false;
  return splitJobSerial(job.jobNumber) !== null;
}
