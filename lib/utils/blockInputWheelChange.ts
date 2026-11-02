import type { InputHTMLAttributes, Ref } from 'react';

export type InputPropsWithRef = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const blockedInputs = new WeakSet<HTMLInputElement>();

const SPIN_INPUT_TYPES = new Set(['number', 'date', 'time', 'datetime-local', 'month', 'week']);

function isSpinInput(element: EventTarget | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && SPIN_INPUT_TYPES.has(element.type);
}

function isFormField(element: EventTarget | null): element is HTMLElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function scrollableAncestor(start: Element | null): HTMLElement | null {
  let node = start instanceof HTMLElement ? start.parentElement : null;
  while (node) {
    const style = getComputedStyle(node);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
    if (canScrollY || canScrollX) return node;
    node = node.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function wheelDistance(event: WheelEvent, scroller: HTMLElement) {
  if (event.deltaMode === 1) return { x: event.deltaX * 16, y: event.deltaY * 16 };
  if (event.deltaMode === 2) return { x: event.deltaX * scroller.clientWidth, y: event.deltaY * scroller.clientHeight };
  return { x: event.deltaX, y: event.deltaY };
}

function shouldBlockSpinKey(key: string) {
  return key === 'ArrowUp' || key === 'ArrowDown';
}

function onNumberInputWheel(event: WheelEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (document.activeElement === input) {
    event.preventDefault();
  }
}

function onNumberInputKeyDown(event: KeyboardEvent) {
  const input = event.currentTarget as HTMLInputElement;
  if (document.activeElement !== input) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
  }
}

export function installGlobalNumberInputSpinBlock() {
  if (typeof document === 'undefined') return () => {};

  const onWheel = (event: WheelEvent) => {
    const active = document.activeElement;
    if (!isFormField(active) || !event.cancelable) return;
    const origin = event.target instanceof Element ? event.target : active;
    if (
      active instanceof HTMLTextAreaElement &&
      origin === active &&
      active.scrollHeight > active.clientHeight + 1
    ) {
      return;
    }
    const hovered = scrollableAncestor(origin);
    const page = active.closest('main');
    const pageScroller = page instanceof HTMLElement && page.scrollHeight > page.clientHeight + 1 ? page : null;
    if (hovered && hovered !== pageScroller && hovered.contains(origin) && origin !== active) {
      if (!isSpinInput(active)) return;
      event.preventDefault();
      const distance = wheelDistance(event, hovered);
      hovered.scrollBy({ top: distance.y, left: distance.x });
      return;
    }
    event.preventDefault();
    const scroller = pageScroller ?? hovered;
    if (!scroller) return;
    const distance = wheelDistance(event, scroller);
    scroller.scrollBy({ top: distance.y, left: distance.x });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!shouldBlockSpinKey(event.key)) return;
    const active = document.activeElement;
    const target = event.target;
    if (isSpinInput(active) || isSpinInput(target)) {
      event.preventDefault();
    }
  };

  document.addEventListener('wheel', onWheel, { passive: false, capture: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });

  return () => {
    document.removeEventListener('wheel', onWheel, { capture: true });
    document.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}

/** @deprecated Prefer global NumberInputSpinGuard; kept for targeted input props. */
export function attachBlockInputWheelChange(input: HTMLInputElement) {
  if (blockedInputs.has(input)) return;
  input.addEventListener('wheel', onNumberInputWheel, { passive: false });
  input.addEventListener('keydown', onNumberInputKeyDown);
  blockedInputs.add(input);
}

export function detachBlockInputWheelChange(input: HTMLInputElement) {
  if (!blockedInputs.has(input)) return;
  input.removeEventListener('wheel', onNumberInputWheel);
  input.removeEventListener('keydown', onNumberInputKeyDown);
  blockedInputs.delete(input);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  ref.current = value;
}

/** Ref callback that blocks mouse-wheel value changes on number inputs (non-passive listener). */
export function createBlockInputWheelRef<T extends HTMLInputElement>(
  existingRef?: Ref<T>
) {
  let current: T | null = null;

  return (element: T | null) => {
    if (current && current !== element) {
      detachBlockInputWheelChange(current);
    }
    current = element;
    if (element) {
      attachBlockInputWheelChange(element);
    }
    assignRef(existingRef, element);
  };
}

/** Merge wheel / arrow-key spin blocking onto native number input props. */
export function withBlockInputWheelChange(
  props: InputPropsWithRef = {}
): InputPropsWithRef {
  const userOnKeyDown = props.onKeyDown;
  return {
    ...props,
    ref: createBlockInputWheelRef(props.ref),
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
      }
      userOnKeyDown?.(event);
    },
  };
}
