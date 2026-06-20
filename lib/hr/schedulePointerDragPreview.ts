const PREVIEW_CLASS = 'schedule-drag-preview-layer';
const SOURCE_ATTR = 'data-schedule-drag-source';

export type ScheduleDragPreviewSession = {
  updateTarget: (clientX: number, clientY: number) => void;
  destroy: (options?: { animate?: boolean }) => void;
};

export function startScheduleDragPreview(
  sourceEl: HTMLElement,
  clientX: number,
  clientY: number,
): ScheduleDragPreviewSession {
  const rect = sourceEl.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;

  sourceEl.setAttribute(SOURCE_ATTR, 'true');
  sourceEl.classList.add('opacity-40', 'transition-opacity', 'duration-150');

  const preview = sourceEl.cloneNode(true) as HTMLElement;
  preview.removeAttribute(SOURCE_ATTR);
  preview.removeAttribute('data-schedule-drop-active');
  preview.setAttribute('aria-hidden', 'true');
  preview.className = [
    PREVIEW_CLASS,
    'pointer-events-none fixed left-0 top-0 z-[9999] overflow-hidden rounded-lg',
    'border border-primary/30 bg-card/95 shadow-2xl ring-2 ring-primary/35',
    'backdrop-blur-sm will-change-transform',
  ].join(' ');

  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.margin = '0';
  preview.style.boxSizing = 'border-box';

  let posX = rect.left;
  let posY = rect.top;
  let targetX = rect.left;
  let targetY = rect.top;
  let rafId = 0;
  let destroyed = false;

  const applyTransform = (x: number, y: number, scale: number, opacity: number) => {
    preview.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    preview.style.opacity = String(opacity);
  };

  applyTransform(posX, posY, 0.96, 0);
  document.body.appendChild(preview);

  requestAnimationFrame(() => {
    applyTransform(posX, posY, 1.02, 0.96);
  });

  const tick = () => {
    if (destroyed) return;
    posX += (targetX - posX) * 0.32;
    posY += (targetY - posY) * 0.32;
    applyTransform(posX, posY, 1.02, 0.96);
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  const restoreSource = () => {
    sourceEl.removeAttribute(SOURCE_ATTR);
    sourceEl.classList.remove('opacity-40', 'transition-opacity', 'duration-150');
  };

  return {
    updateTarget(nextX: number, nextY: number) {
      targetX = nextX - offsetX;
      targetY = nextY - offsetY;
    },
    destroy(options) {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(rafId);
      restoreSource();

      if (options?.animate === false) {
        preview.remove();
        return;
      }

      const startX = posX;
      const startY = posY;
      const startTime = performance.now();
      const durationMs = 160;

      const fadeOut = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - (1 - t) ** 2;
        applyTransform(startX, startY, 1.02 - eased * 0.04, 0.96 * (1 - eased));
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
