'use client';

import { useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import HalfHourTimePicker from '@/components/hr/HalfHourTimePicker';
import { snapMinuteToHalfHour } from '@/lib/hr/halfHourTime';
import { cn } from '@/lib/utils';

export const TIME_ENTRY_FLAT_INPUT_CLASS =
  'h-full w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50';

export function formatTimeForDisplay(timeVal: string): string {
  if (!/^\d{2}:\d{2}$/.test(timeVal)) return timeVal;
  const [hoursRaw, minutesRaw] = timeVal.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeVal;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function parseFlexibleTimeInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/\s+/g, '').replace(/\./g, ':');
  const meridiemMatch = normalized.match(/[ap]/);
  const meridiem = meridiemMatch?.[0] ?? null;
  const numericPart = normalized.replace(/[^0-9:]/g, '');
  if (!numericPart) return null;

  let hours: number | null = null;
  let minutes = 0;

  if (numericPart.includes(':')) {
    const [hourPart, minutePart] = numericPart.split(':');
    if (!hourPart || minutePart == null || minutePart === '') return null;
    hours = Number(hourPart);
    minutes = Number(minutePart);
  } else if (/^\d{3,4}$/.test(numericPart)) {
    const padded = numericPart.padStart(4, '0');
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2, 4));
  } else if (/^\d{1,2}$/.test(numericPart)) {
    hours = Number(numericPart);
    minutes = 0;
  }

  if (hours == null || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    let hours24 = hours % 12;
    if (meridiem === 'p') hours24 += 12;
    minutes = snapMinuteToHalfHour(minutes);
    return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (numericPart.includes(':')) {
    if (hours < 0 || hours > 23) return null;
    minutes = snapMinuteToHalfHour(minutes);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (numericPart.length >= 3) {
    if (hours < 0 || hours > 23) return null;
    minutes = snapMinuteToHalfHour(minutes);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

type TimeEntryInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showHalfHourPicker?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'disabled' | 'className' | 'type'>;

export default function TimeEntryInput({
  value,
  onChange,
  disabled,
  className,
  showHalfHourPicker = true,
  onKeyDown,
  onFocus,
  onBlur,
  ...inputProps
}: TimeEntryInputProps) {
  const [rawValue, setRawValue] = useState(value ? formatTimeForDisplay(value) : '');
  const [isEditing, setIsEditing] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const displayValue = isEditing ? rawValue : value ? formatTimeForDisplay(value) : '';

  const commitValue = () => {
    const parsed = parseFlexibleTimeInput(rawValue);
    if (parsed == null) {
      if (rawValue.trim()) setIsInvalid(true);
      return;
    }
    setIsInvalid(false);
    setIsEditing(false);
    onChange(parsed);
    setRawValue(parsed ? formatTimeForDisplay(parsed) : '');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsInvalid(false);
      setIsEditing(false);
      setRawValue(value ? formatTimeForDisplay(value) : '');
      e.currentTarget.blur();
    }
    onKeyDown?.(e);
  };

  const anchorRef = useRef<HTMLDivElement>(null);

  const inputEl = (
    <input
      type="text"
      value={displayValue}
      disabled={disabled}
      placeholder="--:--"
      {...inputProps}
      onFocus={(e) => {
        setRawValue(value ? formatTimeForDisplay(value) : '');
        setIsEditing(true);
        onFocus?.(e);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setRawValue(e.target.value);
        if (isInvalid) setIsInvalid(false);
      }}
      onBlur={(e) => {
        commitValue();
        onBlur?.(e);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        TIME_ENTRY_FLAT_INPUT_CLASS,
        'text-xs tabular-nums',
        showHalfHourPicker && 'min-w-0 flex-1 rounded-none',
        isInvalid && 'bg-destructive/10 text-destructive placeholder:text-destructive/60',
        !showHalfHourPicker && className,
      )}
    />
  );

  if (!showHalfHourPicker) {
    return inputEl;
  }

  return (
    <div ref={anchorRef} className={cn('flex min-w-0 items-stretch overflow-visible', className)}>
      {inputEl}
      <HalfHourTimePicker
        anchorRef={anchorRef}
        value={value}
        onChange={(next) => {
          setIsInvalid(false);
          setIsEditing(false);
          onChange(next);
          setRawValue(next ? formatTimeForDisplay(next) : '');
        }}
        disabled={disabled}
      />
    </div>
  );
}
