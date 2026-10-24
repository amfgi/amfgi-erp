'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Redo2,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';

import {
  useCreateQuotationCustomSectionMutation,
  useCreateQuotationTermsTemplateMutation,
  useDeleteQuotationCustomSectionMutation,
  useDeleteQuotationTermsTemplateMutation,
  useGetQuotationCustomSectionsQuery,
  useGetQuotationTermsTemplatesQuery,
  useUpdateQuotationCustomSectionMutation,
  useUpdateQuotationTermsTemplateMutation,
} from '@/store/hooks';
import {
  applySavedTerms,
  defaultBlank,
  defaultOption,
  defaultScope,
  defaultSpecification,
  emptyPriceRow,
  insertBlock,
  insertCustomSection,
  lineAmount,
  moveBlock,
  optionBlocks,
  optionTotal,
  padImageUrl,
  plainText,
  priceColumnWidths,
  presetAlreadyUsed,
  removeBlock,
  showOptionTitle,
  syncTotalCostWords,
  visibleRows,
  type PriceColumn,
  type QuotationBlock,
  type QuotationDocument,
} from '@/lib/sales/quotationDocument';

const PAGE_INNER_MM = 229;

const FONTS = ['Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Segoe UI', 'Garamond'] as const;
const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36'] as const;

const HIGHLIGHTS = [
  { name: 'Yellow', value: '#ffff00' },
  { name: 'Bright Green', value: '#00ff00' },
  { name: 'Turquoise', value: '#00ffff' },
  { name: 'Pink', value: '#ff00ff' },
  { name: 'Blue', value: '#0000ff' },
  { name: 'Red', value: '#ff0000' },
  { name: 'Dark Blue', value: '#000080' },
  { name: 'Teal', value: '#008080' },
  { name: 'Green', value: '#008000' },
  { name: 'Violet', value: '#800080' },
  { name: 'Dark Red', value: '#800000' },
  { name: 'Dark Yellow', value: '#808000' },
  { name: 'Gray 50%', value: '#808080' },
  { name: 'Gray 25%', value: '#c0c0c0' },
  { name: 'Black', value: '#000000' },
] as const;

const TEXT_COLORS = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200',
  '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0',
  '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
] as const;

type HeadingLevel = 'normal' | 'h1' | 'h2' | 'h3';

const HEADING_STYLES: Record<HeadingLevel, { tag: 'p' | 'h1' | 'h2' | 'h3'; label: string; pt: string; weight: string; color: string; margin: string }> = {
  normal: { tag: 'p', label: 'Normal', pt: '11', weight: '400', color: '', margin: '0' },
  h1: { tag: 'h1', label: 'Heading 1', pt: '16', weight: '700', color: '#111111', margin: '10pt 0 4pt' },
  h2: { tag: 'h2', label: 'Heading 2', pt: '14', weight: '700', color: '#111111', margin: '8pt 0 2pt' },
  h3: { tag: 'h3', label: 'Heading 3', pt: '12', weight: '700', color: '#111111', margin: '6pt 0 2pt' },
};

type FormatMarks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  fontFamily: string;
  fontSize: string;
  heading: HeadingLevel;
};

const DEFAULT_MARKS: FormatMarks = {
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  fontFamily: 'Calibri',
  fontSize: '11',
  heading: 'normal',
};

function preventToolbarMouseDown(event: ReactMouseEvent) {
  event.preventDefault();
}

function matchFont(family: string) {
  const cleaned = family.replace(/["']/g, '').toLowerCase();
  return FONTS.find((font) => cleaned.includes(font.toLowerCase())) ?? 'Calibri';
}

function matchSize(px: number) {
  const pt = Math.round((px * 72) / 96);
  return SIZES.reduce((nearest, size) => (Math.abs(Number(size) - pt) < Math.abs(Number(nearest) - pt) ? size : nearest), SIZES[3]);
}

function sameMarks(left: FormatMarks, right: FormatMarks) {
  return left.bold === right.bold
    && left.italic === right.italic
    && left.underline === right.underline
    && left.align === right.align
    && left.fontFamily === right.fontFamily
    && left.fontSize === right.fontSize
    && left.heading === right.heading;
}

function readHeading(element: Element | null): HeadingLevel {
  const tag = element?.closest('h1, h2, h3')?.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') return tag;
  return 'normal';
}

function readMarks(element: Element | null): FormatMarks {
  if (!element) return DEFAULT_MARKS;
  const style = window.getComputedStyle(element);
  const weight = style.fontWeight;
  const align = style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : 'left';
  return {
    bold: weight === 'bold' || Number(weight) >= 600,
    italic: style.fontStyle === 'italic',
    underline: style.textDecorationLine.includes('underline'),
    align,
    fontFamily: matchFont(style.fontFamily),
    fontSize: matchSize(parseFloat(style.fontSize) || 14.67),
    heading: readHeading(element),
  };
}

function isHeadingLevel(value: string | undefined): value is HeadingLevel {
  return value === 'normal' || value === 'h1' || value === 'h2' || value === 'h3';
}

function headingPointSize(node: HTMLElement) {
  const heading = node.closest('h1, h2, h3');
  if (!(heading instanceof HTMLElement)) return null;
  const inline = /^(\d+(?:\.\d+)?)pt$/i.exec(heading.style.fontSize);
  if (inline) return inline[1];
  if (heading.tagName === 'H1') return HEADING_STYLES.h1.pt;
  if (heading.tagName === 'H2') return HEADING_STYLES.h2.pt;
  if (heading.tagName === 'H3') return HEADING_STYLES.h3.pt;
  return null;
}

function isMaxFontNode(node: HTMLElement) {
  const size = node.style.fontSize.toLowerCase();
  return size.includes('xxx-large') || (node.tagName === 'FONT' && node.getAttribute('size') === '7');
}

function paintFontSize(field: HTMLElement, range: Range | null, pt: string, keepHeading = false) {
  for (const node of field.querySelectorAll<HTMLElement>('span, font, div, p')) {
    if (!isMaxFontNode(node)) continue;
    if (range) {
      try {
        if (!range.intersectsNode(node)) continue;
      } catch {
        continue;
      }
    }
    node.style.fontSize = `${(keepHeading ? headingPointSize(node) : null) ?? pt}pt`;
    node.removeAttribute('size');
  }
}

function paintHeadingBlock(block: HTMLElement, level: HeadingLevel) {
  const spec = HEADING_STYLES[level];
  block.style.fontSize = `${spec.pt}pt`;
  block.style.fontWeight = spec.weight;
  block.style.lineHeight = '1.15';
  block.style.margin = spec.margin;
  block.style.color = spec.color;
  for (const child of block.querySelectorAll<HTMLElement>('span, font, b, strong')) {
    child.style.fontSize = '';
    child.style.fontWeight = '';
    if (child.tagName === 'FONT') child.removeAttribute('size');
  }
}

function blocksInSelection(field: HTMLElement, tag: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return [];
  const range = selection.getRangeAt(0);
  const matches: HTMLElement[] = [];
  for (const node of field.querySelectorAll<HTMLElement>(tag)) {
    if (node === field || !field.contains(node)) continue;
    try {
      if (!range.intersectsNode(node)) continue;
    } catch {
      continue;
    }
    matches.push(node);
  }
  return matches.filter((node) => !matches.some((other) => other !== node && node.contains(other)));
}

function applyHeading(field: HTMLElement, level: HeadingLevel) {
  const spec = HEADING_STYLES[level];
  const text = field.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
  if (!text && field.querySelectorAll('table, img').length === 0) {
    field.innerHTML = `<${spec.tag}><br></${spec.tag}>`;
    const block = field.querySelector<HTMLElement>(`:scope > ${spec.tag}`);
    if (!block) return;
    paintHeadingBlock(block, level);
    const range = window.document.createRange();
    range.setStart(block, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return;
  }
  window.document.execCommand('formatBlock', false, spec.tag);
  let blocks = blocksInSelection(field, spec.tag);
  if (blocks.length === 0) {
    window.document.execCommand('formatBlock', false, `<${spec.tag}>`);
    blocks = blocksInSelection(field, spec.tag);
  }
  for (const block of blocks) paintHeadingBlock(block, level);
}

const SECTION_CHOICES = [
  { type: 'terms', label: 'Terms & Conditions', hint: 'VAT, warranty, delivery' },
  { type: 'scope', label: 'Not in our scope', hint: 'What the quote leaves out' },
  { type: 'specification', label: 'Specification & Note', hint: 'Numbered specification' },
  { type: 'option', label: 'Price option', hint: 'Another priced table' },
  { type: 'blank', label: 'Custom Section', hint: 'A blank section you write' },
] as const;

function mutationMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const message = (error as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  return fallback;
}

function money(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizedHtml(value: string) {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '<br>' || trimmed === '<div><br></div>') return '';
  return trimmed;
}

function caretOffset(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return range.toString().length;
}

function placeCaret(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const walker = window.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = window.document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = window.document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function tableColumns(table: HTMLTableElement, count: number) {
  let group = table.querySelector('colgroup');
  if (!group) {
    group = table.ownerDocument.createElement('colgroup');
    table.insertBefore(group, table.firstChild);
  }
  while (group.children.length < count) {
    const col = table.ownerDocument.createElement('col');
    col.style.width = `${100 / count}%`;
    group.appendChild(col);
  }
  return [...group.querySelectorAll('col')];
}

function RichText({
  value,
  onChange,
  readOnly,
  className,
  style,
  onFocusField,
  allowTable = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  style?: CSSProperties;
  onFocusField?: (element: HTMLElement) => void;
  allowTable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef(value || '');
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const next = value || '';
    const focused = window.document.activeElement === node;
    if (normalizedHtml(node.innerHTML) === normalizedHtml(next)) {
      if (!focused || caret.current == null) return;
      const selection = window.getSelection();
      if (selection?.rangeCount && node.contains(selection.anchorNode)) return;
      placeCaret(node, caret.current);
      return;
    }
    // While typing, the browser owns this DOM. Rewriting it clears the caret.
    // Only put the text back when a re-render wiped the field.
    if (focused && emitted.current === next) {
      if (normalizedHtml(node.innerHTML) !== '') return;
      const offset = caret.current;
      node.innerHTML = next;
      if (offset != null) placeCaret(node, offset);
      return;
    }
    node.innerHTML = next;
    paintFontSize(node, null, '11', true);
    const cleaned = node.innerHTML;
    emitted.current = cleaned;
    if (normalizedHtml(cleaned) !== normalizedHtml(next)) onChange?.(cleaned);
    if (focused) {
      node.focus();
      placeCaret(node, caret.current ?? node.textContent?.length ?? 0);
    }
  }, [value]);

  function rememberCaret() {
    const node = ref.current;
    if (!node) return;
    caret.current = caretOffset(node);
  }

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline="true"
      contentEditable={!readOnly}
      data-allow-table={allowTable ? 'true' : undefined}
      suppressContentEditableWarning
      style={style}
      className={`min-h-[1.25rem] outline-none ${allowTable ? '' : 'whitespace-pre-wrap'} ${readOnly ? '' : 'rounded-sm focus:bg-sky-50/80 focus:outline focus:outline-1 focus:outline-sky-400'} ${className ?? ''}`}
      onFocus={(event) => onFocusField?.(event.currentTarget)}
      onKeyDown={(event) => {
        if (readOnly || (event.key !== 'Backspace' && event.key !== 'Delete')) return;
        const node = ref.current;
        const selection = window.getSelection();
        if (!node || !selection?.rangeCount || !selection.isCollapsed || !node.contains(selection.anchorNode)) return;
        const offset = caretOffset(node) ?? 0;
        const total = node.textContent?.length ?? 0;
        if ((event.key === 'Backspace' && offset === 0) || (event.key === 'Delete' && offset === total)) {
          event.preventDefault();
        }
      }}
      onPointerDown={(event) => {
        if (!allowTable || event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const cell = target.closest('td, th');
        if (!(cell instanceof HTMLTableCellElement) || !ref.current?.contains(cell)) return;
        const rect = cell.getBoundingClientRect();
        if (rect.right - event.clientX > 8) return;
        const row = cell.parentElement;
        const table = cell.closest('table');
        if (!row || !table) return;
        const index = [...row.children].indexOf(cell);
        if (index < 0 || index >= row.children.length - 1) return;
        event.preventDefault();
        const tableWidth = table.getBoundingClientRect().width || 1;
        const startX = event.clientX;
        const start = rect.width;
        const neighbor = row.children[index + 1].getBoundingClientRect().width;
        const cols = tableColumns(table, row.children.length);
        function move(moveEvent: PointerEvent) {
          let width = start + (moveEvent.clientX - startX);
          let other = neighbor - (moveEvent.clientX - startX);
          if (width < 28) {
            other -= 28 - width;
            width = 28;
          }
          if (other < 28) {
            width -= 28 - other;
            other = 28;
          }
          cols[index].style.width = `${(width / tableWidth) * 100}%`;
          cols[index + 1].style.width = `${(other / tableWidth) * 100}%`;
        }
        function up() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          const html = ref.current?.innerHTML ?? '';
          emitted.current = html;
          onChange?.(html);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onInput={(event) => {
        const field = event.currentTarget;
        paintFontSize(field, null, '11', true);
        const html = field.innerHTML;
        emitted.current = html;
        rememberCaret();
        onChange?.(html);
      }}
    />
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded border px-1"
      onMouseDown={preventToolbarMouseDown}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SwatchMenu({
  label,
  open,
  onToggle,
  onClose,
  colors,
  current,
  automatic,
  none,
  icon,
  onPick,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  colors: readonly string[] | readonly { name: string; value: string }[];
  current: string;
  automatic?: string;
  none?: boolean;
  icon: ReactNode;
  onPick: (color: string) => void;
}) {
  const entries = colors.map((color) => (typeof color === 'string' ? { name: color, value: color } : color));
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        className="inline-flex h-8 w-8 flex-col items-center justify-center rounded-l border px-1"
        onMouseDown={preventToolbarMouseDown}
        onClick={() => onPick(current)}
      >
        {icon}
        <span className="mt-0.5 block h-1 w-4 border border-[#d4d4d4]" style={{ backgroundColor: current === 'transparent' ? '#ffff00' : current }} />
      </button>
      <button
        type="button"
        aria-label={`${label} colors`}
        title={`${label} colors`}
        className="inline-flex h-8 w-4 items-center justify-center rounded-r border border-l-0"
        onMouseDown={preventToolbarMouseDown}
        onClick={onToggle}
      >
        <ChevronDown className="size-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[9.5rem] rounded border border-[#d4d4d4] bg-white p-2 shadow-lg" onMouseDown={preventToolbarMouseDown}>
          <div className="grid grid-cols-5 gap-1">
            {entries.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.name}
                aria-label={color.name}
                className="quotation-swatch size-5 rounded-sm border"
                style={{ '--swatch': color.value } as CSSProperties}
                onClick={() => {
                  onPick(color.value);
                  onClose();
                }}
              />
            ))}
          </div>
          {automatic ? (
            <button type="button" className="mt-2 w-full rounded border px-2 py-1 text-left text-xs" onClick={() => { onPick(automatic); onClose(); }}>
              Automatic
            </button>
          ) : null}
          {none ? (
            <button type="button" className="mt-1 w-full rounded border px-2 py-1 text-left text-xs" onClick={() => { onPick('transparent'); onClose(); }}>
              No Color
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function TableMenu({ disabled, onInsert }: { disabled: boolean; onInsert: (rows: number, cols: number) => void }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 1, cols: 1 });
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.document.addEventListener('mousedown', close);
    return () => window.document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span ref={rootRef} className="relative">
      <ToolButton label={disabled ? 'Click in the description, then insert a table' : 'Insert table'} onClick={() => { if (!disabled) setOpen((current) => !current); }}>
        <Table2 className={`size-4 ${disabled ? 'opacity-40' : ''}`} />
      </ToolButton>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 rounded border border-[#d4d4d4] bg-white p-2 shadow-lg" onMouseDown={preventToolbarMouseDown}>
          <div className="grid grid-cols-5 gap-0.5">
            {Array.from({ length: 25 }, (_, index) => {
              const row = Math.floor(index / 5) + 1;
              const col = (index % 5) + 1;
              const active = row <= hover.rows && col <= hover.cols;
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  aria-label={`${row} by ${col} table`}
                  className={`size-4 border ${active ? 'border-[#7eb4ea] bg-[#cce4f7]' : 'border-[#d4d4d4] bg-white'}`}
                  onMouseEnter={() => setHover({ rows: row, cols: col })}
                  onClick={() => {
                    onInsert(row, col);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>
          <p className="mt-1 text-center text-[10px] text-slate-600">{hover.rows} × {hover.cols}</p>
        </div>
      ) : null}
    </span>
  );
}

function FormatControls({
  variant,
  marks,
  highlight,
  fontColor,
  onFormat,
  onPrepare,
  tableReady,
  onInsertTable,
}: {
  variant: 'full' | 'compact';
  marks: FormatMarks;
  highlight: string;
  fontColor: string;
  onFormat: (command: string, value?: string) => void;
  onPrepare: () => void;
  tableReady?: boolean;
  onInsertTable?: (rows: number, cols: number) => void;
}) {
  const [open, setOpen] = useState<'highlight' | 'color' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    window.document.addEventListener('mousedown', close);
    return () => window.document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1">
      {variant === 'full' ? (
        <>
          <ToolButton label="Undo" onClick={() => onFormat('undo')}><Undo2 className="size-4" /></ToolButton>
          <ToolButton label="Redo" onClick={() => onFormat('redo')}><Redo2 className="size-4" /></ToolButton>
          <span className="mx-0.5 h-6 w-px bg-[#d4d4d4]" />
        </>
      ) : null}
      <select
        aria-label="Heading"
        title="Heading"
        value={marks.heading}
        onMouseDown={onPrepare}
        onChange={(event) => onFormat('heading', event.target.value)}
        className="h-8 max-w-[8.5rem] rounded border px-1 text-sm"
      >
        {(Object.keys(HEADING_STYLES) as HeadingLevel[]).map((level) => (
          <option key={level} value={level}>{HEADING_STYLES[level].label}</option>
        ))}
      </select>
      <span className="mx-0.5 h-6 w-px bg-[#d4d4d4]" />
      <select
        aria-label="Font"
        title="Font"
        value={marks.fontFamily}
        onMouseDown={onPrepare}
        onChange={(event) => onFormat('fontName', event.target.value)}
        className="h-8 max-w-[9.5rem] rounded border px-1 text-sm"
        style={{ fontFamily: marks.fontFamily }}
      >
        {FONTS.map((family) => (
          <option key={family} value={family} style={{ fontFamily: family }}>{family}</option>
        ))}
      </select>
      <select
        aria-label="Font size"
        title="Font size"
        value={marks.fontSize}
        onMouseDown={onPrepare}
        onChange={(event) => onFormat('fontSize', event.target.value)}
        className="h-8 w-14 rounded border px-1 text-sm"
      >
        {SIZES.map((size) => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>
      <span className="mx-0.5 h-6 w-px bg-[#d4d4d4]" />
      <ToolButton label="Bold" pressed={marks.bold} onClick={() => onFormat('bold')}><Bold className="size-4" /></ToolButton>
      <ToolButton label="Italic" pressed={marks.italic} onClick={() => onFormat('italic')}><Italic className="size-4" /></ToolButton>
      <ToolButton label="Underline" pressed={marks.underline} onClick={() => onFormat('underline')}><Underline className="size-4" /></ToolButton>
      <SwatchMenu
        label="Font color"
        open={open === 'color'}
        onToggle={() => setOpen((current) => (current === 'color' ? null : 'color'))}
        onClose={() => setOpen(null)}
        colors={TEXT_COLORS}
        current={fontColor}
        automatic="#111111"
        icon={<span className="text-sm font-semibold leading-none">A</span>}
        onPick={(color) => onFormat('foreColor', color)}
      />
      <SwatchMenu
        label="Text highlight"
        open={open === 'highlight'}
        onToggle={() => setOpen((current) => (current === 'highlight' ? null : 'highlight'))}
        onClose={() => setOpen(null)}
        colors={HIGHLIGHTS}
        current={highlight}
        none
        icon={<Highlighter className="size-3.5" />}
        onPick={(color) => onFormat('hiliteColor', color)}
      />
      {variant === 'full' ? (
        <>
          <span className="mx-0.5 h-6 w-px bg-[#d4d4d4]" />
          <ToolButton label="Align left" pressed={marks.align === 'left'} onClick={() => onFormat('justifyLeft')}><AlignLeft className="size-4" /></ToolButton>
          <ToolButton label="Align center" pressed={marks.align === 'center'} onClick={() => onFormat('justifyCenter')}><AlignCenter className="size-4" /></ToolButton>
          <ToolButton label="Align right" pressed={marks.align === 'right'} onClick={() => onFormat('justifyRight')}><AlignRight className="size-4" /></ToolButton>
          <ToolButton label="Bullets" onClick={() => onFormat('insertUnorderedList')}><List className="size-4" /></ToolButton>
          <ToolButton label="Numbering" onClick={() => onFormat('insertOrderedList')}><ListOrdered className="size-4" /></ToolButton>
          {onInsertTable ? <TableMenu disabled={!tableReady} onInsert={onInsertTable} /> : null}
        </>
      ) : null}
    </div>
  );
}

function Field({
  value,
  onChange,
  readOnly,
  className,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  if (readOnly) return <span className={className}>{value}</span>;
  return (
    <input
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className={`bg-transparent outline-none ${className ?? ''}`}
    />
  );
}

export function QuotationSheet({
  document,
  onChange,
  readOnly = false,
  quotationNumber,
  letterheadUrl,
  acceptedOptionIndex = null,
  po = null,
  sourceCustomerName = '',
}: {
  document: QuotationDocument;
  onChange?: (document: QuotationDocument) => void;
  readOnly?: boolean;
  quotationNumber: string;
  letterheadUrl?: string | null;
  acceptedOptionIndex?: number | null;
  po?: { number: string; date: string; value: string } | null;
  sourceCustomerName?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const richField = useRef<HTMLElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  const [marks, setMarks] = useState<FormatMarks>(DEFAULT_MARKS);
  const [highlight, setHighlight] = useState('#ffff00');
  const [fontColor, setFontColor] = useState('#c00000');
  const [tableReady, setTableReady] = useState(false);
  const [termsListOpen, setTermsListOpen] = useState(false);
  const [saveTerms, setSaveTerms] = useState<Array<{ label: string; value: string }> | null>(null);
  const [saveSection, setSaveSection] = useState<{ name: string; body: string; minHeightMm: number; widthPercent: number } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [renameTarget, setRenameTarget] = useState<null | { kind: 'terms' | 'section'; id: string }>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const termsQuery = useGetQuotationTermsTemplatesQuery(undefined, { skip: readOnly });
  const [createTerms, createTermsState] = useCreateQuotationTermsTemplateMutation();
  const [renameTerms, renameTermsState] = useUpdateQuotationTermsTemplateMutation();
  const [deleteTerms] = useDeleteQuotationTermsTemplateMutation();
  const customQuery = useGetQuotationCustomSectionsQuery(undefined, { skip: readOnly });
  const [createCustomSection, createCustomSectionState] = useCreateQuotationCustomSectionMutation();
  const [renameSection, renameSectionState] = useUpdateQuotationCustomSectionMutation();
  const [deleteSection] = useDeleteQuotationCustomSectionMutation();
  const termsItems = useMemo(
    () => (termsQuery.data ?? []).map((entry) => ({ id: entry.id, label: entry.name, searchText: entry.name })),
    [termsQuery.data],
  );
  const undoStack = useRef<QuotationDocument[]>([]);
  const redoStack = useRef<QuotationDocument[]>([]);
  const documentRef = useRef(document);
  const undoEditRef = useRef<() => void>(() => {});
  const redoEditRef = useRef<() => void>(() => {});
  documentRef.current = document;
  const [pagesOfIds, setPagesOfIds] = useState<string[][] | null>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const options = optionBlocks(document);
  const visibleBlocks = useMemo(() => {
    if (acceptedOptionIndex == null) return document.blocks;
    let seen = 0;
    return document.blocks.filter((block) => {
      if (block.type !== 'option') return true;
      const keep = seen === acceptedOptionIndex;
      seen += 1;
      return keep;
    });
  }, [acceptedOptionIndex, document.blocks]);
  function update(next: QuotationDocument) {
    onChange?.(syncTotalCostWords(next));
  }

  function pushHistory() {
    undoStack.current.push(structuredClone(documentRef.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }

  function patchBlock(blockId: string, block: QuotationBlock, recordHistory = false) {
    if (recordHistory) pushHistory();
    update({ ...document, blocks: document.blocks.map((entry) => (entry.id === blockId ? block : entry)) });
  }

  const blockIds = useMemo(() => ['header', ...visibleBlocks.map((block) => block.id)], [visibleBlocks]);

  useEffect(() => {
    if (readOnly) return;
    const root = window.document.documentElement;
    const count = Number(root.dataset.quotationEditing || '0') + 1;
    root.dataset.quotationEditing = String(count);
    root.classList.add('quotation-editing');
    return () => {
      const next = Number(root.dataset.quotationEditing || '1') - 1;
      if (next <= 0) {
        delete root.dataset.quotationEditing;
        root.classList.remove('quotation-editing');
      } else {
        root.dataset.quotationEditing = String(next);
      }
    };
  }, [readOnly]);
  const pages = pagesOfIds && pagesOfIds.flat().join('|') === blockIds.join('|') ? pagesOfIds : [blockIds];

  useEffect(() => {
    function remember() {
      const selection = window.getSelection();
      const pad = sheetRef.current;
      if (!selection?.rangeCount || !pad) {
        setBubble(null);
        return;
      }
      const node = selection.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement ?? null;
      const editable = element?.closest('[contenteditable="true"]');
      if (!node || !pad.contains(node) || !(editable instanceof HTMLElement) || !pad.contains(editable)) {
        setBubble(null);
        setTableReady(false);
        return;
      }
      savedRange.current = selection.getRangeAt(0).cloneRange();
      richField.current = editable;
      setTableReady(editable.dataset.allowTable === 'true');
      const nextMarks = readMarks(element);
      setMarks((current) => (sameMarks(current, nextMarks) ? current : nextMarks));
      if (selection.isCollapsed) {
        setBubble(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setBubble(null);
        return;
      }
      setBubble({ top: Math.max(8, rect.top - 8), left: rect.left + rect.width / 2 });
    }
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const redo = key === 'y' || (key === 'z' && event.shiftKey);
      const undo = key === 'z' && !event.shiftKey;
      if (!undo && !redo) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (undo && undoStack.current.length) {
        event.preventDefault();
        undoEditRef.current();
      }
      if (redo && redoStack.current.length) {
        event.preventDefault();
        redoEditRef.current();
      }
    }
    window.document.addEventListener('selectionchange', remember);
    window.addEventListener('scroll', remember, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.document.removeEventListener('selectionchange', remember);
      window.removeEventListener('scroll', remember, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useLayoutEffect(() => {
    const root = sheetRef.current;
    if (!root) return;
    function measure() {
      const current = sheetRef.current;
      if (!current) return;
      const frame = current.querySelector<HTMLElement>('.quotation-page > .relative');
      const frameStyle = frame ? window.getComputedStyle(frame) : null;
      const limit = frame && frameStyle
        ? frame.clientHeight - parseFloat(frameStyle.paddingTop || '0') - parseFloat(frameStyle.paddingBottom || '0') - 2
        : (PAGE_INNER_MM / 25.4) * 96;
      const nodes = [...current.querySelectorAll<HTMLElement>('[data-break]')];
      let used = 0;
      const next: string[][] = [[]];
      for (const node of nodes) {
        const style = window.getComputedStyle(node);
        const height = node.offsetHeight + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
        const page = next[next.length - 1];
        const id = node.dataset.break || '';
        if (page.length > 0 && used + height > limit + 4) {
          next.push([id]);
          used = height;
        } else {
          page.push(id);
          used += height;
        }
      }
      const packed = next.filter((page) => page.length > 0);
      const focused = window.document.activeElement;
      const focusedBreak = focused instanceof HTMLElement ? focused.closest('[data-break]')?.getAttribute('data-break') : null;
      if (focusedBreak) {
        const oldPage = (pagesOfIds ?? [blockIds]).findIndex((ids) => ids.includes(focusedBreak));
        const newPage = packed.findIndex((ids) => ids.includes(focusedBreak));
        if (oldPage !== -1 && newPage !== -1 && oldPage !== newPage) return;
      }
      setPagesOfIds((currentPages) => (currentPages && currentPages.map((page) => page.join('|')).join(';') === packed.map((page) => page.join('|')).join(';') ? currentPages : packed));
    }
    const active = window.document.activeElement;
    const editing = active instanceof HTMLElement
      && root.contains(active)
      && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
    if (!editing) {
      measure();
      return;
    }
    const timer = window.setTimeout(measure, 400);
    return () => window.clearTimeout(timer);
  }, [blockIds, document, layoutNonce, pagesOfIds, po, quotationNumber, visibleBlocks]);

  useEffect(() => {
    const root = sheetRef.current;
    if (!root) return;
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      setLayoutNonce((value) => value + 1);
    };
    root.addEventListener('focusout', onFocusOut);
    return () => root.removeEventListener('focusout', onFocusOut);
  }, []);

  function prepareFormat() {
    const selection = window.getSelection();
    const pad = sheetRef.current;
    if (!selection?.rangeCount || !pad) return;
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement ?? null;
    const editable = element?.closest('[contenteditable="true"]');
    if (!node || !pad.contains(node) || !(editable instanceof HTMLElement)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
    richField.current = editable;
  }

  function restoreDocument(next: QuotationDocument) {
    onChange?.(syncTotalCostWords(next));
  }

  function undoEdit() {
    const previous = undoStack.current.pop();
    if (!previous) {
      applyCommand('undo');
      return;
    }
    redoStack.current.push(structuredClone(documentRef.current));
    restoreDocument(previous);
  }

  function redoEdit() {
    const next = redoStack.current.pop();
    if (!next) {
      applyCommand('redo');
      return;
    }
    undoStack.current.push(structuredClone(documentRef.current));
    restoreDocument(next);
  }

  function applyCommand(command: string, value?: string) {
    const field = richField.current;
    field?.focus();
    const selection = window.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    window.document.execCommand('styleWithCSS', false, 'true');
    if (command === 'heading') {
      if (field && isHeadingLevel(value)) applyHeading(field, value);
    } else if (command === 'fontSize') {
      const pt = SIZES.includes(value as (typeof SIZES)[number]) ? value! : '11';
      window.document.execCommand('fontSize', false, '7');
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : savedRange.current;
      if (field) paintFontSize(field, range, pt);
    } else {
      window.document.execCommand(command, false, value);
    }
    if (command === 'hiliteColor' && value && value !== 'transparent') setHighlight(value);
    if (command === 'foreColor' && value) setFontColor(value);
    field?.dispatchEvent(new Event('input', { bubbles: true }));
    const nextSelection = window.getSelection();
    if (nextSelection?.rangeCount) {
      savedRange.current = nextSelection.getRangeAt(0).cloneRange();
      const anchor = nextSelection.anchorNode;
      const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      if (anchorElement) setMarks(readMarks(anchorElement));
    }
  }

  function format(command: string, value?: string) {
    if (command === 'undo') {
      undoEdit();
      return;
    }
    if (command === 'redo') {
      redoEdit();
      return;
    }
    applyCommand(command, value);
  }

  function insertTable(rows: number, cols: number) {
    const field = richField.current;
    if (!field || field.dataset.allowTable !== 'true') return;
    const safeRows = Math.min(5, Math.max(1, rows));
    const safeCols = Math.min(5, Math.max(1, cols));
    const cells = '<td><br></td>'.repeat(safeCols);
    const body = `<tr>${cells}</tr>`.repeat(safeRows);
    const share = (100 / safeCols).toFixed(2);
    const columnMarkup = `<col style="width:${share}%" />`.repeat(safeCols);
    applyCommand('insertHTML', `<table class="quotation-insert"><colgroup>${columnMarkup}</colgroup><tbody>${body}</tbody></table>`);
  }

  undoEditRef.current = undoEdit;
  redoEditRef.current = redoEdit;

  function addSection(type: (typeof SECTION_CHOICES)[number]['type']) {
    if (type === 'scope' || type === 'specification') {
      if (presetAlreadyUsed(document, type)) {
        window.document.getElementById(document.blocks.find((block) => block.type === type)?.id || '')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      update(insertBlock(document, type === 'scope' ? defaultScope() : defaultSpecification()));
      return;
    }
    update(insertBlock(document, type === 'option' ? defaultOption() : defaultBlank()));
  }

  function chooseSavedTerms(templateId: string) {
    const template = termsQuery.data?.find((entry) => entry.id === templateId);
    if (!template) return;
    pushHistory();
    const next = applySavedTerms(document, template.rows);
    update(next);
    setTermsListOpen(false);
    const termsId = next.blocks.find((block) => block.type === 'terms')?.id;
    if (termsId) window.requestAnimationFrame(() => window.document.getElementById(termsId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function insertSavedSection(sectionId: string) {
    const saved = customQuery.data?.find((entry) => entry.id === sectionId);
    if (!saved) return;
    pushHistory();
    const previous = new Set(document.blocks.map((block) => block.id));
    const next = insertCustomSection(document, saved.content);
    update(next);
    const added = next.blocks.find((block) => !previous.has(block.id));
    if (added) window.requestAnimationFrame(() => window.document.getElementById(added.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  async function submitSavedTerms(event: FormEvent) {
    event.preventDefault();
    if (!saveTerms) return;
    setSaveError('');
    try {
      await createTerms({ name: saveName, rows: saveTerms }).unwrap();
      setSaveTerms(null);
      setSaveName('');
      toast.success('Terms saved');
    } catch (error) {
      setSaveError(error && typeof error === 'object' && 'data' in error && typeof (error as { data?: { error?: string } }).data?.error === 'string'
        ? (error as { data?: { error?: string } }).data?.error || 'Could not save the terms'
        : 'Could not save the terms');
    }
  }

  function openRename(kind: 'terms' | 'section', id: string, name: string) {
    setRenameError('');
    setRenameName(name);
    setRenameTarget({ kind, id });
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renameTarget) return;
    setRenameError('');
    try {
      if (renameTarget.kind === 'terms') await renameTerms({ id: renameTarget.id, name: renameName }).unwrap();
      else await renameSection({ id: renameTarget.id, name: renameName }).unwrap();
      setRenameTarget(null);
      setRenameName('');
      toast.success('Name updated');
    } catch (error) {
      setRenameError(mutationMessage(error, 'Could not rename'));
    }
  }

  async function removeSaved(kind: 'terms' | 'section', id: string, name: string) {
    const label = kind === 'terms' ? 'terms' : 'section';
    if (!window.confirm(`Delete the saved ${label} “${name}”? Quotations that already use it keep their copy.`)) return;
    try {
      if (kind === 'terms') await deleteTerms(id).unwrap();
      else await deleteSection(id).unwrap();
      toast.success(kind === 'terms' ? 'Saved terms deleted' : 'Saved section deleted');
    } catch (error) {
      toast.error(mutationMessage(error, 'Could not delete'));
    }
  }

  async function submitSavedSection(event: FormEvent) {
    event.preventDefault();
    if (!saveSection) return;
    setSaveError('');
    try {
      await createCustomSection({ name: saveName, content: saveSection }).unwrap();
      setSaveSection(null);
      setSaveName('');
      toast.success('Section saved');
    } catch (error) {
      setSaveError(error && typeof error === 'object' && 'data' in error && typeof (error as { data?: { error?: string } }).data?.error === 'string'
        ? (error as { data?: { error?: string } }).data?.error || 'Could not save the section'
        : 'Could not save the section');
    }
  }

  const pad = padImageUrl(letterheadUrl);

  return (
    <div ref={sheetRef} className="quotation-sheet flex items-start gap-4">
      {readOnly ? null : (
        <aside className="quotation-edit-only sticky top-0 z-20 max-h-[calc(100dvh-5rem)] w-56 shrink-0 space-y-3 self-start overflow-y-auto">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a section</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">A price option goes under the item list. Other sections stay above the closing.</p>
            <div className="mt-3 flex flex-col gap-2">
              {SECTION_CHOICES.map((choice) => {
                const used = choice.type === 'terms' || choice.type === 'scope' || choice.type === 'specification'
                  ? presetAlreadyUsed(document, choice.type)
                  : false;
                if (choice.type === 'terms') {
                  return (
                    <div key={choice.type} className="relative">
                      <button
                        type="button"
                        onClick={() => setTermsListOpen((open) => !open)}
                        className={`cursor-pointer w-full rounded-md border px-3 py-2 text-left ${used ? 'border-border bg-muted/60 text-muted-foreground' : 'border-border bg-background hover:bg-muted/50'}`}
                      >
                        <span className="block text-sm font-medium">{used ? choice.label : `+ ${choice.label}`}</span>
                        <span className="block text-[11px] text-muted-foreground">{used ? 'On the page' : choice.hint}</span>
                      </button>
                      {termsListOpen ? (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
                          {termsItems.length ? termsItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-1 pr-1 hover:bg-muted/60">
                              <button
                                type="button"
                                className="min-w-0 flex-1 cursor-pointer px-3 py-1.5 text-left text-sm"
                                onClick={() => chooseSavedTerms(item.id)}
                              >
                                {item.label}
                              </button>
                              <button
                                type="button"
                                aria-label={`Rename ${item.label}`}
                                title="Rename"
                                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                                onClick={() => openRename('terms', item.id, item.label)}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${item.label}`}
                                title="Delete"
                                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                                onClick={() => void removeSaved('terms', item.id, item.label)}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )) : (
                            <p className="px-3 py-1.5 text-[11px] text-muted-foreground">No saved terms yet</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                }
                const button = (
                  <button
                    key={choice.type}
                    type="button"
                    onClick={() => addSection(choice.type)}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-left ${used ? 'border-border bg-muted/60 text-muted-foreground' : 'border-border bg-background hover:bg-muted/50'}`}
                  >
                    <span className="block text-sm font-medium">{used ? choice.label : `+ ${choice.label}`}</span>
                    <span className="block text-[11px] text-muted-foreground">{used ? 'On the page' : choice.hint}</span>
                  </button>
                );
                if (choice.type !== 'blank') return button;
                return (
                  <Fragment key={choice.type}>
                    {(customQuery.data ?? []).map((item) => (
                      <div key={item.id} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          onClick={() => insertSavedSection(item.id)}
                          className="min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-muted/50"
                        >
                          <span className="block text-sm font-medium">+ {item.name}</span>
                          <span className="block text-[11px] text-muted-foreground">Saved section</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${item.name}`}
                          title="Rename"
                          className="cursor-pointer rounded-md border border-border px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={() => openRename('section', item.id, item.name)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                          className="cursor-pointer rounded-md border border-border px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={() => void removeSaved('section', item.id, item.name)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {button}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {readOnly ? null : (
          <div className="quotation-format quotation-edit-only sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 shadow-sm">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide">Format</span>
            <FormatControls variant="full" marks={marks} highlight={highlight} fontColor={fontColor} onFormat={format} onPrepare={prepareFormat} tableReady={tableReady} onInsertTable={insertTable} />
          </div>
        )}
        {bubble && !readOnly ? (
          <div
            className="quotation-bubble quotation-format fixed z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-full flex-wrap items-center gap-1 rounded-lg border p-1 shadow-lg"
            style={{ top: bubble.top, left: bubble.left }}
            onMouseDown={(event) => {
              const target = event.target;
              if (target instanceof Element && target.closest('select, option')) return;
              event.preventDefault();
            }}
          >
            <FormatControls variant="compact" marks={marks} highlight={highlight} fontColor={fontColor} onFormat={format} onPrepare={prepareFormat} />
          </div>
        ) : null}
        <div className="quotation-pages flex flex-col items-center gap-8 overflow-x-auto py-2">
          {pages.map((ids, pageIndex) => (
            <article key={pageIndex} className="quotation-page quotation-pad relative shrink-0 overflow-hidden shadow" style={{ width: '210mm', height: '297mm', fontFamily: 'Calibri, Candara, Arial, sans-serif' }}>
              <img src={pad} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
              <div className="relative z-[1] h-full px-[14mm] pb-[26mm] pt-[40mm]">
                {ids.includes('header') ? (
                  <div data-break="header">
                    <div className="flex justify-end">
                      <div className="flex items-baseline gap-1 text-[12pt] font-semibold underline">
                        <span>TRN-</span>
                        <Field value={document.trn} readOnly={readOnly} className="w-[46mm] shrink-0" onChange={(trn) => update({ ...document, trn })} />
                      </div>
                    </div>
                    <h2 className="quotation-doc-title text-center text-[16pt] font-bold underline" style={{ margin: 0, fontSize: '16pt', fontWeight: 700, lineHeight: 'normal', color: '#111111' }}>Quotation</h2>
                    <div className="mt-2 border border-black text-[11pt]">
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="border-r border-black px-2 py-1"><span className="font-semibold">Quotation Number:</span> {quotationNumber || 'Assigned when forwarded'}</div>
                        <div className="flex items-center gap-2 px-2 py-1"><span className="font-semibold">Date:</span> {readOnly ? displayDate(document.date) : <input type="date" value={document.date} onChange={(event) => update({ ...document, date: event.target.value })} className="bg-transparent outline-none" />}</div>
                      </div>
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="space-y-0.5 border-r border-black px-2 py-1">
                          <div className="flex items-start gap-1">
                            <p className="flex min-w-0 flex-1 gap-2"><span className="shrink-0 font-semibold">M/S.</span><Field value={document.customer.name} readOnly={readOnly} className="min-w-0 flex-1" onChange={(name) => update({ ...document, customer: { ...document.customer, name } })} /></p>
                            {readOnly || !sourceCustomerName ? null : (
                              <button
                                type="button"
                                className="quotation-edit-only shrink-0 rounded border border-sky-700 px-1 py-0.5 text-[9px] leading-tight text-sky-800"
                                onClick={() => update({ ...document, customer: { ...document.customer, name: sourceCustomerName } })}
                              >
                                Use query name
                              </button>
                            )}
                          </div>
                          <Field value={document.customer.city} readOnly={readOnly} className="block w-full" onChange={(city) => update({ ...document, customer: { ...document.customer, city } })} />
                          <p className="flex gap-2"><span className="shrink-0">TEL:</span><Field value={document.customer.tel} readOnly={readOnly} className="min-w-0 flex-1" onChange={(tel) => update({ ...document, customer: { ...document.customer, tel } })} /><span className="shrink-0">FAX:</span><Field value={document.customer.fax} readOnly={readOnly} className="min-w-0 flex-1" onChange={(fax) => update({ ...document, customer: { ...document.customer, fax } })} /></p>
                        </div>
                        <div className="space-y-0.5 px-2 py-1">
                          <p className="flex gap-2"><span className="shrink-0">Contact Name:</span><Field value={document.customer.contactName} readOnly={readOnly} className="min-w-0 flex-1" onChange={(contactName) => update({ ...document, customer: { ...document.customer, contactName } })} /></p>
                          <p className="flex gap-2"><span className="shrink-0">Contact Number:</span><Field value={document.customer.contactNumber} readOnly={readOnly} className="min-w-0 flex-1" onChange={(contactNumber) => update({ ...document, customer: { ...document.customer, contactNumber } })} /></p>
                          <p className="flex gap-2"><span className="shrink-0">Email ID:</span><Field value={document.customer.email} readOnly={readOnly} className="quotation-link min-w-0 flex-1" onChange={(email) => update({ ...document, customer: { ...document.customer, email } })} /></p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="flex items-start gap-2 border-r border-black px-2 py-1"><span className="shrink-0 font-semibold">Quote Title:</span><RichText value={document.quoteTitle} readOnly={readOnly} onChange={(quoteTitle) => update({ ...document, quoteTitle })} className="min-w-0 flex-1" /></div>
                        <div className="flex items-start gap-2 px-2 py-1"><span className="shrink-0 font-semibold">Total Cost:</span><RichText value={document.totalCostWords} readOnly={readOnly} onChange={(totalCostWords) => update({ ...document, totalCostWords })} className="min-w-0 flex-1" /></div>
                      </div>
                      {po ? <div className="border-b border-black px-2 py-1"><span className="font-semibold">Purchase Order:</span> {po.number}{po.date ? ` · ${displayDate(po.date)}` : ''}{po.value ? ` · ${po.value}` : ''}</div> : null}
                      <div className="flex gap-2 px-2 py-1"><span className="shrink-0 font-semibold">PROJECT:</span><RichText value={document.project} readOnly={readOnly} onChange={(project) => update({ ...document, project })} className="min-w-0 flex-1" /></div>
                    </div>
                    <RichText value={document.includesLine} readOnly={readOnly} onChange={(includesLine) => update({ ...document, includesLine })} className="mt-2 uppercase italic underline" />
                  </div>
                ) : null}
                {visibleBlocks.filter((block) => ids.includes(block.id)).map((block) => (
                  <section key={block.id} id={block.id} data-break={block.id} className="relative mt-[6mm]">
                    <BlockView
                      block={block}
                      readOnly={readOnly}
                      optionCount={options.length}
                      onSaveTerms={block.type === 'terms' && !readOnly ? () => {
                        setSaveSection(null);
                        setSaveName('');
                        setSaveError('');
                        setSaveTerms(block.type === 'terms' ? block.rows.map((row) => ({ label: row.label, value: row.value })) : null);
                      } : undefined}
                      onSaveSection={block.type === 'blank' && !readOnly ? () => {
                        setSaveTerms(null);
                        setSaveError('');
                        setSaveName(plainText(block.name).slice(0, 80));
                        setSaveSection({
                          name: block.name,
                          body: block.body,
                          minHeightMm: block.minHeightMm ?? 36,
                          widthPercent: block.widthPercent ?? 100,
                        });
                      } : undefined}
                      onChange={(next) => patchBlock(block.id, next)}
                      onMove={(direction) => update(moveBlock(document, block.id, direction))}
                      onRemove={() => {
                        pushHistory();
                        update(removeBlock(document, block.id));
                      }}
                    />
                  </section>
                ))}
              </div>
              <p className="absolute bottom-[18mm] left-0 right-0 z-[1] text-center text-[10pt]">Page {pageIndex + 1} of {pages.length}</p>
            </article>
          ))}
        </div>
      </div>
      {renameTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setRenameTarget(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitRename(event)}>
            <p className="text-sm font-semibold">{renameTarget.kind === 'terms' ? 'Rename saved terms' : 'Rename saved section'}</p>
            <input
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              autoFocus
              maxLength={80}
              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            {renameError ? <p className="mt-2 text-xs text-red-700">{renameError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={renameTermsState.isLoading || renameSectionState.isLoading}>Save</button>
            </div>
          </form>
        </div>
      ) : null}
      {saveTerms ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setSaveTerms(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitSavedTerms(event)}>
            <p className="text-sm font-semibold">Save terms for which item?</p>
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              autoFocus
              maxLength={80}
              placeholder="Item name"
              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            {saveError ? <p className="mt-2 text-xs text-red-700">{saveError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setSaveTerms(null)}>Cancel</button>
              <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={createTermsState.isLoading}>Save</button>
            </div>
          </form>
        </div>
      ) : null}
      {saveSection ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setSaveSection(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitSavedSection(event)}>
            <p className="text-sm font-semibold">Save this section as</p>
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              autoFocus
              maxLength={80}
              placeholder="Section name"
              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            {saveError ? <p className="mt-2 text-xs text-red-700">{saveError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setSaveSection(null)}>Cancel</button>
              <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={createCustomSectionState.isLoading}>Save</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function addPriceColumn(block: Extract<QuotationBlock, { type: 'option' }>): QuotationBlock {
  const columns = block.columns ?? [];
  if (columns.length >= 2) return block;
  const column: PriceColumn = { id: crypto.randomUUID(), name: columns.length === 0 ? 'Column' : 'Column 2' };
  return {
    ...block,
    columns: [...columns, column],
    rows: block.rows.map((row) => ({ ...row, extras: { ...row.extras, [column.id]: '' } })),
  };
}

function removePriceColumn(block: Extract<QuotationBlock, { type: 'option' }>, columnId: string): QuotationBlock {
  return {
    ...block,
    columns: (block.columns ?? []).filter((column) => column.id !== columnId),
    rows: block.rows.map((row) => {
      const extras = { ...row.extras };
      delete extras[columnId];
      return { ...row, extras };
    }),
  };
}

function resizedWidths(widths: Record<string, number>, key: string, nextKey: string, delta: number) {
  let current = widths[key] + delta;
  let neighbor = widths[nextKey] - delta;
  if (current < 6) {
    neighbor -= 6 - current;
    current = 6;
  }
  if (neighbor < 6) {
    current -= 6 - neighbor;
    neighbor = 6;
  }
  return { ...widths, [key]: current, [nextKey]: neighbor };
}

function priceHeaders(
  block: Extract<QuotationBlock, { type: 'option' }>,
  columns: PriceColumn[],
  readOnly: boolean,
  onChange: (block: QuotationBlock, recordHistory?: boolean) => void,
) {
  const keys = ['sl', 'item', 'description', ...columns.map((column) => column.id), 'unitPrice', 'quantity', 'total'];
  const labels: Record<string, string> = {
    sl: 'Sl.No.',
    item: 'Items',
    description: 'Description',
    unitPrice: 'Unit Price',
    quantity: 'Quantity',
    total: 'Total Price',
  };
  return keys.map((key, index) => {
    const column = columns.find((entry) => entry.id === key);
    const content = column ? (
      <span className="inline-flex w-full items-center justify-center gap-1">
        <Field
          value={column.name}
          readOnly={readOnly}
          className="min-w-0 w-full text-center font-semibold"
          onChange={(name) => onChange({ ...block, columns: columns.map((entry) => entry.id === column.id ? { ...entry, name } : entry) })}
        />
        {readOnly ? null : (
          <button type="button" className="quotation-edit-only text-[10px] font-normal text-slate-500" onClick={() => onChange(removePriceColumn(block, column.id), true)}>×</button>
        )}
      </span>
    ) : labels[key];
    return { key, label: column?.name || labels[key] || 'Column', next: keys[index + 1], content };
  });
}

function BlockView({
  block,
  readOnly,
  optionCount,
  onSaveTerms,
  onSaveSection,
  onChange,
  onMove,
  onRemove,
}: {
  block: QuotationBlock;
  readOnly: boolean;
  optionCount: number;
  onSaveTerms?: () => void;
  onSaveSection?: () => void;
  onChange: (block: QuotationBlock, recordHistory?: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const controls = readOnly ? null : (
    <div className="quotation-edit-only mt-2 flex justify-end">
      <div
        className="flex w-fit gap-2 text-[11px] text-slate-600"
        onMouseEnter={() => setArmed(true)}
        onMouseLeave={() => setArmed(false)}
      >
        <button type="button" className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-[#cce4f7]" onClick={() => onMove(-1)}>Up</button>
        <button type="button" className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-[#cce4f7]" onClick={() => onMove(1)}>Down</button>
        <button type="button" className="cursor-pointer rounded px-1.5 py-0.5 hover:bg-[#cce4f7]" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );

  if (block.type === 'option') {
    const total = optionTotal(block);
    const titled = showOptionTitle(block, optionCount);
    const columns = (block.columns ?? []).slice(0, 2);
    const leadColumns = 3 + columns.length;
    return (
      <div className={armed ? 'quotation-section-hot' : ''}>
        {titled || !readOnly ? (
          titled ? (
            <RichText
              value={block.name}
              readOnly={readOnly}
              className="font-semibold uppercase"
              onChange={(name) => onChange({ ...block, name, titleCustomized: true })}
            />
          ) : (
            <button type="button" className="quotation-edit-only text-[10px] text-slate-500" onClick={() => onChange({ ...block, titleCustomized: true })}>Add option title</button>
          )
        ) : null}
        <table className="quotation-item-table mt-1 w-full table-fixed border-collapse border border-black text-[11pt]">
          <colgroup>
            {Object.entries(priceColumnWidths(block)).map(([key, width]) => (
              <col key={key} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-center font-semibold">
              {priceHeaders(block, columns, readOnly, onChange).map((header) => (
                <th key={header.key} className="relative border border-black px-1 py-1 align-top">
                  {header.content}
                  {readOnly || !header.next ? null : (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${header.label}`}
                      className="quotation-edit-only absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const table = event.currentTarget.closest('table');
                        const tableWidth = table?.getBoundingClientRect().width || 1;
                        const startX = event.clientX;
                        const start = priceColumnWidths(block);
                        const key = header.key;
                        const next = header.next;
                        if (!next) return;
                        const move = (moveEvent: PointerEvent) => {
                          onChange({ ...block, widths: resizedWidths(start, key, next, ((moveEvent.clientX - startX) / tableWidth) * 100) });
                        };
                        const up = () => {
                          window.removeEventListener('pointermove', move);
                          window.removeEventListener('pointerup', up);
                        };
                        window.addEventListener('pointermove', move);
                        window.addEventListener('pointerup', up);
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={row.id} className="align-top">
                <td className="border border-black px-1 py-1 text-center">{index + 1}</td>
                <td className="border border-black px-1 py-1 text-center"><RichText value={row.item} readOnly={readOnly} className="text-center" onChange={(item) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, item } : entry) })} /></td>
                <td className="border border-black px-1 py-1"><RichText value={row.description} readOnly={readOnly} onChange={(description) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, description } : entry) })} /></td>
                {columns.map((column) => (
                  <td key={column.id} className="border border-black px-1 py-1">
                    <RichText
                      value={row.extras?.[column.id] ?? ''}
                      readOnly={readOnly}
                      onChange={(value) => onChange({
                        ...block,
                        rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, extras: { ...entry.extras, [column.id]: value } } : entry),
                      })}
                    />
                  </td>
                ))}
                <td className="border border-black px-1 py-1 text-center"><Field value={row.unitPrice} readOnly={readOnly} className="w-full text-center" onChange={(unitPrice) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, unitPrice } : entry) })} /></td>
                <td className="border border-black px-1 py-1 text-center"><Field value={row.quantity} readOnly={readOnly} className="w-full text-center" onChange={(quantity) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, quantity } : entry) })} /></td>
                <td className="border border-black px-1 py-1 text-center tabular-nums">
                  {money(lineAmount(row))}
                  {readOnly ? null : <button type="button" className="quotation-edit-only ml-1 text-[10px] text-slate-500" onClick={() => onChange({ ...block, rows: block.rows.filter((entry) => entry.id !== row.id) }, true)}>×</button>}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={leadColumns + 2} className="border border-black px-1 py-1 text-center">Grand Total (Amount is 5% VAT Excluded)</td>
              <td className="border border-black px-1 py-1 text-center tabular-nums">{money(total)}</td>
            </tr>
          </tbody>
        </table>
        {readOnly ? null : (
          <div className="quotation-edit-only mt-1 flex gap-3 text-xs text-slate-600">
            <button type="button" className="cursor-pointer" onClick={() => onChange({ ...block, rows: [...block.rows, emptyPriceRow(columns)] })}>Add row</button>
            {columns.length < 2 ? (
              <button type="button" className="cursor-pointer" onClick={() => onChange(addPriceColumn(block), true)}>Add column</button>
            ) : null}
          </div>
        )}
        {controls}
      </div>
    );
  }

  if (block.type === 'terms' || block.type === 'specification') {
    const rows = visibleRows(block.rows, readOnly);
    return (
      <div className={armed ? 'quotation-section-hot' : ''}>
        <div className="flex items-start justify-between gap-2">
          <RichText value={block.name} readOnly={readOnly} className="min-w-0 flex-1 font-semibold" onChange={(name) => onChange({ ...block, name })} />
          {block.type === 'terms' && onSaveTerms ? (
            <button type="button" className="quotation-edit-only shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveTerms}>Save</button>
          ) : null}
        </div>
        <div className={`mt-1 grid items-baseline gap-x-2 gap-y-1 ${block.type === 'specification' ? 'grid-cols-[2rem_max-content_auto_minmax(0,1fr)_auto]' : 'grid-cols-[max-content_auto_minmax(0,1fr)_auto]'}`}>
          {rows.map((row, index) => (
            <div key={row.id} className="col-span-full grid grid-cols-subgrid items-baseline">
              {block.type === 'specification' ? <span>{index + 1}.</span> : null}
              <RichText value={row.label} readOnly={readOnly} className="w-fit max-w-[62mm]" onChange={(label) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, label } : entry) })} />
              <span>:</span>
              <RichText value={row.value} readOnly={readOnly} onChange={(value) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, value } : entry) })} />
              {readOnly ? null : <button type="button" className="quotation-edit-only text-xs text-slate-500" onClick={() => onChange({ ...block, rows: block.rows.filter((entry) => entry.id !== row.id) }, true)}>Remove</button>}
            </div>
          ))}
        </div>
        {readOnly ? null : <button type="button" className="quotation-edit-only mt-1 block text-left text-xs text-slate-600" onClick={() => onChange({ ...block, rows: [...block.rows, { id: crypto.randomUUID(), label: 'Label', value: '' }] })}>Add row</button>}
        {controls}
      </div>
    );
  }

  if (block.type === 'signatures') {
    return (
      <div className={armed ? 'quotation-section-hot' : ''}>
        <RichText value={block.name} readOnly={readOnly} className="italic" onChange={(name) => onChange({ ...block, name })} />
        <div className="mt-1 grid grid-cols-[1fr_38%] items-start gap-x-6">
          <div className="space-y-0.5">
            <Field className="block font-semibold" value={block.left.name} readOnly={readOnly} onChange={(name) => onChange({ ...block, left: { ...block.left, name } })} />
            <Field className="block" value={block.left.phone} readOnly={readOnly} onChange={(phone) => onChange({ ...block, left: { ...block.left, phone } })} />
            <Field className="block" value={block.left.title} readOnly={readOnly} onChange={(title) => onChange({ ...block, left: { ...block.left, title } })} />
            <Field className="quotation-link block" value={block.left.email} readOnly={readOnly} onChange={(email) => onChange({ ...block, left: { ...block.left, email } })} />
          </div>
          <div className="space-y-0.5">
            <Field className="block font-semibold" value={block.right.name} readOnly={readOnly} onChange={(name) => onChange({ ...block, right: { ...block.right, name } })} />
            <Field className="block" value={block.right.phone} readOnly={readOnly} onChange={(phone) => onChange({ ...block, right: { ...block.right, phone } })} />
            <Field className="block" value={block.right.title} readOnly={readOnly} onChange={(title) => onChange({ ...block, right: { ...block.right, title } })} />
            <Field className="quotation-link block" value={block.right.email} readOnly={readOnly} onChange={(email) => onChange({ ...block, right: { ...block.right, email } })} />
          </div>
        </div>
        {controls}
      </div>
    );
  }

  if (block.type === 'blank') {
    return (
      <div className={armed ? 'quotation-section-hot' : ''}>
        <div className={readOnly ? '' : 'quotation-draft-box rounded-md border border-dashed border-slate-400 p-2'} style={{ width: `${block.widthPercent ?? 100}%` }}>
          <div className="flex items-start justify-between gap-2">
            <RichText value={block.name} readOnly={readOnly} className="min-w-0 flex-1 text-[11pt] font-semibold" onChange={(name) => onChange({ ...block, name })} />
            {onSaveSection ? (
              <button type="button" className="quotation-edit-only shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveSection}>Save</button>
            ) : null}
          </div>
          <RichText
            value={block.body}
            readOnly={readOnly}
            allowTable
            className="mt-1 w-full text-[11pt] leading-normal"
            style={{ minHeight: `${block.minHeightMm ?? 36}mm`, fontSize: '11pt', lineHeight: 'normal' }}
            onChange={(body) => onChange({ ...block, body })}
          />
          {readOnly ? null : (
            <button
              type="button"
              aria-label="Resize description"
              className="quotation-edit-only mt-1 block h-3 w-full cursor-nwse-resize border-t border-slate-300 text-[10px] text-slate-500"
              onPointerDown={(event) => {
                event.preventDefault();
                const startX = event.clientX;
                const startY = event.clientY;
                const startHeight = block.minHeightMm ?? 36;
                const startWidth = block.widthPercent ?? 100;
                const parentWidth = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width || 1;
                const move = (moveEvent: PointerEvent) => {
                  const minHeightMm = Math.min(160, Math.max(24, Math.round(startHeight + (moveEvent.clientY - startY) / 3.78)));
                  const widthPercent = Math.min(100, Math.max(45, Math.round(startWidth + ((moveEvent.clientX - startX) / parentWidth) * 100)));
                  onChange({ ...block, minHeightMm, widthPercent });
                };
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              Drag to resize
            </button>
          )}
        </div>
        {controls}
      </div>
    );
  }

  return (
    <div className={armed ? 'quotation-section-hot' : ''}>
      {block.type === 'closing' ? null : <RichText value={block.name} readOnly={readOnly} className="font-semibold" onChange={(name) => onChange({ ...block, name })} />}
      <RichText value={block.body} readOnly={readOnly} className="mt-1 text-justify" onChange={(body) => onChange({ ...block, body })} />
      {controls}
    </div>
  );
}

export function acceptedOptionId(savedOptions: Array<{ id: string }>, index: number) {
  return savedOptions[index]?.id ?? savedOptions[0]?.id ?? null;
}
