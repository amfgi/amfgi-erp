import type { ScheduleDragPreviewSession } from '@/lib/hr/schedulePointerDragPreview';

const SOURCE_ATTR = 'data-schedule-drag-source';
const PREVIEW_CLASS = 'schedule-team-column-drag-preview';
const DROP_HYSTERESIS_PX = 14;

export type TeamColumnDragSlot = {
  index: number;
  centerX: number;
  left: number;
  right: number;
};

export function measureTeamColumnDragSlots(table: HTMLTableElement): TeamColumnDragSlot[] {
  return Array.from(table.querySelectorAll<HTMLElement>('thead [data-team-column][data-team-col]'))
    .map((header) => {
      const index = Number(header.dataset.teamCol);
      const rect = header.getBoundingClientRect();
      return {
        index,
        centerX: rect.left + rect.width / 2,
        left: rect.left,
        right: rect.right,
      };
    })
    .filter((slot) => Number.isFinite(slot.index))
    .sort((a, b) => a.index - b.index);
}

/** Resolve drop column from pointer X using layout frozen at drag start (immune to shift transforms). */
export function resolveTeamColumnDropIndex(
  clientX: number,
  slots: TeamColumnDragSlot[],
  fromIndex: number,
  previousOver: number | null,
): number {
  if (slots.length === 0) return fromIndex;

  let candidate = slots[0].index;
  let bestDistance = Infinity;
  for (const slot of slots) {
    const distance = Math.abs(clientX - slot.centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidate = slot.index;
    }
  }

  if (previousOver == null || previousOver === candidate) return candidate;

  const prevSlot = slots.find((slot) => slot.index === previousOver);
  const nextSlot = slots.find((slot) => slot.index === candidate);
  if (!prevSlot || !nextSlot || prevSlot.index === nextSlot.index) return candidate;

  const movingRight = candidate > previousOver;
  const boundary = (prevSlot.centerX + nextSlot.centerX) / 2;
  if (movingRight) {
    return clientX > boundary + DROP_HYSTERESIS_PX ? candidate : previousOver;
  }
  return clientX < boundary - DROP_HYSTERESIS_PX ? candidate : previousOver;
}

export function computeTeamColumnShift(
  columnIndex: number,
  fromIndex: number,
  overIndex: number | null,
  columnWidthPx: number,
): number {
  if (overIndex == null || fromIndex === overIndex) return 0;
  if (fromIndex < overIndex) {
    if (columnIndex > fromIndex && columnIndex <= overIndex) return -columnWidthPx;
  } else if (columnIndex >= overIndex && columnIndex < fromIndex) {
    return columnWidthPx;
  }
  return 0;
}

function restoreColumnCells(cells: HTMLElement[]) {
  for (const cell of cells) {
    cell.removeAttribute(SOURCE_ATTR);
    cell.classList.remove('opacity-25', 'transition-opacity', 'duration-150');
  }
}

export function startTeamColumnDragPreview(
  table: HTMLTableElement,
  columnIndex: number,
  clientX: number,
  clientY: number,
): ScheduleDragPreviewSession {
  const cells = Array.from(
    table.querySelectorAll<HTMLElement>(`[data-team-column="${columnIndex}"]`),
  ).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  const anchorRect = cells[0]?.getBoundingClientRect();
  const offsetX = clientX - (anchorRect?.left ?? clientX);
  const offsetY = clientY - (anchorRect?.top ?? clientY);
  const columnWidth = anchorRect?.width ?? 288;

  for (const cell of cells) {
    cell.setAttribute(SOURCE_ATTR, 'true');
    cell.classList.add('opacity-25', 'transition-opacity', 'duration-150');
  }

  const preview = document.createElement('div');
  preview.setAttribute('aria-hidden', 'true');
  preview.className = [
    PREVIEW_CLASS,
    'pointer-events-none fixed left-0 top-0 z-[9999] overflow-hidden rounded-lg',
    'border border-primary/35 bg-card shadow-2xl ring-2 ring-primary/40',
    'backdrop-blur-sm will-change-transform',
  ].join(' ');
  preview.style.width = `${columnWidth}px`;
  preview.style.margin = '0';
  preview.style.boxSizing = 'border-box';

  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const clone = cell.cloneNode(true) as HTMLElement;
    clone.removeAttribute(SOURCE_ATTR);
    clone.removeAttribute('data-schedule-drop-active');
    clone.style.position = 'relative';
    clone.style.top = 'auto';
    clone.style.left = 'auto';
    clone.style.width = `${columnWidth}px`;
    clone.style.minWidth = `${columnWidth}px`;
    clone.style.maxWidth = `${columnWidth}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.minHeight = `${rect.height}px`;
    clone.style.transform = 'none';
    clone.style.opacity = '1';
    clone.classList.remove('sticky', 'opacity-25');
    preview.appendChild(clone);
  }

  let posX = anchorRect?.left ?? clientX;
  let posY = anchorRect?.top ?? clientY;
  let targetX = posX;
  let targetY = posY;
  let rafId = 0;
  let destroyed = false;

  const applyTransform = (x: number, y: number, scale: number, opacity: number) => {
    preview.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    preview.style.opacity = String(opacity);
  };

  applyTransform(posX, posY, 0.98, 0);
  document.body.appendChild(preview);

  requestAnimationFrame(() => {
    applyTransform(posX, posY, 1.02, 0.98);
  });

  const tick = () => {
    if (destroyed) return;
    posX += (targetX - posX) * 0.34;
    posY += (targetY - posY) * 0.34;
    applyTransform(posX, posY, 1.02, 0.98);
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    updateTarget(nextX: number, nextY: number) {
      targetX = nextX - offsetX;
      targetY = nextY - offsetY;
    },
    destroy(options) {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(rafId);
      restoreColumnCells(cells);

      if (options?.animate === false) {
        preview.remove();
        return;
      }

      const startX = posX;
      const startY = posY;
      const startTime = performance.now();
      const durationMs = 180;

      const fadeOut = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - (1 - t) ** 2;
        applyTransform(startX, startY, 1.02 - eased * 0.05, 0.98 * (1 - eased));
        if (t < 1) {
          window.requestAnimationFrame(fadeOut);
        } else {
          preview.remove();
        }
      };

      window.requestAnimationFrame(fadeOut);
    },
  };
}
