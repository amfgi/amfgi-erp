import { startScheduleDragPreview } from '@/lib/hr/schedulePointerDragPreview';

const DROP_HYSTERESIS_PX = 12;
export const VERTICAL_DRAG_ITEM_ATTR = 'data-vertical-drag-item';
export const VERTICAL_DRAG_LIST_ATTR = 'data-vertical-drag-list';

export type VerticalDragSlot = {
  index: number;
  centerY: number;
  top: number;
  bottom: number;
  height: number;
};

export type VerticalDragLayout = {
  slots: VerticalDragSlot[];
  listTop: number;
};

export function measureVerticalDragSlots(elements: HTMLElement[]): VerticalDragSlot[] {
  return elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return {
      index,
      centerY: rect.top + rect.height / 2,
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
    };
  });
}

export function resolveVerticalDropIndex(
  clientY: number,
  slots: VerticalDragSlot[],
  fromIndex: number,
  previousOver: number | null,
): number {
  if (slots.length === 0) return fromIndex;

  let candidate = slots[0].index;
  let bestDistance = Infinity;
  for (const slot of slots) {
    const distance = Math.abs(clientY - slot.centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidate = slot.index;
    }
  }

  if (previousOver == null || previousOver === candidate) return candidate;

  const prevSlot = slots.find((slot) => slot.index === previousOver);
  const nextSlot = slots.find((slot) => slot.index === candidate);
  if (!prevSlot || !nextSlot || prevSlot.index === nextSlot.index) return candidate;

  const movingDown = candidate > previousOver;
  const boundary = (prevSlot.centerY + nextSlot.centerY) / 2;
  if (movingDown) {
    return clientY > boundary + DROP_HYSTERESIS_PX ? candidate : previousOver;
  }
  return clientY < boundary - DROP_HYSTERESIS_PX ? candidate : previousOver;
}

function getReorderedIndices(length: number, fromIndex: number, overIndex: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(overIndex, 0, moved);
  return order;
}

function computeTopsAfterReorder(
  slots: VerticalDragSlot[],
  fromIndex: number,
  overIndex: number,
): number[] {
  const order = getReorderedIndices(slots.length, fromIndex, overIndex);
  const topsAfter = new Array<number>(slots.length);
  topsAfter[order[0]] = slots[0].top;
  for (let position = 1; position < slots.length; position += 1) {
    const previous = order[position - 1];
    const current = order[position];
    const gap = slots[current].top - slots[previous].bottom;
    topsAfter[current] = topsAfter[previous] + slots[previous].height + gap;
  }
  return topsAfter;
}

/** Per-item shift for variable-height vertical lists (frozen layout at drag start). */
export function computeVerticalItemShift(
  itemIndex: number,
  fromIndex: number,
  overIndex: number | null,
  slots: VerticalDragSlot[],
): number {
  if (overIndex == null || fromIndex === overIndex || slots.length === 0) return 0;

  const topsAfter = computeTopsAfterReorder(slots, fromIndex, overIndex);
  return topsAfter[itemIndex] - slots[itemIndex].top;
}

/** Y offset (px) for an insertion line inside the list container. */
export function computeVerticalInsertionLineOffset(
  layout: VerticalDragLayout | null,
  fromIndex: number,
  overIndex: number | null,
): number | null {
  if (!layout || overIndex == null || fromIndex === overIndex || layout.slots.length === 0) {
    return null;
  }

  const topsAfter = computeTopsAfterReorder(layout.slots, fromIndex, overIndex);
  return topsAfter[fromIndex] - layout.listTop;
}

export function startVerticalListDrag(
  itemElement: HTMLElement,
  clientX: number,
  clientY: number,
) {
  return startScheduleDragPreview(itemElement, clientX, clientY, {
    sourceOpacityClass: 'opacity-25',
    previewOverflow: 'visible',
  });
}

export function collectVerticalDragSiblings(itemElement: HTMLElement): HTMLElement[] {
  const list = itemElement.closest(`[${VERTICAL_DRAG_LIST_ATTR}]`);
  if (list instanceof HTMLElement) {
    return Array.from(list.querySelectorAll<HTMLElement>(`:scope > [${VERTICAL_DRAG_ITEM_ATTR}]`));
  }
  const parent = itemElement.parentElement;
  if (!parent) return [itemElement];
  return Array.from(parent.querySelectorAll<HTMLElement>(`:scope > [${VERTICAL_DRAG_ITEM_ATTR}]`));
}

export function measureVerticalDragLayout(itemElement: HTMLElement): VerticalDragLayout {
  const list = itemElement.closest(`[${VERTICAL_DRAG_LIST_ATTR}]`);
  const siblings = collectVerticalDragSiblings(itemElement);
  const listTop =
    list instanceof HTMLElement
      ? list.getBoundingClientRect().top
      : itemElement.parentElement?.getBoundingClientRect().top ?? itemElement.getBoundingClientRect().top;

  return {
    slots: measureVerticalDragSlots(siblings),
    listTop,
  };
}
