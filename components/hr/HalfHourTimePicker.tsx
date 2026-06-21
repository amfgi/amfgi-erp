'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import {
  HALF_HOUR_MINUTES,
  HOUR12_OPTIONS,
  type HalfHourMeridiem,
  type HalfHourPickerValue,
  formatHalfHourPickerLabel,
  halfHourPickerToTime24,
  time24ToHalfHourPicker,
} from '@/lib/hr/halfHourTime';

type HalfHourTimePickerProps = {
  value: string;
  onChange: (time24: string) => void;
  disabled?: boolean;
  className?: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  'aria-label'?: string;
};

const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_ROWS = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

function hourIndex(hour12: number) {
  const index = HOUR12_OPTIONS.indexOf(hour12 as (typeof HOUR12_OPTIONS)[number]);
  return index >= 0 ? index : 0;
}

function scrollTopForHourIndex(index: number) {
  return index * WHEEL_ITEM_HEIGHT;
}

function hourIndexFromScrollTop(scrollTop: number) {
  return Math.max(0, Math.min(HOUR12_OPTIONS.length - 1, Math.round(scrollTop / WHEEL_ITEM_HEIGHT)));
}

function segmentClass(active: boolean) {
  return cn(
    'rounded-md border font-semibold tabular-nums transition-colors',
    'h-8 min-w-9 px-2 text-xs',
    active
      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
      : 'border-border bg-background text-foreground hover:bg-muted',
  );
}

function HourScrollWheel({
  hour12,
  onHourChange,
  open,
  initialScrollHour,
}: {
  hour12: number;
  onHourChange: (hour: number) => void;
  open: boolean;
  initialScrollHour: number | null;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  const scrollEndTimerRef = useRef<number | null>(null);
  const skipHourEffectRef = useRef(false);

  const scrollToHour = useCallback((nextHour12: number, behavior: ScrollBehavior = 'auto') => {
    const el = wheelRef.current;
    if (!el) return false;
    const index = hourIndex(nextHour12);
    programmaticScrollRef.current = true;
    el.scrollTo({ top: scrollTopForHourIndex(index), behavior });
    window.setTimeout(
      () => {
        programmaticScrollRef.current = false;
      },
      behavior === 'smooth' ? 240 : 0,
    );
    return true;
  }, []);

  useLayoutEffect(() => {
    if (!open || initialScrollHour == null) return;
    const targetHour = initialScrollHour;
    let frame1 = 0;
    let frame2 = 0;
    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        if (!scrollToHour(targetHour, 'auto')) {
          window.setTimeout(() => scrollToHour(targetHour, 'auto'), 0);
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
    };
  }, [initialScrollHour, open, scrollToHour]);

  useLayoutEffect(() => {
    if (!open || skipHourEffectRef.current) {
      skipHourEffectRef.current = false;
      return;
    }
    scrollToHour(hour12, 'auto');
  }, [hour12, open, scrollToHour]);

  const snapScrollPosition = useCallback(() => {
    const el = wheelRef.current;
    if (!el || programmaticScrollRef.current) return;

    const index = hourIndexFromScrollTop(el.scrollTop);
    const snappedTop = scrollTopForHourIndex(index);
    const nextHour = HOUR12_OPTIONS[index];

    if (Math.abs(el.scrollTop - snappedTop) > 1) {
      programmaticScrollRef.current = true;
      el.scrollTo({ top: snappedTop, behavior: 'smooth' });
      window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 220);
    }

    if (nextHour !== hour12) {
      skipHourEffectRef.current = true;
      onHourChange(nextHour);
    }
  }, [hour12, onHourChange]);

  const handleScroll = () => {
    if (programmaticScrollRef.current) return;
    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current);
    }
    scrollEndTimerRef.current = window.setTimeout(snapScrollPosition, 90);
  };

  useEffect(
    () => () => {
      if (scrollEndTimerRef.current != null) window.clearTimeout(scrollEndTimerRef.current);
    },
    [],
  );

  const activeIndex = hourIndex(hour12);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hour</p>
      <div className="relative mx-auto w-full max-w-[3.25rem]" style={{ height: WHEEL_HEIGHT }}>
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-md border border-primary/35 bg-primary/10"
          aria-hidden
        />
        <div
          ref={wheelRef}
          className="h-full overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
        >
          <div aria-hidden style={{ height: WHEEL_ITEM_HEIGHT }} />
          {HOUR12_OPTIONS.map((hour, index) => {
            const selected = hour === hour12;
            const near = Math.abs(index - activeIndex) <= 1;
            return (
              <button
                key={hour}
                type="button"
                style={{ height: WHEEL_ITEM_HEIGHT }}
                className={cn(
                  'flex w-full items-center justify-center text-base font-semibold tabular-nums transition-colors',
                  selected ? 'text-primary' : near ? 'text-foreground/80' : 'text-muted-foreground/55',
                )}
                onClick={() => {
                  skipHourEffectRef.current = true;
                  onHourChange(hour);
                  scrollToHour(hour, 'smooth');
                }}
              >
                {hour}
              </button>
            );
          })}
          <div aria-hidden style={{ height: WHEEL_ITEM_HEIGHT }} />
        </div>
      </div>
    </div>
  );
}

export default function HalfHourTimePicker({
  value,
  onChange,
  disabled,
  className,
  anchorRef,
  'aria-label': ariaLabel = 'Open time picker',
}: HalfHourTimePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [draft, setDraft] = useState<HalfHourPickerValue>(() => time24ToHalfHourPicker(value));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [initialScrollHour, setInitialScrollHour] = useState<number | null>(null);
  const [panelStyle, setPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    placement: 'above' | 'below';
  } | null>(null);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 272), 320);
    const panelHeight = 168;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    setPanelStyle({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      top: openAbove ? rect.top - gap : rect.bottom + gap,
      width,
      placement: openAbove ? 'above' : 'below',
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  const openPicker = () => {
    if (disabled) return;
    const next = time24ToHalfHourPicker(value);
    setDraft(next);
    setInitialScrollHour(next.hour12);
    setOpen(true);
  };

  const applyDraft = useCallback(
    (updater: (prev: HalfHourPickerValue) => HalfHourPickerValue) => {
      const next = updater(draftRef.current);
      draftRef.current = next;
      setDraft(next);
      queueMicrotask(() => onChange(halfHourPickerToTime24(next)));
    },
    [onChange],
  );

  const closePicker = () => {
    setOpen(false);
    setInitialScrollHour(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePicker();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, open]);

  const panel =
    open && panelStyle ? (
      <div
        ref={panelRef}
        id={pickerId}
        role="dialog"
        aria-label="Half-hour time picker"
        className="fixed z-[250] rounded-lg border border-border bg-card p-2.5 text-card-foreground shadow-xl"
        style={{
          left: panelStyle.left,
          top: panelStyle.top,
          width: panelStyle.width,
          transform: panelStyle.placement === 'above' ? 'translateY(-100%)' : undefined,
        }}
      >
        <p className="mb-2 text-center text-sm font-semibold tabular-nums text-foreground">
          {formatHalfHourPickerLabel(draft)}
        </p>

        <div className="flex items-start gap-2">
          <HourScrollWheel
            open={open}
            hour12={draft.hour12}
            initialScrollHour={initialScrollHour}
            onHourChange={(hour12) => applyDraft((prev) => ({ ...prev, hour12 }))}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Min</p>
              <div className="flex flex-col gap-1">
                {HALF_HOUR_MINUTES.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    className={cn(segmentClass(draft.minute === minute), 'w-full')}
                    onClick={() => applyDraft((prev) => ({ ...prev, minute }))}
                  >
                    {minute === 0 ? '00' : '30'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Period</p>
              <div className="flex flex-col gap-1">
                {(['AM', 'PM'] as const).map((meridiem) => (
                  <button
                    key={meridiem}
                    type="button"
                    className={cn(segmentClass(draft.meridiem === meridiem), 'w-full')}
                    onClick={() => applyDraft((prev) => ({ ...prev, meridiem }))}
                  >
                    {meridiem}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="icon"
            className="mt-5 size-8 shrink-0 self-start"
            onClick={closePicker}
            aria-label="Done"
          >
            <Check className="size-4" />
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        onClick={openPicker}
        className={cn(
          'inline-flex h-full min-h-7 shrink-0 items-center justify-center border-l border-border bg-muted/30 px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <Clock className="size-4" />
      </button>
      {portalMounted && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  );
}
