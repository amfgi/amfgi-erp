'use client';

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  /** Names already held by the parent. An empty list clears the control after save or add. */
  selectedNames?: string[];
  onClear?: () => void;
};

export default function FileInput({
  className,
  selectedNames,
  onChange,
  onClear,
  disabled,
  ...props
}: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localNames, setLocalNames] = useState<string[]>([]);
  const controlled = selectedNames !== undefined;
  const names = controlled ? selectedNames : localNames;
  const selectedKey = selectedNames?.join('\0') ?? null;

  useEffect(() => {
    if (selectedKey === null || selectedKey.length > 0) return;
    if (inputRef.current?.value) inputRef.current.value = '';
    setLocalNames((current) => (current.length ? [] : current));
  }, [selectedKey]);

  function clear() {
    const input = inputRef.current;
    if (!input || disabled) return;
    input.value = '';
    setLocalNames([]);
    onChange?.({ target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>);
    onClear?.();
  }

  return (
    <div
      className="flex w-full items-center gap-1"
      onClick={(event) => {
        if (event.target !== inputRef.current) event.preventDefault();
      }}
    >
      <input
        {...props}
        ref={inputRef}
        type="file"
        disabled={disabled}
        className={cn(className, 'w-auto max-w-full')}
        onChange={(event) => {
          setLocalNames(Array.from(event.target.files ?? []).map((file) => file.name));
          onChange?.(event);
        }}
      />
      {names.length > 0 ? (
        <button
          type="button"
          disabled={disabled}
          aria-label="Remove file"
          title="Remove file"
          onClick={clear}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-current/70 hover:bg-current/10 hover:text-current disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
