'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type PictureLayout = 'inline' | 'square' | 'tight' | 'through' | 'top-bottom' | 'behind' | 'front';
export type PictureAnchor = 'text' | 'page';

export type PictureSettings = {
  id: string;
  layout: PictureLayout;
  anchor: PictureAnchor;
  width: number;
  x: number;
  y: number;
};

const LAYOUTS = new Set<string>(['inline', 'square', 'tight', 'through', 'top-bottom', 'behind', 'front']);

const WRAP_LAYOUTS: Array<{ layout: PictureLayout; label: string }> = [
  { layout: 'square', label: 'Square' },
  { layout: 'tight', label: 'Tight' },
  { layout: 'through', label: 'Through' },
  { layout: 'top-bottom', label: 'Top and bottom' },
  { layout: 'behind', label: 'Behind text' },
  { layout: 'front', label: 'In front of text' },
];

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function pictureIsPositioned(layout: string, anchor: string) {
  return anchor === 'page' || layout === 'behind' || layout === 'front';
}

export function findPicture(root: ParentNode | null, id: string | null) {
  if (!root || !id) return null;
  const img = root.querySelector(`img.quotation-picture[data-id="${CSS.escape(id)}"]`);
  return img instanceof HTMLImageElement ? img : null;
}

export function readPicture(img: HTMLImageElement): PictureSettings {
  const layout = LAYOUTS.has(img.dataset.layout || '') ? (img.dataset.layout as PictureLayout) : 'inline';
  const anchor: PictureAnchor = img.dataset.anchor === 'page' && layout !== 'inline' ? 'page' : 'text';
  return {
    id: img.dataset.id || '',
    layout,
    anchor,
    width: clamp(Number(img.dataset.width), 40, 420, Math.round(img.getBoundingClientRect().width) || 140),
    x: clamp(Number(img.dataset.x), -80, 900, 0),
    y: clamp(Number(img.dataset.y), -80, 1400, 0),
  };
}

export function writePicture(img: HTMLImageElement, settings: PictureSettings) {
  const positioned = pictureIsPositioned(settings.layout, settings.anchor);
  img.dataset.layout = settings.layout;
  img.dataset.anchor = settings.anchor;
  img.dataset.width = String(settings.width);
  img.dataset.x = String(positioned ? settings.x : 0);
  img.dataset.y = String(positioned ? settings.y : 0);
  img.style.width = `${settings.width}px`;
  img.style.left = positioned ? `${settings.x}px` : '';
  img.style.top = positioned ? `${settings.y}px` : '';
  img.draggable = false;
  img.setAttribute('contenteditable', 'false');
}

export function pictureMarkup(id: string, src: string, width: number) {
  return `<img class="quotation-picture" data-id="${id}" src="${src}" data-layout="inline" data-anchor="text" data-width="${width}" data-x="0" data-y="0" alt="" draggable="false" contenteditable="false" style="width:${width}px" />`;
}

export function clipboardImage(data: DataTransfer | null) {
  if (!data) return null;
  const item = [...data.items].find((entry) => entry.kind === 'file' && /^image\/(png|jpe?g|webp|gif)$/i.test(entry.type));
  return item?.getAsFile() ?? null;
}

export async function pictureSource(file: File) {
  const typeOk = /^image\/(png|jpe?g|webp|gif)$/i.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  if (!typeOk) throw new Error('type');
  if (file.size > 8 * 1024 * 1024) throw new Error('large');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('type');
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const step = Math.max(4, Math.floor((width * height) / 4000) * 4);
    let transparent = false;
    for (let index = 3; index < pixels.length; index += step) {
      if (pixels[index] < 250) {
        transparent = true;
        break;
      }
    }
    const keepPng = transparent || /png|webp|gif/i.test(file.type);
    const src = canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85);
    if (!src.startsWith('data:image/') || src.length > 1_400_000) throw new Error('large');
    return { src, width: Math.min(180, Math.max(40, width)) };
  } finally {
    bitmap.close();
  }
}

function WrapIcon({ layout, className = 'h-7 w-9' }: { layout: PictureLayout; className?: string }) {
  const line = '#7d92a8';
  const box = '#5b7c99';
  if (layout === 'inline') {
    return (
      <svg viewBox="0 0 36 28" className={className} aria-hidden="true">
        <path d="M4 8h28M4 14h8M24 14h8M4 20h28" stroke={line} strokeWidth="1.6" />
        <rect x="13" y="10" width="10" height="8" fill="#d6e6f5" stroke={box} />
      </svg>
    );
  }
  if (layout === 'top-bottom') {
    return (
      <svg viewBox="0 0 36 28" className={className} aria-hidden="true">
        <path d="M4 4h28M4 24h28" stroke={line} strokeWidth="1.6" />
        <rect x="10" y="8" width="16" height="12" fill="#d6e6f5" stroke={box} />
      </svg>
    );
  }
  if (layout === 'behind') {
    return (
      <svg viewBox="0 0 36 28" className={className} aria-hidden="true">
        <rect x="8" y="6" width="16" height="14" fill="#d6e6f5" stroke={box} />
        <path d="M4 10h28M4 15h28M4 20h28" stroke={line} strokeWidth="1.6" />
      </svg>
    );
  }
  if (layout === 'front') {
    return (
      <svg viewBox="0 0 36 28" className={className} aria-hidden="true">
        <path d="M4 10h28M4 15h28M4 20h28" stroke={line} strokeWidth="1.6" />
        <rect x="8" y="6" width="16" height="14" fill="#d6e6f5" stroke={box} />
      </svg>
    );
  }
  const tight = layout === 'tight' || layout === 'through';
  return (
    <svg viewBox="0 0 36 28" className={className} aria-hidden="true">
      <rect x="4" y="4" width="14" height="12" fill={layout === 'through' ? '#eef5fb' : '#d6e6f5'} stroke={box} />
      {layout === 'through' ? <path d="M6 8h10M6 12h10" stroke={line} strokeWidth="1.2" /> : null}
      <path d={tight ? 'M20 6h12M20 10h12M20 14h12M4 20h28M4 24h28' : 'M22 6h10M22 11h10M4 20h28M4 24h20'} stroke={line} strokeWidth="1.6" />
    </svg>
  );
}

export function PictureChrome({
  box,
  settings,
  layoutOpen,
  more,
  onToggle,
  onClose,
  onMore,
  onLayout,
  onAnchor,
  onWidth,
  onCommitWidth,
  onPosition,
  onResize,
  onRemove,
}: {
  box: { top: number; left: number; width: number; height: number };
  settings: PictureSettings;
  layoutOpen: boolean;
  more: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMore: () => void;
  onLayout: (layout: PictureLayout) => void;
  onAnchor: (anchor: PictureAnchor) => void;
  onWidth: (width: number) => void;
  onCommitWidth: (width: number) => void;
  onPosition: (x: number, y: number) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRemove: () => void;
}) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const pinnedPlace = useRef({ left: 0, top: 0 });
  const widthRef = useRef(settings.width);
  if (typeof document === 'undefined') return null;
  const buttonLeft = Math.max(4, box.left - 30);
  const panelWidth = 228;
  const gap = 10;
  const rightStart = box.left + box.width + gap;
  const leftStart = Math.min(box.left, buttonLeft) - gap - panelWidth;
  const rightFits = rightStart + panelWidth <= window.innerWidth - 8;
  const leftFits = leftStart >= 8;
  let panelLeft = rightStart;
  if (!rightFits && leftFits) panelLeft = leftStart;
  else if (!rightFits && !leftFits) {
    const roomRight = window.innerWidth - rightStart;
    const roomLeft = box.left;
    panelLeft = roomRight >= roomLeft ? Math.max(rightStart, window.innerWidth - 8 - panelWidth) : Math.min(leftStart, 8);
    if (panelLeft < box.left + box.width && panelLeft + panelWidth > box.left) {
      panelLeft = roomRight >= roomLeft ? rightStart : leftStart;
    }
  }
  let panelTop = Math.max(8, box.top);
  if (panelTop + 430 > window.innerHeight) panelTop = Math.max(8, window.innerHeight - 430);
  const positioned = pictureIsPositioned(settings.layout, settings.anchor);
  if (dragWidth == null) pinnedPlace.current = { left: panelLeft, top: panelTop };
  const placeLeft = dragWidth == null ? panelLeft : pinnedPlace.current.left;
  const placeTop = dragWidth == null ? panelTop : pinnedPlace.current.top;
  const shownWidth = dragWidth ?? settings.width;
  widthRef.current = shownWidth;
  const outlineScale = dragWidth == null || box.width < 1 ? 1 : dragWidth / box.width;
  const outlineWidth = box.width * outlineScale;
  const outlineHeight = box.height * outlineScale;

  return createPortal(
    <>
      <div
        className="quotation-picture-chrome quotation-edit-only pointer-events-none"
        style={{ position: 'fixed', top: box.top, left: box.left, width: outlineWidth, height: outlineHeight, border: '1px solid #5b9bd5', zIndex: 70 }}
      />
      <button
        type="button"
        className="quotation-picture-chrome quotation-edit-only"
        aria-label="Layout options"
        title="Layout options"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggle}
        style={{ position: 'fixed', top: box.top, left: buttonLeft, zIndex: 71, width: 26, height: 26, background: '#deecf9', border: '1px solid #7eb4ea', padding: 0 }}
      >
        <WrapIcon layout="square" className="mx-auto h-4 w-5" />
      </button>
      <button
        type="button"
        className="quotation-picture-chrome quotation-edit-only"
        aria-label="Resize picture"
        title="Drag to resize"
        onPointerDown={onResize}
        style={{ position: 'fixed', top: box.top + outlineHeight - 5, left: box.left + outlineWidth - 5, zIndex: 71, width: 10, height: 10, background: '#fff', border: '1px solid #5b9bd5', padding: 0, cursor: 'nwse-resize' }}
      />
      {layoutOpen ? (
        <div
          className="quotation-picture-chrome quotation-edit-only"
          role="dialog"
          aria-label="Layout options"
          onPointerDown={(event) => event.stopPropagation()}
          style={{ position: 'fixed', top: placeTop, left: placeLeft, zIndex: 72, width: 228, background: '#fff', color: '#111', border: '1px solid #2b579a', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 6px' }}>
            <span style={{ color: '#2b579a', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>LAYOUT OPTIONS</span>
            <button type="button" aria-label="Close layout options" onClick={onClose} style={{ border: 0, background: 'transparent', padding: 0, color: '#333', cursor: 'pointer' }}>
              <X className="size-4" />
            </button>
          </div>
          <div style={{ background: '#f3f2f1', padding: '4px 8px', fontSize: 12, fontWeight: 700 }}>In Line with Text</div>
          <div style={{ padding: 8 }}>
            <Tile selected={settings.layout === 'inline'} label="In line with text" onClick={() => onLayout('inline')}>
              <WrapIcon layout="inline" />
            </Tile>
          </div>
          <div style={{ background: '#f3f2f1', padding: '4px 8px', fontSize: 12, fontWeight: 700 }}>With Text Wrapping</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: 8, padding: 10 }}>
            {WRAP_LAYOUTS.map((entry) => (
              <Tile key={entry.layout} selected={settings.layout === entry.layout} label={entry.label} onClick={() => onLayout(entry.layout)}>
                <WrapIcon layout={entry.layout} />
              </Tile>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 8px', fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="The picture stays with this text">
              <input type="radio" name={`picture-anchor-${settings.id}`} checked={settings.anchor !== 'page'} onChange={() => onAnchor('text')} />
              Move with text
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="Keep the picture at this spot. Drag it to move.">
              <input type="radio" name={`picture-anchor-${settings.id}`} checked={settings.anchor === 'page'} onChange={() => onAnchor('page')} />
              Fix position on page
            </label>
          </div>
          {more ? (
            <div style={{ borderTop: '1px solid #e5e5e5', padding: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>
                Width
                <input
                  type="range"
                  min={40}
                  max={420}
                  value={shownWidth}
                  aria-label="Picture width"
                  onInput={(event) => {
                    const next = Number(event.currentTarget.value);
                    widthRef.current = next;
                    setDragWidth(next);
                    onWidth(next);
                  }}
                  onPointerUp={() => {
                    const next = widthRef.current;
                    setDragWidth(null);
                    onCommitWidth(next);
                  }}
                  onKeyUp={() => {
                    const next = widthRef.current;
                    setDragWidth(null);
                    onCommitWidth(next);
                  }}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#555' }}>{shownWidth} px</div>
              {positioned ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <label style={{ fontSize: 12 }}>
                    Horizontal
                    <input type="number" value={settings.x} aria-label="Horizontal position" onChange={(event) => onPosition(Number(event.target.value), settings.y)} style={{ display: 'block', width: '100%', marginTop: 2, border: '1px solid #c8c8c8', padding: '2px 4px' }} />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Vertical
                    <input type="number" value={settings.y} aria-label="Vertical position" onChange={(event) => onPosition(settings.x, Number(event.target.value))} style={{ display: 'block', width: '100%', marginTop: 2, border: '1px solid #c8c8c8', padding: '2px 4px' }} />
                  </label>
                </div>
              ) : null}
              <button type="button" onClick={onRemove} style={{ marginTop: 10, border: '1px solid #c8c8c8', background: '#fff', color: '#111', padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                Remove picture
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 10px 8px' }}>
              <button type="button" onClick={onMore} style={{ border: 0, background: 'transparent', color: '#2b579a', fontSize: 13, cursor: 'pointer' }}>
                See more...
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>,
    document.body,
  );
}

function Tile({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      style={{ width: 36, height: 32, padding: 0, cursor: 'pointer', background: selected ? '#deecf9' : '#fff', border: selected ? '1px solid #7eb4ea' : '1px solid #e5e5e5' }}
    >
      {children}
    </button>
  );
}
