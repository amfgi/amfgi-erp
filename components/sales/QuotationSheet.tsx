'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  GripHorizontal,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pencil,
  Redo2,
  Table2,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';

import {
  PictureChrome,
  clipboardImage,
  findPicture,
  pictureIsPositioned,
  pictureMarkup,
  pictureSource,
  readPicture,
  writePicture,
  type PictureAnchor,
  type PictureLayout,
} from '@/components/sales/quotationPicture';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { Button } from '@/components/ui/shadcn/button';
import {
  useCreateQuotationCustomSectionMutation,
  useCreateQuotationCustomSectionVersionMutation,
  useCreateQuotationTermsTemplateMutation,
  useDeleteQuotationCustomSectionMutation,
  useDeleteQuotationCustomSectionVersionMutation,
  useDeleteQuotationTermsTemplateMutation,
  useGetQuotationCustomSectionsQuery,
  useCreateQuotationSectionPresetMutation,
  useDeleteQuotationSectionPresetMutation,
  useGetQuotationSectionPresetsQuery,
  useGetQuotationTermsTemplatesQuery,
  useUpdateQuotationCustomSectionMutation,
  useUpdateQuotationCustomSectionVersionMutation,
  useUpdateQuotationSectionPresetMutation,
  useUpdateQuotationTermsTemplateMutation,
} from '@/store/hooks';
import {
  applySavedScope,
  applySavedSpecification,
  applySavedTerms,
  DEFAULT_BLANK_HEIGHT_MM,
  defaultBlank,
  defaultOption,
  defaultScope,
  defaultSpecification,
  emptyPriceRow,
  insertBlock,
  insertCustomSection,
  lineAmount,
  MAX_BLANK_HEIGHT_MM,
  MAX_SECTION_GAP_MM,
  MIN_BLANK_HEIGHT_MM,
  MIN_SECTION_GAP_MM,
  optionBlocks,
  optionTotal,
  padImageUrl,
  placeBlock,
  plainText,
  priceColumnWidths,
  presetAlreadyUsed,
  removeBlock,
  sectionGapMm,
  showOptionTitle,
  syncTotalCostWords,
  visibleRows,
  type PriceColumn,
  type QuotationBlock,
  type QuotationDocument,
} from '@/lib/sales/quotationDocument';

const PAGE_INNER_MM = 229;

type PageSlice = { id: string; top: number; height: number };

function fallbackPages(ids: string[]): PageSlice[][] {
  return [ids.map((id) => ({ id, top: 0, height: 0 }))];
}

function pagesMatchBlocks(plan: PageSlice[][] | null, ids: string[]) {
  if (!plan?.length) return false;
  const seen: string[] = [];
  for (const page of plan) {
    for (const slice of page) {
      if (!seen.includes(slice.id)) seen.push(slice.id);
    }
  }
  return seen.join('|') === ids.join('|');
}

function samePagePlan(current: PageSlice[][] | null, packed: PageSlice[][]) {
  if (!current || current.length !== packed.length) return false;
  for (let page = 0; page < current.length; page += 1) {
    if (current[page].length !== packed[page].length) return false;
    for (let index = 0; index < current[page].length; index += 1) {
      const left = current[page][index];
      const right = packed[page][index];
      if (left.id !== right.id || left.top !== right.top) return false;
      if (Math.abs(left.height - right.height) > 2) return false;
    }
  }
  return true;
}

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
  lineHeight: string;
};

const DEFAULT_MARKS: FormatMarks = {
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  fontFamily: 'Calibri',
  fontSize: '11',
  heading: 'normal',
  lineHeight: '1.15',
};

const LINE_SPACINGS = [
  { value: '1', label: '1.0', hint: 'Single' },
  { value: '1.15', label: '1.15', hint: '' },
  { value: '1.5', label: '1.5', hint: '1.5 lines' },
  { value: '2', label: '2.0', hint: 'Double' },
  { value: '2.5', label: '2.5', hint: '' },
  { value: '3', label: '3.0', hint: 'Triple' },
] as const;

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
    && left.heading === right.heading
    && left.lineHeight === right.lineHeight;
}

function spacingNumber(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function normalizeLineHeight(value: string | undefined) {
  const number = spacingNumber(value ?? '');
  if (number == null) return null;
  const clamped = Math.min(5, Math.max(0.5, number));
  return String(clamped);
}

function matchLineHeight(style: CSSStyleDeclaration) {
  const font = parseFloat(style.fontSize);
  const line = parseFloat(style.lineHeight);
  if (!font || !Number.isFinite(line)) return '1.15';
  const ratio = line / font;
  const nearest = LINE_SPACINGS.reduce((best, item) => (
    Math.abs(Number(item.value) - ratio) < Math.abs(Number(best.value) - ratio) ? item : best
  ));
  if (Math.abs(Number(nearest.value) - ratio) <= 0.08) return nearest.value;
  return String(Math.round(ratio * 100) / 100);
}

function spacingElement(element: Element | null) {
  if (!element) return null;
  let target = element;
  if (target instanceof HTMLElement && target.isContentEditable) {
    const node = window.getSelection()?.anchorNode;
    const inner = node && node !== target && target.contains(node)
      ? (node instanceof Element ? node : node.parentElement)
      : target.querySelector('p, h1, h2, h3, li, div, blockquote, td, th');
    if (inner instanceof Element && inner !== target) target = inner;
  }
  const block = target.closest('li, p, h1, h2, h3, blockquote, td, th, div');
  return block instanceof HTMLElement ? block : null;
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
    lineHeight: matchLineHeight(window.getComputedStyle(spacingElement(element) ?? element)),
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

function lineHeightLeaves(field: HTMLElement, range: Range | null) {
  const blocks = [...field.querySelectorAll<HTMLElement>('p, h1, h2, h3, li, div, blockquote, td, th')];
  const hits = range
    ? blocks.filter((node) => {
      try {
        return range.intersectsNode(node);
      } catch {
        return false;
      }
    })
    : [];
  return hits.filter((node) => !hits.some((other) => other !== node && node.contains(other)));
}

function wrapLooseLineHeight(field: HTMLElement, spacing: string) {
  const kept = new Set(['P', 'H1', 'H2', 'H3', 'LI', 'DIV', 'BLOCKQUOTE', 'TABLE', 'UL', 'OL']);
  const loose = [...field.childNodes].filter((node) => !(node instanceof HTMLElement && kept.has(node.tagName)));
  if (!loose.length) return;
  const wrapper = window.document.createElement('div');
  wrapper.style.lineHeight = spacing;
  field.insertBefore(wrapper, loose[0]);
  for (const node of loose) wrapper.appendChild(node);
  if (!wrapper.childNodes.length) wrapper.appendChild(window.document.createElement('br'));
}

function applyLineHeight(field: HTMLElement, spacing: string) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const leaves = lineHeightLeaves(field, range);
  for (const node of leaves) node.style.lineHeight = spacing;
  const anchor = selection?.anchorNode;
  if (anchor && leaves.some((node) => node.contains(anchor))) return;
  wrapLooseLineHeight(field, spacing);
}

const SECTION_CHOICES = [
  { type: 'terms', label: 'Terms & Conditions', hint: 'VAT, warranty, delivery' },
  { type: 'scope', label: 'Not in our scope', hint: 'What the quote leaves out' },
  { type: 'specification', label: 'Specification & Note', hint: 'Numbered specification' },
  { type: 'option', label: 'Price option', hint: 'Another priced table' },
  { type: 'blank', label: 'Custom Section', hint: 'A blank section you write' },
] as const;

function SavedPresetPicker({
  label,
  hint,
  used,
  open,
  items,
  emptyText,
  addLabel,
  anchorId,
  onToggle,
  onChoose,
  onRename,
  onDelete,
  onAddBlank,
}: {
  label: string;
  hint: string;
  used: boolean;
  open: boolean;
  items: Array<{ id: string; label: string; used?: boolean }>;
  emptyText: string;
  addLabel?: string;
  anchorId?: string;
  onToggle: () => void;
  onChoose: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string, label: string) => void;
  onAddBlank?: () => void;
}) {
  return (
    <div className="relative" data-section-anchor={anchorId}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full cursor-pointer rounded-md border px-3 py-2 text-left ${used ? 'quotation-section-used' : 'border-border bg-background hover:bg-muted/50'}`}
      >
        <span className="block text-sm font-medium">{used ? label : `+ ${label}`}</span>
        <span className="block text-[11px] text-muted-foreground">{used ? 'On the page' : hint}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
          {items.length ? items.map((item) => (
            <div key={item.id} className={`flex items-center gap-1 pr-1 ${item.used ? 'quotation-section-used' : 'hover:bg-muted/60'}`}>
              <button type="button" className="min-w-0 flex-1 cursor-pointer px-3 py-1.5 text-left text-sm" onClick={() => onChoose(item.id)}>
                {item.label}
              </button>
              <button type="button" aria-label={`Rename ${item.label}`} title="Rename" className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => onRename(item.id, item.label)}>
                <Pencil className="size-3.5" />
              </button>
              <button type="button" aria-label={`Delete ${item.label}`} title="Delete" className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => onDelete(item.id, item.label)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )) : (
            <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{emptyText}</p>
          )}
          {onAddBlank ? (
            <button type="button" className="w-full cursor-pointer border-t border-border px-3 py-1.5 text-left text-sm hover:bg-muted/60" onClick={onAddBlank}>
              {addLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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
  if (!selection?.rangeCount || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;
  try {
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(root);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function selectionInside(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return !!range.startContainer && root.contains(range.startContainer) && !!range.endContainer && root.contains(range.endContainer);
}

/** True only when Backspace or Delete would leave this field. A failed measurement is not the start. */
function caretAtEdge(root: HTMLElement, edge: 'start' | 'end') {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!range.startContainer || !root.contains(range.startContainer)) return false;
  try {
    const probe = range.cloneRange();
    probe.selectNodeContents(root);
    if (edge === 'start') probe.setEnd(range.startContainer, range.startOffset);
    else probe.setStart(range.endContainer, range.endOffset);
    if (probe.toString().replace(/\u200b/g, '').length > 0) return false;
    return probe.cloneContents().querySelector('img, table, svg') == null;
  } catch {
    return false;
  }
}

function emitFieldInput(root: HTMLElement, direction: 'backward' | 'forward') {
  root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: direction === 'backward' ? 'deleteContentBackward' : 'deleteContentForward' }));
}

function placeRange(range: Range) {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function collapseIn(node: Node, offset: number) {
  const range = window.document.createRange();
  range.setStart(node, Math.max(0, Math.min(offset, node instanceof Text ? node.length : node.childNodes.length)));
  range.collapse(true);
  placeRange(range);
}

function lineAtCaretStart(root: HTMLElement, range: Range) {
  const container = range.startContainer;
  const element = container instanceof Element ? container : container.parentElement;
  if (!element || element === root) return null;
  const line = element.closest('div, p, li, h1, h2, h3, blockquote');
  if (!(line instanceof HTMLElement) || line === root || !root.contains(line)) return null;
  try {
    const probe = range.cloneRange();
    probe.selectNodeContents(line);
    probe.setEnd(range.startContainer, range.startOffset);
    if (probe.toString().replace(/\u200b/g, '').length > 0) return null;
    if (probe.cloneContents().querySelector('img, table')) return null;
  } catch {
    return null;
  }
  return line;
}

function breakBeforeCaret(range: Range) {
  const container = range.startContainer;
  if (container instanceof Text && range.startOffset > 0) {
    const prev = container.data[range.startOffset - 1];
    if (prev === '\n' || prev === '\r') return container;
  }
  if (container instanceof Text && range.startOffset === 0) {
    const previous = container.previousSibling;
    if (previous instanceof HTMLBRElement) return previous;
    if (previous instanceof Text && (previous.data.endsWith('\n') || previous.data.endsWith('\r'))) return previous;
  }
  if (container instanceof Element) {
    const previous = container.childNodes[range.startOffset - 1];
    if (previous instanceof HTMLBRElement) return previous;
    if (previous instanceof Text && (previous.data.endsWith('\n') || previous.data.endsWith('\r'))) return previous;
  }
  const element = container instanceof Element ? container : container.parentElement;
  if (element?.previousSibling instanceof HTMLBRElement && range.startOffset === 0) return element.previousSibling;
  return null;
}

function removeLineBreak(root: HTMLElement, line: HTMLElement) {
  const previous = line.previousSibling;
  const empty = !line.textContent?.replace(/\u00a0/g, '').trim() && line.querySelector('img, table') == null;
  if (!previous) {
    if (!empty) return false;
    line.remove();
    collapseIn(root, 0);
    return true;
  }
  if (empty) {
    line.remove();
    if (previous instanceof Text) collapseIn(previous, previous.length);
    else if (previous instanceof HTMLElement) collapseIn(previous, previous.childNodes.length);
    return true;
  }
  if (previous instanceof HTMLElement) {
    const join = previous.childNodes.length;
    while (line.firstChild) previous.appendChild(line.firstChild);
    line.remove();
    collapseIn(previous, join);
    return true;
  }
  if (previous instanceof Text) {
    const join = previous.length;
    previous.data += line.textContent || '';
    line.remove();
    collapseIn(previous, join);
    return true;
  }
  return false;
}

/** Removes the Enter line first, then one character. selection.modify skips line breaks and eats the letter instead. */
function removeBackward(root: HTMLElement, word: boolean) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    range.deleteContents();
    emitFieldInput(root, 'backward');
    return;
  }
  const line = lineAtCaretStart(root, range);
  if (line && line.parentElement === root && removeLineBreak(root, line)) {
    emitFieldInput(root, 'backward');
    return;
  }
  const breakNode = breakBeforeCaret(range);
  if (breakNode instanceof HTMLBRElement) {
    const parent = breakNode.parentNode;
    if (!parent) return;
    const index = [...parent.childNodes].indexOf(breakNode);
    breakNode.remove();
    collapseIn(parent, Math.max(0, index));
    emitFieldInput(root, 'backward');
    return;
  }
  if (breakNode instanceof Text) {
    const offset = range.startContainer === breakNode ? range.startOffset : breakNode.length;
    if (offset > 0) {
      breakNode.deleteData(offset - 1, 1);
      if (breakNode.data.length === 0) {
        const parent = breakNode.parentNode;
        const index = parent ? [...parent.childNodes].indexOf(breakNode) : 0;
        breakNode.remove();
        if (parent) collapseIn(parent, Math.max(0, index));
      } else collapseIn(breakNode, offset - 1);
      emitFieldInput(root, 'backward');
    }
    return;
  }
  if (word && typeof selection.modify === 'function') {
    try {
      selection.modify('extend', 'backward', 'word');
    } catch {
      return;
    }
    if (!selection.isCollapsed && selection.anchorNode && selection.focusNode && root.contains(selection.anchorNode) && root.contains(selection.focusNode)) {
      selection.getRangeAt(0).deleteContents();
      emitFieldInput(root, 'backward');
    }
    return;
  }
  try {
    selection.modify('extend', 'backward', 'character');
  } catch {
    return;
  }
  if (!selection.isCollapsed && selection.anchorNode && selection.focusNode && root.contains(selection.anchorNode) && root.contains(selection.focusNode)) {
    selection.getRangeAt(0).deleteContents();
    emitFieldInput(root, 'backward');
  }
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

const CELL_EDGE_PX = 8;
const ROW_EDGE_PX = 14;
const MIN_CELL_WIDTH_PX = 28;
const MIN_CELL_HEIGHT_PX = 22;
const MAX_CELL_HEIGHT_PX = 520;

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

function cellEdges(cell: HTMLElement, point: { clientX: number; clientY: number }) {
  const rect = cell.getBoundingClientRect();
  return {
    rect,
    right: point.clientX >= rect.right - CELL_EDGE_PX && point.clientX <= rect.right + 3 && point.clientY >= rect.top && point.clientY <= rect.bottom,
    bottom: point.clientY >= rect.bottom - CELL_EDGE_PX && point.clientY <= rect.bottom + 3 && point.clientX >= rect.left && point.clientX <= rect.right,
  };
}

function cellClip(cell: HTMLTableCellElement) {
  const first = cell.firstElementChild;
  if (first instanceof HTMLElement && first.classList.contains('quotation-cell-box') && cell.childNodes.length === 1) return first;
  const box = cell.ownerDocument.createElement('div');
  box.className = 'quotation-cell-box';
  while (cell.firstChild) box.appendChild(cell.firstChild);
  if (!box.childNodes.length) box.appendChild(cell.ownerDocument.createElement('br'));
  cell.appendChild(box);
  return box;
}

function rowClipHeight(row: HTMLTableRowElement) {
  const box = row.cells[0]?.querySelector(':scope > .quotation-cell-box');
  if (box instanceof HTMLElement) {
    const styled = parseFloat(box.style.height);
    if (styled > 0) return styled;
  }
  return row.getBoundingClientRect().height;
}

function setRowClipHeight(row: HTMLTableRowElement, height: number) {
  const next = Math.max(MIN_CELL_HEIGHT_PX, Math.min(MAX_CELL_HEIGHT_PX, Math.round(height)));
  row.style.height = `${next}px`;
  for (const cell of row.cells) {
    cell.style.height = `${next}px`;
    const box = cellClip(cell);
    box.style.height = `${next}px`;
    box.style.minHeight = `${next}px`;
  }
}

/** The border under a row is often hit on the next cell, or just below the table. */
function rowBoundary(field: HTMLElement, x: number, y: number) {
  let best: { row: HTMLTableRowElement; distance: number } | null = null;
  for (const table of field.querySelectorAll<HTMLTableElement>('table.quotation-insert')) {
    for (const row of table.rows) {
      const rect = row.getBoundingClientRect();
      if (x < rect.left - 6 || x > rect.right + 6) continue;
      const distance = Math.abs(rect.bottom - y);
      if (distance > ROW_EDGE_PX) continue;
      if (!best || distance < best.distance) best = { row, distance };
    }
  }
  return best?.row ?? null;
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
  const resizingCell = useRef(false);

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
      className={`quotation-rich min-h-[1.25rem] outline-none ${allowTable ? '' : 'whitespace-pre-wrap'} ${readOnly ? '' : 'rounded-sm focus:bg-sky-50/80 focus:outline focus:outline-1 focus:outline-sky-400'} ${className ?? ''}`}
      onFocus={(event) => onFocusField?.(event.currentTarget)}
      onBeforeInput={(event) => {
        const inputType = event.nativeEvent.inputType;
        if (inputType === 'historyUndo' || inputType === 'historyRedo') event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (readOnly || event.altKey || event.nativeEvent.isComposing) return;
        if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z' || event.key === 'y' || event.key === 'Y')) {
          event.preventDefault();
        }
        if (event.key !== 'Backspace' && event.key !== 'Delete') return;
        const node = ref.current;
        if (!node || !selectionInside(node)) return;
        const direction = event.key === 'Backspace' ? 'backward' : 'forward';
        const selection = window.getSelection();
        if (selection?.isCollapsed && caretAtEdge(node, direction === 'backward' ? 'start' : 'end')) {
          event.preventDefault();
          return;
        }
        if (direction === 'forward') return;
        event.preventDefault();
        removeBackward(node, event.ctrlKey || event.metaKey);
      }}
      onPointerMove={(event) => {
        const root = ref.current;
        if (!allowTable || readOnly || !root || resizingCell.current) return;
        const target = event.target;
        if (!(target instanceof Node) || !root.contains(target)) {
          root.style.cursor = '';
          return;
        }
        const heightRow = rowBoundary(root, event.clientX, event.clientY);
        const cell = target instanceof Element ? target.closest('td, th') : null;
        const edges = cell instanceof HTMLTableCellElement && root.contains(cell) ? cellEdges(cell, event) : null;
        root.style.cursor = heightRow && edges?.right ? 'nwse-resize' : heightRow ? 'row-resize' : edges?.right ? 'col-resize' : '';
      }}
      onPointerLeave={() => {
        if (!resizingCell.current && ref.current) ref.current.style.cursor = '';
      }}
      onPointerDown={(event) => {
        if (!allowTable || readOnly || event.button !== 0) return;
        const field = ref.current;
        const target = event.target;
        if (!field || !(target instanceof Node) || !field.contains(target)) return;
        const heightRow = rowBoundary(field, event.clientX, event.clientY);
        const cell = target instanceof Element ? target.closest('td, th') : null;
        const inCell = cell instanceof HTMLTableCellElement && field.contains(cell) ? cell : null;
        const edges = inCell ? cellEdges(inCell, event) : null;
        if (!heightRow && !edges?.right) return;
        const table = (heightRow ?? inCell)?.closest('table');
        if (!(table instanceof HTMLTableElement)) return;
        event.preventDefault();
        event.stopPropagation();
        resizingCell.current = true;
        field.style.cursor = heightRow && edges?.right ? 'nwse-resize' : heightRow ? 'row-resize' : 'col-resize';
        const index = inCell && inCell.parentElement ? [...inCell.parentElement.children].indexOf(inCell) : -1;
        const columnCount = inCell?.parentElement?.children.length ?? 0;
        const last = index >= 0 && index === columnCount - 1;
        const startX = event.clientX;
        const startY = event.clientY;
        const startHeight = heightRow ? rowClipHeight(heightRow) : 0;
        const tableWidth = table.getBoundingClientRect().width || 1;
        const fieldWidth = field.getBoundingClientRect().width || 1;
        const startTable = table.getBoundingClientRect().width;
        const resizeTable = Boolean(edges?.right && (last || columnCount === 1));
        const pair = edges?.right && !resizeTable ? index : -1;
        const cols = pair >= 0 ? tableColumns(table, columnCount) : [];
        const startCol = pair >= 0 ? (edges?.rect.width ?? 0) : 0;
        const neighbor = pair >= 0 && inCell?.parentElement?.children[pair + 1] instanceof HTMLElement
          ? inCell.parentElement.children[pair + 1].getBoundingClientRect().width
          : 0;
        function move(moveEvent: PointerEvent) {
          if (heightRow) setRowClipHeight(heightRow, startHeight + (moveEvent.clientY - startY));
          if (pair >= 0 && cols[pair] && cols[pair + 1]) {
            let width = startCol + (moveEvent.clientX - startX);
            let other = neighbor - (moveEvent.clientX - startX);
            if (width < MIN_CELL_WIDTH_PX) {
              other -= MIN_CELL_WIDTH_PX - width;
              width = MIN_CELL_WIDTH_PX;
            }
            if (other < MIN_CELL_WIDTH_PX) {
              width -= MIN_CELL_WIDTH_PX - other;
              other = MIN_CELL_WIDTH_PX;
            }
            cols[pair].style.width = `${(width / tableWidth) * 100}%`;
            cols[pair + 1].style.width = `${(other / tableWidth) * 100}%`;
          }
          if (resizeTable) {
            const next = Math.min(fieldWidth, Math.max(fieldWidth * 0.25, startTable + (moveEvent.clientX - startX)));
            table.style.width = `${Math.round((next / fieldWidth) * 1000) / 10}%`;
          }
        }
        function up() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          resizingCell.current = false;
          field.style.cursor = '';
          const html = ref.current?.innerHTML ?? '';
          emitted.current = html;
          onChange?.(html);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onInput={(event) => {
        const inputType = event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : '';
        if (inputType === 'historyUndo' || inputType === 'historyRedo') return;
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
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded border px-1 disabled:cursor-default disabled:opacity-40"
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

function LineSpacingMenu({
  value,
  onPrepare,
  onApply,
}: {
  value: string;
  onPrepare: () => void;
  onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(value);
  const rootRef = useRef<HTMLSpanElement>(null);
  const preset = LINE_SPACINGS.find((item) => item.value === value);
  const label = preset?.label ?? value;

  useEffect(() => {
    if (!open) return;
    setCustom(value);
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.document.addEventListener('mousedown', close);
    return () => window.document.removeEventListener('mousedown', close);
  }, [open, value]);

  function apply(next: string) {
    const spacing = normalizeLineHeight(next);
    if (!spacing) return;
    onApply(spacing);
    setOpen(false);
  }

  return (
    <span ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Line spacing"
        title="Line spacing"
        aria-pressed={open}
        className="inline-flex h-8 items-center gap-0.5 rounded border px-1.5 text-xs tabular-nums"
        onMouseDown={preventToolbarMouseDown}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown className="size-3" />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-40 rounded border border-[#d4d4d4] p-1 shadow-lg"
          style={{ backgroundColor: '#ffffff', color: '#111111' }}
          onMouseDown={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('input, textarea')) return;
            preventToolbarMouseDown(event);
          }}
        >
          {LINE_SPACINGS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${item.value === value ? 'bg-[#cce4f7]' : 'hover:bg-[#f3f3f3]'}`}
              onClick={() => apply(item.value)}
            >
              <span className="tabular-nums">{item.label}</span>
              {item.hint ? <span className="text-[10px] text-[#666666]">{item.hint}</span> : null}
            </button>
          ))}
          <form
            className="mt-1 flex items-center gap-1 border-t border-[#d4d4d4] px-1 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              apply(custom);
            }}
          >
            <input
              aria-label="Custom line spacing"
              title="Custom line spacing"
              type="number"
              min={0.5}
              max={5}
              step={0.05}
              value={custom}
              onMouseDown={onPrepare}
              onChange={(event) => setCustom(event.target.value)}
              className="h-7 w-full rounded border border-[#d4d4d4] bg-white px-1 text-xs text-[#111111]"
            />
            <button type="submit" className="h-7 shrink-0 rounded border border-[#d4d4d4] px-2 text-xs">
              Set
            </button>
          </form>
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
  canUndo,
  canRedo,
  tableReady,
  onInsertTable,
  pictureReady,
  onInsertPicture,
}: {
  variant: 'full' | 'compact';
  marks: FormatMarks;
  highlight: string;
  fontColor: string;
  onFormat: (command: string, value?: string) => void;
  onPrepare: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  tableReady?: boolean;
  onInsertTable?: (rows: number, cols: number) => void;
  pictureReady?: boolean;
  onInsertPicture?: (file: File) => void;
}) {
  const [open, setOpen] = useState<'highlight' | 'color' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

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
          <ToolButton label="Undo" disabled={!canUndo} onClick={() => onFormat('undo')}><Undo2 className="size-4" /></ToolButton>
          <ToolButton label="Redo" disabled={!canRedo} onClick={() => onFormat('redo')}><Redo2 className="size-4" /></ToolButton>
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
      <LineSpacingMenu value={marks.lineHeight} onPrepare={onPrepare} onApply={(spacing) => onFormat('lineHeight', spacing)} />
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
          {onInsertPicture ? (
            <>
              <button
                type="button"
                aria-label="Insert picture"
                title={pictureReady ? 'Insert picture' : 'Click in the text, then insert a picture'}
                disabled={!pictureReady}
                className="inline-flex h-8 items-center justify-center gap-1 rounded border px-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
                onMouseDown={(event) => {
                  onPrepare();
                  event.preventDefault();
                }}
                onClick={() => pictureInputRef.current?.click()}
              >
                <ImagePlus className="size-4" />
                Picture
              </button>
              <input
                ref={pictureInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onInsertPicture(file);
                }}
              />
            </>
          ) : null}
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
  const [pictureReady, setPictureReady] = useState(false);
  const [pictureId, setPictureId] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [pictureMore, setPictureMore] = useState(false);
  const [pictureBox, setPictureBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const insertPictureRef = useRef<(file: File) => Promise<void>>(async () => {});
  const commitPictureRef = useRef<(node: HTMLElement) => void>(() => {});
  const [presetMenu, setPresetMenu] = useState<string | null>(null);
  const [saveTerms, setSaveTerms] = useState<Array<{ label: string; value: string }> | null>(null);
  const [savePreset, setSavePreset] = useState<null | { kind: 'scope'; body: string } | { kind: 'specification'; rows: Array<{ label: string; value: string }> }>(null);
  const [saveSection, setSaveSection] = useState<null | {
    blockId: string;
    name: string;
    body: string;
    minHeightMm: number;
    widthPercent: number;
    parentSectionId: string;
  }>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<null | { sectionId: string; versionId?: string }>(null);
  const [promptTop, setPromptTop] = useState(0);
  const [highlightBlockId, setHighlightBlockId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ beforeId: string | null } | null>(null);
  const [pendingRemoveSection, setPendingRemoveSection] = useState<{ id: string; name: string } | null>(null);
  const sectionListRef = useRef<HTMLDivElement>(null);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [renameTarget, setRenameTarget] = useState<null | { kind: 'terms' | 'section' | 'scope' | 'specification' | 'version'; id: string; sectionId?: string }>(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<null | { kind: 'terms' | 'section' | 'scope' | 'specification' | 'version'; id: string; name: string; sectionId?: string }>(null);
  const [deleting, setDeleting] = useState(false);
  const termsQuery = useGetQuotationTermsTemplatesQuery(undefined, { skip: readOnly });
  const [createTerms, createTermsState] = useCreateQuotationTermsTemplateMutation();
  const [renameTerms, renameTermsState] = useUpdateQuotationTermsTemplateMutation();
  const [deleteTerms] = useDeleteQuotationTermsTemplateMutation();
  const customQuery = useGetQuotationCustomSectionsQuery(undefined, { skip: readOnly });
  const [createCustomSection, createCustomSectionState] = useCreateQuotationCustomSectionMutation();
  const [createCustomVersion, createCustomVersionState] = useCreateQuotationCustomSectionVersionMutation();
  const [renameSection, renameSectionState] = useUpdateQuotationCustomSectionMutation();
  const [renameCustomVersion, renameCustomVersionState] = useUpdateQuotationCustomSectionVersionMutation();
  const [deleteSection] = useDeleteQuotationCustomSectionMutation();
  const [deleteCustomVersion] = useDeleteQuotationCustomSectionVersionMutation();
  const scopePresets = useGetQuotationSectionPresetsQuery('scope', { skip: readOnly });
  const specificationPresets = useGetQuotationSectionPresetsQuery('specification', { skip: readOnly });
  const [createPreset, createPresetState] = useCreateQuotationSectionPresetMutation();
  const [renamePreset, renamePresetState] = useUpdateQuotationSectionPresetMutation();
  const [deletePreset] = useDeleteQuotationSectionPresetMutation();
  const termsItems = useMemo(
    () => (termsQuery.data ?? []).map((entry) => ({ id: entry.id, label: entry.name, searchText: entry.name })),
    [termsQuery.data],
  );
  const undoStack = useRef<QuotationDocument[]>([]);
  const redoStack = useRef<QuotationDocument[]>([]);
  const historyBurst = useRef<{ key: string; at: number } | null>(null);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const documentRef = useRef(document);
  const undoEditRef = useRef<() => void>(() => {});
  const redoEditRef = useRef<() => void>(() => {});
  documentRef.current = document;
  const caretHold = useRef<{ blockId: string; fieldIndex: number; offset: number } | null>(null);
  const followBlock = useRef<string | null>(null);
  const [pagesOfIds, setPagesOfIds] = useState<PageSlice[][] | null>(null);
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

  function noteHistory() {
    const undo = undoStack.current.length;
    const redo = redoStack.current.length;
    setHistoryCounts((current) => (current.undo === undo && current.redo === redo ? current : { undo, redo }));
  }

  function pushHistory() {
    historyBurst.current = null;
    undoStack.current.push(structuredClone(documentRef.current));
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
    noteHistory();
  }

  /** Groups a short run of typing in one field into a single undo step. */
  function editHistory(key: string) {
    const now = Date.now();
    const burst = historyBurst.current;
    if (burst && burst.key === key && now - burst.at < 1000) {
      burst.at = now;
      return;
    }
    undoStack.current.push(structuredClone(documentRef.current));
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = [];
    historyBurst.current = { key, at: now };
    noteHistory();
  }

  function edit(next: QuotationDocument, key: string) {
    editHistory(key);
    update(next);
  }

  function sectionTitle(block: QuotationBlock) {
    const name = plainText(block.name);
    if (name) return name;
    if (block.type === 'terms') return 'Terms & Conditions';
    if (block.type === 'scope') return 'Not in our scope';
    if (block.type === 'specification') return 'Specification & Note';
    if (block.type === 'option') return 'Price option';
    if (block.type === 'closing') return 'Closing';
    if (block.type === 'signatures') return 'Signatures';
    return 'Section';
  }

  function resizeBlank(blockId: string, minHeightMm: number, widthPercent: number, recordHistory: boolean) {
    const current = documentRef.current;
    const latest = current.blocks.find((entry) => entry.id === blockId);
    if (!latest || latest.type !== 'blank') return false;
    const nextHeight = Math.min(MAX_BLANK_HEIGHT_MM, Math.max(MIN_BLANK_HEIGHT_MM, Math.round(minHeightMm)));
    const nextWidth = Math.min(100, Math.max(45, Math.round(widthPercent)));
    if ((latest.minHeightMm ?? DEFAULT_BLANK_HEIGHT_MM) === nextHeight && (latest.widthPercent ?? 100) === nextWidth) return false;
    if (recordHistory) pushHistory();
    sheetRef.current?.querySelectorAll<HTMLElement>(`[data-block="${CSS.escape(blockId)}"] .quotation-block-full`).forEach((full) => {
      const fields = full.querySelectorAll<HTMLElement>('.quotation-rich');
      const body = fields[fields.length - 1];
      if (body) body.style.minHeight = `${nextHeight}mm`;
    });
    update({
      ...current,
      blocks: current.blocks.map((entry) => (entry.id === blockId ? { ...entry, minHeightMm: nextHeight, widthPercent: nextWidth } : entry)),
    });
    return true;
  }

  function startBlankResize(event: ReactPointerEvent<HTMLElement>, blockId: string, mode: 'height' | 'both') {
    event.preventDefault();
    event.stopPropagation();
    const latest = documentRef.current.blocks.find((entry) => entry.id === blockId);
    if (!latest || latest.type !== 'blank') return;
    const startY = event.clientY;
    const startX = event.clientX;
    followBlock.current = blockId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A real pointer is captured when the browser allows it. */
    }
    const startHeight = latest.minHeightMm ?? DEFAULT_BLANK_HEIGHT_MM;
    const startWidth = latest.widthPercent ?? 100;
    const parentWidth = event.currentTarget.closest('section')?.getBoundingClientRect().width || 1;
    const pxPerMm = 96 / 25.4;
    let pushed = false;
    const move = (moveEvent: PointerEvent) => {
      const minHeightMm = startHeight + (moveEvent.clientY - startY) / pxPerMm;
      const widthPercent = mode === 'both' ? startWidth + ((moveEvent.clientX - startX) / parentWidth) * 100 : startWidth;
      if (resizeBlank(blockId, minHeightMm, widthPercent, !pushed)) pushed = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      followBlock.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function setSectionGap(blockId: string, gapMm: number) {
    const current = documentRef.current;
    const nextGap = Math.min(MAX_SECTION_GAP_MM, Math.max(MIN_SECTION_GAP_MM, Math.round(gapMm)));
    const block = current.blocks.find((entry) => entry.id === blockId);
    if (!block || sectionGapMm(block) === nextGap) return;
    update({
      ...current,
      blocks: current.blocks.map((entry) => (entry.id === blockId ? { ...entry, gapMm: nextGap } : entry)),
    });
  }

  function dropBefore(pointerY: number, blockId: string) {
    const root = sheetRef.current;
    const current = documentRef.current;
    const moving = current.blocks.find((block) => block.id === blockId);
    if (!root || !moving) return null;
    const movingFooter = moving.type === 'closing' || moving.type === 'signatures';
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-break]')].filter((node) => {
      const id = node.dataset.break || '';
      if (!id || id === 'header' || id === blockId) return false;
      const block = current.blocks.find((entry) => entry.id === id);
      if (!block) return false;
      const footer = block.type === 'closing' || block.type === 'signatures';
      return footer === movingFooter;
    });
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) return node.dataset.break || null;
    }
    return null;
  }

  function startGapDrag(event: ReactPointerEvent<HTMLElement>, blockId: string) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const block = documentRef.current.blocks.find((entry) => entry.id === blockId);
    if (!block) return;
    const startY = event.clientY;
    const startGap = sectionGapMm(block);
    let pushed = false;
    const move = (moveEvent: PointerEvent) => {
      const gapMm = startGap + (moveEvent.clientY - startY) / (96 / 25.4);
      const current = documentRef.current.blocks.find((entry) => entry.id === blockId);
      if (!current || sectionGapMm(current) === Math.min(MAX_SECTION_GAP_MM, Math.max(MIN_SECTION_GAP_MM, Math.round(gapMm)))) return;
      if (!pushed) {
        pushHistory();
        pushed = true;
      }
      setSectionGap(blockId, gapMm);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startSectionDrag(event: ReactPointerEvent<HTMLElement>, blockId: string) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const node = event.currentTarget.closest('.quotation-section');
    if (!(node instanceof HTMLElement)) return;
    setSelectedSectionId(blockId);
    const startY = event.clientY;
    let dragging = false;
    let beforeId: string | null = null;
    const move = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 4) return;
        dragging = true;
        node.style.position = 'relative';
        node.style.zIndex = '30';
      }
      node.style.transform = `translateY(${dy}px)`;
      beforeId = dropBefore(moveEvent.clientY, blockId);
      setDropTarget({ beforeId });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.style.transform = '';
      node.style.zIndex = '';
      node.style.position = '';
      setDropTarget(null);
      if (!dragging) return;
      const next = placeBlock(documentRef.current, blockId, beforeId);
      if (next === documentRef.current) return;
      pushHistory();
      update(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function confirmRemoveSection() {
    if (!pendingRemoveSection) return;
    pushHistory();
    update(removeBlock(documentRef.current, pendingRemoveSection.id));
    setSelectedSectionId(null);
    setPendingRemoveSection(null);
  }

  function patchBlock(blockId: string, block: QuotationBlock, recordHistory = false) {
    const current = documentRef.current;
    const previous = current.blocks.find((entry) => entry.id === blockId);
    if (previous && JSON.stringify(previous) === JSON.stringify(block)) return;
    if (recordHistory) pushHistory();
    else editHistory(`block:${blockId}`);
    update({ ...current, blocks: current.blocks.map((entry) => (entry.id === blockId ? block : entry)) });
  }

  const blockIds = useMemo(() => ['header', ...visibleBlocks.map((block) => block.id)], [visibleBlocks]);
  const blockById = useMemo(() => new Map(visibleBlocks.map((block) => [block.id, block])), [visibleBlocks]);

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
  const pages = pagesMatchBlocks(pagesOfIds, blockIds) && pagesOfIds ? pagesOfIds : fallbackPages(blockIds);

  useEffect(() => {
    function remember() {
      const selection = window.getSelection();
      const pad = sheetRef.current;
      if (!selection?.rangeCount || !pad) {
        setBubble(null);
        setPictureReady(false);
        return;
      }
      const node = selection.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement ?? null;
      const editable = element?.closest('[contenteditable="true"]');
      if (!node || !pad.contains(node) || !(editable instanceof HTMLElement) || !pad.contains(editable)) {
        setBubble(null);
        setTableReady(false);
        setPictureReady(false);
        return;
      }
      savedRange.current = selection.getRangeAt(0).cloneRange();
      richField.current = editable;
      setTableReady(editable.dataset.allowTable === 'true');
      setPictureReady(true);
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
    let shortcutTaken = false;
    function shortcutHost(event: Event) {
      const sheet = sheetRef.current;
      if (!sheet) return null;
      const nodes = [event.target, window.document.activeElement];
      for (const node of nodes) {
        if (!(node instanceof Element) || !sheet.contains(node)) continue;
        if (node.closest('[role="dialog"]')) return null;
        const field = node.closest('input, textarea, [contenteditable="true"]');
        if (field instanceof HTMLElement && !field.closest('article')) return null;
        return node;
      }
      return null;
    }
    function runShortcut(kind: 'undo' | 'redo') {
      if (shortcutTaken) return;
      shortcutTaken = true;
      queueMicrotask(() => {
        shortcutTaken = false;
      });
      if (kind === 'undo') undoEditRef.current();
      else redoEditRef.current();
    }
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.isComposing || !(event.ctrlKey || event.metaKey)) return;
      const code = event.code;
      const key = event.key.toLowerCase();
      const redo = code === 'KeyY' || key === 'y' || ((code === 'KeyZ' || key === 'z') && event.shiftKey);
      const undo = (code === 'KeyZ' || key === 'z') && !event.shiftKey;
      if (!undo && !redo) return;
      if (!shortcutHost(event)) return;
      event.preventDefault();
      event.stopPropagation();
      runShortcut(undo ? 'undo' : 'redo');
    }
    function onBeforeInput(event: Event) {
      if (!(event instanceof InputEvent)) return;
      const kind = event.inputType === 'historyUndo' ? 'undo' : event.inputType === 'historyRedo' ? 'redo' : null;
      if (!kind || !shortcutHost(event)) return;
      event.preventDefault();
      event.stopPropagation();
      runShortcut(kind);
    }
    window.document.addEventListener('selectionchange', remember);
    window.addEventListener('scroll', remember, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeinput', onBeforeInput, true);
    return () => {
      window.document.removeEventListener('selectionchange', remember);
      window.removeEventListener('scroll', remember, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeinput', onBeforeInput, true);
    };
  }, []);

  useLayoutEffect(() => {
    const current = sheetRef.current;
    if (!current) return;
    const frame = current.querySelector<HTMLElement>('[data-quotation-frame]');
    const limit = frame && frame.clientHeight > 40 ? frame.clientHeight - 1 : (PAGE_INNER_MM / 25.4) * 96;
    const nodes = [...current.querySelectorAll<HTMLElement>('[data-break]')];
    const packed: PageSlice[][] = [[]];
    let used = 0;
    for (const node of nodes) {
      const id = node.dataset.break || '';
      if (!id) continue;
      const full = node.querySelector<HTMLElement>('.quotation-block-full');
      const style = window.getComputedStyle(node);
      const margin = parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
      const content = Math.max(full ? full.offsetHeight : node.offsetHeight, 1);
      if (id === 'header') {
        packed[packed.length - 1].push({ id, top: 0, height: 0 });
        used += margin + content;
        continue;
      }
      let page = packed[packed.length - 1];
      const needed = margin + content;
      if (page.length > 0 && needed > limit - used + 2 && needed <= limit + 2) {
        packed.push([]);
        used = 0;
        page = packed[packed.length - 1];
      }
      if (needed <= limit - used + 2 || (page.length === 0 && needed <= limit + 2)) {
        page.push({ id, top: 0, height: 0 });
        used += needed;
        continue;
      }
      let top = 0;
      let left = content;
      let lead = margin;
      let guard = 0;
      while (left > 0.5 && guard < 24) {
        guard += 1;
        page = packed[packed.length - 1];
        const room = limit - used;
        if (page.length > 0 && room < lead + 24) {
          packed.push([]);
          used = 0;
          continue;
        }
        let take = Math.min(left, Math.max(0, room - lead));
        if (page.length === 0 && take < 8) take = Math.min(left, Math.max(8, limit - lead));
        if (take < 1) break;
        if (left - take < 4) take = left;
        const natural = top < 0.5 && left - take < 0.5;
        page.push({ id, top: Math.round(top), height: natural ? 0 : Math.round(take) });
        used += lead + take;
        top += take;
        left -= take;
        lead = 0;
        if (left > 0.5) {
          packed.push([]);
          used = 0;
        }
      }
    }
    const nextPages = packed.filter((page) => page.length > 0);
    const overflowing = new Set<string>();
    for (const frameNode of current.querySelectorAll<HTMLElement>('[data-quotation-frame]')) {
      const bottom = frameNode.getBoundingClientRect().bottom;
      for (const node of frameNode.querySelectorAll<HTMLElement>('[data-break]')) {
        const id = node.dataset.break || '';
        if (!id || id === 'header') continue;
        const full = node.querySelector<HTMLElement>('.quotation-block-full') || node;
        if (full.getBoundingClientRect().bottom > bottom + 2) overflowing.add(id);
      }
    }
    const fitted: PageSlice[][] = [];
    for (const page of (nextPages.length ? nextPages : fallbackPages(blockIds))) {
      let bucket: PageSlice[] = [];
      for (const slice of page) {
        if (slice.top === 0 && overflowing.has(slice.id) && bucket.length > 0) {
          fitted.push(bucket);
          bucket = [];
        }
        bucket.push(slice);
      }
      if (bucket.length) fitted.push(bucket);
    }
    const flowPages = fitted.filter((page) => page.length > 0);
    setPagesOfIds((currentPages) => {
      const plan = flowPages.length ? flowPages : fallbackPages(blockIds);
      if (samePagePlan(currentPages, plan)) return currentPages;
      const active = window.document.activeElement;
      if (active instanceof HTMLElement && current.contains(active) && active.isContentEditable) {
        const host = active.closest<HTMLElement>('[data-block], [data-break]');
        const blockId = host?.dataset.block || host?.dataset.break || '';
        const fields = host ? [...host.querySelectorAll<HTMLElement>('.quotation-rich')] : [];
        const fieldIndex = fields.indexOf(active);
        const offset = caretOffset(active);
        if (blockId && fieldIndex >= 0 && offset != null) caretHold.current = { blockId, fieldIndex, offset };
      }
      return plan;
    });
    const followId = followBlock.current;
    if (followId) {
      current.querySelector<HTMLElement>(`[data-break="${CSS.escape(followId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [blockIds, document, layoutNonce, pagesOfIds, po, quotationNumber, visibleBlocks]);

  useLayoutEffect(() => {
    const hold = caretHold.current;
    const root = sheetRef.current;
    if (!hold || !root) return;
    caretHold.current = null;
    const selector = `[data-block="${CSS.escape(hold.blockId)}"], [data-break="${CSS.escape(hold.blockId)}"]`;
    const hosts = [...root.querySelectorAll<HTMLElement>(selector)];
    const firstField = hosts[0]?.querySelectorAll<HTMLElement>('.quotation-rich')[hold.fieldIndex];
    if (firstField && window.document.activeElement === firstField) return;
    for (const host of hosts) {
      const field = host.querySelectorAll<HTMLElement>('.quotation-rich')[hold.fieldIndex];
      if (!field) continue;
      field.focus({ preventScroll: true });
      placeCaret(field, hold.offset);
      const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      const clip = host.querySelector<HTMLElement>('[data-slice-clip]');
      if (!rect || !clip) return;
      const box = clip.getBoundingClientRect();
      if (rect.height === 0 || (rect.top >= box.top - 4 && rect.bottom <= box.bottom + 4)) return;
    }
  }, [pagesOfIds]);

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

  useEffect(() => {
    if (readOnly) return;
    function clearSection(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) {
        setSelectedSectionId(null);
        return;
      }
      if (target.closest('.quotation-format, .quotation-bubble, [role="dialog"]')) return;
      const section = target.closest('.quotation-section');
      const id = section?.getAttribute('data-block') || '';
      setSelectedSectionId((current) => (current && current !== id ? null : current));
    }
    window.addEventListener('pointerdown', clearSection);
    return () => window.removeEventListener('pointerdown', clearSection);
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.quotation-picture-chrome, .quotation-format')) return;
      const img = target.closest('img.quotation-picture');
      if (!(img instanceof HTMLImageElement) || !sheetRef.current?.contains(img)) {
        setPictureId(null);
        setLayoutOpen(false);
        return;
      }
      event.preventDefault();
      const id = img.dataset.id || '';
      if (!id) return;
      setPictureId(id);
      setLayoutOpen(true);
      const field = img.closest('[contenteditable="true"]');
      if (field instanceof HTMLElement) richField.current = field;
      const settings = readPicture(img);
      if (!pictureIsPositioned(settings.layout, settings.anchor)) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = settings.x;
      const originY = settings.y;
      const picture = img;
      let moved = false;
      function move(moveEvent: PointerEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        const x = Math.min(900, Math.max(-80, Math.round(originX + dx)));
        const y = Math.min(1400, Math.max(-80, Math.round(originY + dy)));
        writePicture(picture, { ...readPicture(picture), x, y });
        const rect = picture.getBoundingClientRect();
        setPictureBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (moved) commitPictureRef.current(picture);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
    function onPaste(event: ClipboardEvent) {
      const file = clipboardImage(event.clipboardData);
      if (!file) return;
      const target = event.target;
      if (!(target instanceof Element) || !sheetRef.current?.contains(target)) return;
      const field = target.closest('[contenteditable="true"]');
      if (!(field instanceof HTMLElement)) return;
      event.preventDefault();
      richField.current = field;
      const selection = window.getSelection();
      if (selection?.rangeCount && field.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange();
      void insertPictureRef.current(file);
    }
    function onKey(event: KeyboardEvent) {
      if (!pictureId) return;
      if (event.key === 'Escape') {
        const target = event.target;
        if (target instanceof Element && target.closest('.fixed.inset-0')) return;
        setPictureId(null);
        setLayoutOpen(false);
        return;
      }
      if (!layoutOpen || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const img = findPicture(sheetRef.current, pictureId);
      const field = img?.closest('[contenteditable="true"]');
      if (!img || !(field instanceof HTMLElement)) return;
      event.preventDefault();
      img.remove();
      commitPictureRef.current(field);
      setPictureId(null);
      setLayoutOpen(false);
      setPictureBox(null);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, [layoutOpen, pictureId, readOnly]);

  useLayoutEffect(() => {
    if (readOnly || !pictureId) {
      setPictureBox(null);
      return;
    }
    let frame = 0;
    let tries = 0;
    function measure() {
      const img = findPicture(sheetRef.current, pictureId);
      if (!img) {
        const pending = sheetRef.current?.innerHTML.includes(`data-id="${pictureId}"`) ?? false;
        if (!pending) {
          setPictureId(null);
          setLayoutOpen(false);
        }
        return;
      }
      const rect = img.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        if (tries < 10) {
          tries += 1;
          frame = window.requestAnimationFrame(measure);
        }
        return;
      }
      const next = { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
      setPictureBox((current) => (current && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next));
    }
    measure();
    frame = window.requestAnimationFrame(measure);
    const img = findPicture(sheetRef.current, pictureId);
    img?.addEventListener('load', measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      img?.removeEventListener('load', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [document, pictureId, readOnly]);

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
    if (!previous) return;
    historyBurst.current = null;
    redoStack.current.push(structuredClone(documentRef.current));
    noteHistory();
    restoreDocument(previous);
  }

  function redoEdit() {
    const next = redoStack.current.pop();
    if (!next) return;
    historyBurst.current = null;
    undoStack.current.push(structuredClone(documentRef.current));
    noteHistory();
    restoreDocument(next);
  }

  function applyCommand(command: string, value?: string) {
    historyBurst.current = null;
    const field = richField.current;
    field?.focus();
    const selection = window.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    window.document.execCommand('styleWithCSS', false, 'true');
    let applied = true;
    if (command === 'heading') {
      if (field && isHeadingLevel(value)) applyHeading(field, value);
    } else if (command === 'lineHeight') {
      const spacing = normalizeLineHeight(value);
      if (field && spacing) applyLineHeight(field, spacing);
    } else if (command === 'fontSize') {
      const pt = SIZES.includes(value as (typeof SIZES)[number]) ? value! : '11';
      window.document.execCommand('fontSize', false, '7');
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : savedRange.current;
      if (field) paintFontSize(field, range, pt);
    } else {
      applied = window.document.execCommand(command, false, value);
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
    return applied;
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

  function commitPicture(node: HTMLElement) {
    const field = node instanceof HTMLImageElement ? node.closest('[contenteditable="true"]') : node;
    if (!(field instanceof HTMLElement) || !field.isContentEditable) return;
    historyBurst.current = null;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    if (!(node instanceof HTMLImageElement) || !node.isConnected) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    setPictureBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }

  function changePicture(patch: { layout?: PictureLayout; anchor?: PictureAnchor; width?: number; x?: number; y?: number }) {
    const img = findPicture(sheetRef.current, pictureId);
    if (!img) return;
    const current = readPicture(img);
    let layout = patch.layout ?? current.layout;
    let anchor = patch.anchor ?? current.anchor;
    if (patch.anchor === 'page' && layout === 'inline') layout = 'square';
    if (layout === 'inline') anchor = 'text';
    let x = patch.x ?? current.x;
    let y = patch.y ?? current.y;
    const wasPositioned = pictureIsPositioned(current.layout, current.anchor);
    const nextPositioned = pictureIsPositioned(layout, anchor);
    if (nextPositioned && !wasPositioned && patch.x == null && patch.y == null) {
      const field = img.closest('.quotation-rich');
      if (field instanceof HTMLElement) {
        const imgRect = img.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        x = Math.min(900, Math.max(-80, Math.round(imgRect.left - fieldRect.left)));
        y = Math.min(1400, Math.max(-80, Math.round(imgRect.top - fieldRect.top)));
      }
    }
    if (!nextPositioned) {
      x = 0;
      y = 0;
    }
    const width = patch.width ?? current.width;
    writePicture(img, { id: current.id, layout, anchor, width: Math.min(420, Math.max(40, width)), x, y });
    commitPicture(img);
  }

  function previewPictureWidth(width: number) {
    const img = findPicture(sheetRef.current, pictureId);
    if (!img) return;
    const current = readPicture(img);
    writePicture(img, { ...current, width: Math.min(420, Math.max(40, Math.round(width))) });
  }

  function removePicture() {
    const img = findPicture(sheetRef.current, pictureId);
    if (!img) return;
    const field = img.closest('[contenteditable="true"]');
    img.remove();
    if (field instanceof HTMLElement) commitPicture(field);
    setPictureId(null);
    setLayoutOpen(false);
    setPictureBox(null);
  }

  async function insertPicture(file: File) {
    const field = richField.current;
    if (!field || !sheetRef.current?.contains(field)) {
      toast.error('Click in the text, then insert a picture');
      return;
    }
    let source: { src: string; width: number };
    try {
      source = await pictureSource(file);
    } catch (error) {
      toast.error(error instanceof Error && error.message === 'large' ? 'That picture is too large' : 'Choose a PNG, JPG, WEBP, or GIF picture');
      return;
    }
    if (!savedRange.current) {
      const range = window.document.createRange();
      range.selectNodeContents(field);
      range.collapse(false);
      savedRange.current = range;
    }
    const id = crypto.randomUUID();
    const applied = applyCommand('insertHTML', pictureMarkup(id, source.src, source.width));
    if (!applied) {
      toast.error('Click in the text, then insert a picture');
      return;
    }
    setPictureId(id);
    setLayoutOpen(true);
  }

  function resizePicture(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const img = findPicture(sheetRef.current, pictureId);
    if (!img) return;
    const picture = img;
    const startX = event.clientX;
    const start = readPicture(picture).width;
    function move(moveEvent: PointerEvent) {
      writePicture(picture, { ...readPicture(picture), width: Math.min(420, Math.max(40, Math.round(start + (moveEvent.clientX - startX)))) });
      const rect = picture.getBoundingClientRect();
      setPictureBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      commitPicture(picture);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  insertPictureRef.current = insertPicture;
  commitPictureRef.current = commitPicture;

  undoEditRef.current = undoEdit;
  redoEditRef.current = redoEdit;

  function addSection(type: (typeof SECTION_CHOICES)[number]['type']) {
    if (type === 'scope' || type === 'specification') {
      if (presetAlreadyUsed(document, type)) {
        window.document.getElementById(document.blocks.find((block) => block.type === type)?.id || '')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      pushHistory();
      update(insertBlock(document, type === 'scope' ? defaultScope() : defaultSpecification()));
      return;
    }
    pushHistory();
    update(insertBlock(document, type === 'option' ? defaultOption() : defaultBlank()));
  }

  function chooseSavedTerms(templateId: string) {
    const template = termsQuery.data?.find((entry) => entry.id === templateId);
    if (!template) return;
    pushHistory();
    const next = applySavedTerms(document, template.rows);
    update(next);
    setPresetMenu(null);
    const termsId = next.blocks.find((block) => block.type === 'terms')?.id;
    if (termsId) window.requestAnimationFrame(() => window.document.getElementById(termsId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function focusBlock(next: QuotationDocument, type: 'scope' | 'specification') {
    const blockId = next.blocks.find((block) => block.type === type)?.id;
    if (blockId) window.requestAnimationFrame(() => window.document.getElementById(blockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function chooseSavedScope(presetId: string) {
    const preset = scopePresets.data?.find((entry) => entry.id === presetId);
    if (!preset || preset.kind !== 'scope') return;
    pushHistory();
    const next = applySavedScope(document, preset.body);
    update(next);
    setPresetMenu(null);
    focusBlock(next, 'scope');
  }

  function chooseSavedSpecification(presetId: string) {
    const preset = specificationPresets.data?.find((entry) => entry.id === presetId);
    if (!preset || preset.kind !== 'specification') return;
    pushHistory();
    const next = applySavedSpecification(document, preset.rows);
    update(next);
    setPresetMenu(null);
    focusBlock(next, 'specification');
  }

  function insertSavedSection(sectionId: string, versionId?: string) {
    const saved = customQuery.data?.find((entry) => entry.id === sectionId);
    if (!saved) return;
    const version = versionId ? saved.content.versions?.find((entry) => entry.id === versionId) : undefined;
    if (versionId && !version) return;
    const content = version?.content ?? saved.content;
    pushHistory();
    const previous = new Set(document.blocks.map((block) => block.id));
    const next = insertCustomSection(document, content, sectionId, version?.id);
    update(next);
    setPresetMenu(null);
    const added = next.blocks.find((block) => !previous.has(block.id));
    if (added) window.requestAnimationFrame(() => window.document.getElementById(added.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function placedSectionBlocks(sectionId: string) {
    return document.blocks.filter((block): block is Extract<QuotationBlock, { type: 'blank' }> => block.type === 'blank' && block.sectionId === sectionId);
  }

  function requestSavedSection(sectionId: string, versionId?: string) {
    const family = placedSectionBlocks(sectionId);
    if (!family.length) {
      insertSavedSection(sectionId, versionId);
      return;
    }
    const exact = family.find((block) => (versionId ? block.versionId === versionId : !block.versionId));
    const target = exact ?? family[0];
    setDuplicatePrompt({ sectionId, versionId });
    setHighlightBlockId(target.id);
    window.requestAnimationFrame(() => {
      const list = sectionListRef.current;
      const row = list?.querySelector<HTMLElement>(`[data-section-anchor="${sectionId}"]`);
      if (list && row) setPromptTop(Math.max(0, row.getBoundingClientRect().top - list.getBoundingClientRect().top));
      window.document.getElementById(target.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function cancelDuplicate() {
    setDuplicatePrompt(null);
    setHighlightBlockId(null);
  }

  function confirmDuplicate() {
    if (!duplicatePrompt) return;
    const { sectionId, versionId } = duplicatePrompt;
    setDuplicatePrompt(null);
    setHighlightBlockId(null);
    insertSavedSection(sectionId, versionId);
  }

  async function saveLinkedSection(block: Extract<QuotationBlock, { type: 'blank' }>) {
    if (!block.sectionId || renameSectionState.isLoading || renameCustomVersionState.isLoading) return;
    const saved = customQuery.data?.find((entry) => entry.id === block.sectionId);
    const version = block.versionId ? saved?.content.versions.find((entry) => entry.id === block.versionId) : undefined;
    const name = (block.versionId ? version?.name : saved?.name) || plainText(block.name).slice(0, 80);
    const content = {
      name: block.name,
      body: block.body,
      minHeightMm: block.minHeightMm ?? DEFAULT_BLANK_HEIGHT_MM,
      widthPercent: block.widthPercent ?? 100,
    };
    try {
      if (block.versionId) await renameCustomVersion({ id: block.sectionId, versionId: block.versionId, name, content }).unwrap();
      else await renameSection({ id: block.sectionId, name, content }).unwrap();
      toast.success('Section saved');
    } catch (error) {
      toast.error(mutationMessage(error, 'Could not save the section'));
    }
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

  function openRename(kind: 'terms' | 'section' | 'scope' | 'specification' | 'version', id: string, name: string, sectionId?: string) {
    setRenameError('');
    setRenameName(name);
    setRenameTarget({ kind, id, sectionId });
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renameTarget) return;
    setRenameError('');
    try {
      if (renameTarget.kind === 'terms') await renameTerms({ id: renameTarget.id, name: renameName }).unwrap();
      else if (renameTarget.kind === 'scope' || renameTarget.kind === 'specification') {
        await renamePreset({ id: renameTarget.id, kind: renameTarget.kind, name: renameName }).unwrap();
      } else if (renameTarget.kind === 'version' && renameTarget.sectionId) {
        await renameCustomVersion({ id: renameTarget.sectionId, versionId: renameTarget.id, name: renameName }).unwrap();
      } else await renameSection({ id: renameTarget.id, name: renameName }).unwrap();
      setRenameTarget(null);
      setRenameName('');
      toast.success('Name updated');
    } catch (error) {
      setRenameError(mutationMessage(error, 'Could not rename'));
    }
  }

  function askRemoveSaved(kind: 'terms' | 'section' | 'scope' | 'specification', id: string, name: string) {
    setDeleteTarget({ kind, id, name });
  }

  function askRemoveVersion(sectionId: string, versionId: string, name: string) {
    setDeleteTarget({ kind: 'version', id: versionId, name, sectionId });
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    const label = target.kind === 'terms' ? 'terms' : target.kind === 'scope' ? 'scope' : target.kind === 'specification' ? 'specification' : target.kind === 'version' ? 'version' : 'section';
    setDeleting(true);
    try {
      if (target.kind === 'terms') await deleteTerms(target.id).unwrap();
      else if (target.kind === 'scope' || target.kind === 'specification') await deletePreset({ id: target.id, kind: target.kind }).unwrap();
      else if (target.kind === 'version' && target.sectionId) await deleteCustomVersion({ id: target.sectionId, versionId: target.id }).unwrap();
      else await deleteSection(target.id).unwrap();
      setDeleteTarget(null);
      toast.success(target.kind === 'version' ? 'Version deleted' : `Saved ${label} deleted`);
    } catch (error) {
      toast.error(mutationMessage(error, 'Could not delete'));
    } finally {
      setDeleting(false);
    }
  }

  async function submitSavedPreset(event: FormEvent) {
    event.preventDefault();
    if (!savePreset) return;
    setSaveError('');
    try {
      if (savePreset.kind === 'scope') await createPreset({ kind: 'scope', name: saveName, body: savePreset.body }).unwrap();
      else await createPreset({ kind: 'specification', name: saveName, rows: savePreset.rows }).unwrap();
      setSavePreset(null);
      setSaveName('');
      toast.success(savePreset.kind === 'scope' ? 'Scope saved' : 'Specification saved');
    } catch (error) {
      setSaveError(mutationMessage(error, 'Could not save'));
    }
  }

  async function submitSavedSection(event: FormEvent) {
    event.preventDefault();
    if (!saveSection) return;
    setSaveError('');
    const content = {
      name: saveSection.name,
      body: saveSection.body,
      minHeightMm: saveSection.minHeightMm,
      widthPercent: saveSection.widthPercent,
    };
    try {
      const parentSectionId = saveSection.parentSectionId;
      const created = parentSectionId
        ? await createCustomVersion({ id: parentSectionId, name: saveName, content }).unwrap()
        : await createCustomSection({ name: saveName, content }).unwrap();
      const blockId = saveSection.blockId;
      pushHistory();
      update({
        ...document,
        blocks: document.blocks.map((block) => {
          if (block.id !== blockId || block.type !== 'blank') return block;
          if (parentSectionId) return { ...block, sectionId: parentSectionId, versionId: created.id };
          const next = { ...block, sectionId: created.id };
          delete next.versionId;
          return next;
        }),
      });
      toast.success(parentSectionId ? 'Version saved' : 'Template saved');
      setSaveSection(null);
      setSaveName('');
    } catch (error) {
      setSaveError(mutationMessage(error, 'Could not save the section'));
    }
  }

  const saveSectionParentName = saveSection?.parentSectionId
    ? customQuery.data?.find((entry) => entry.id === saveSection.parentSectionId)?.name ?? ''
    : '';
  const pad = padImageUrl(letterheadUrl);
  const selectedPicture = pictureId ? findPicture(sheetRef.current, pictureId) : null;
  const pictureSettings = selectedPicture ? readPicture(selectedPicture) : null;

  return (
    <div ref={sheetRef} className="quotation-sheet flex items-start gap-4">
      {readOnly ? null : (
        <aside className="quotation-edit-only sticky top-0 z-20 w-56 shrink-0 self-start">
          <div ref={sectionListRef} className="relative">
          <div className="max-h-[calc(100dvh-5rem)] space-y-3 overflow-y-auto">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a section</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">A price option goes under the item list. Other sections stay above the closing.</p>
            <div className="mt-3 flex flex-col gap-2">
              {SECTION_CHOICES.map((choice) => {
                const used = choice.type === 'terms' || choice.type === 'scope' || choice.type === 'specification'
                  ? presetAlreadyUsed(document, choice.type)
                  : false;
                if (choice.type === 'terms' || choice.type === 'scope' || choice.type === 'specification') {
                  const items = choice.type === 'terms'
                    ? termsItems
                    : choice.type === 'scope'
                      ? (scopePresets.data ?? []).flatMap((entry) => (entry.kind === 'scope' ? [{ id: entry.id, label: entry.name }] : []))
                      : (specificationPresets.data ?? []).flatMap((entry) => (entry.kind === 'specification' ? [{ id: entry.id, label: entry.name }] : []));
                  return (
                    <SavedPresetPicker
                      key={choice.type}
                      label={choice.label}
                      hint={choice.hint}
                      used={used}
                      open={presetMenu === choice.type}
                      items={items}
                      emptyText={choice.type === 'terms' ? 'No saved terms yet' : 'No saved versions yet'}
                      addLabel={choice.type === 'terms' ? undefined : 'Use the standard text'}
                      onToggle={() => setPresetMenu((open) => (open === choice.type ? null : choice.type))}
                      onChoose={choice.type === 'terms' ? chooseSavedTerms : choice.type === 'scope' ? chooseSavedScope : chooseSavedSpecification}
                      onRename={(id, name) => openRename(choice.type, id, name)}
                      onDelete={(id, name) => askRemoveSaved(choice.type, id, name)}
                      onAddBlank={choice.type !== 'terms' && !used ? () => {
                        addSection(choice.type);
                        setPresetMenu(null);
                      } : undefined}
                    />
                  );
                }
                if (choice.type === 'blank') {
                  return (
                    <div key={choice.type} className="flex flex-col gap-2">
                      {(customQuery.data ?? []).map((item) => {
                        const versions = item.content.versions ?? [];
                        const familyOnPage = document.blocks.some((block) => block.type === 'blank' && block.sectionId === item.id);
                        const parentOnPage = document.blocks.some((block) => block.type === 'blank' && block.sectionId === item.id && !block.versionId);
                        if (versions.length === 0) {
                          return (
                            <div key={item.id} data-section-anchor={item.id} className="flex items-stretch gap-1">
                              <button
                                type="button"
                                onClick={() => requestSavedSection(item.id)}
                                className={`min-w-0 flex-1 cursor-pointer rounded-md border px-3 py-2 text-left ${parentOnPage ? 'quotation-section-used' : 'border-border bg-background hover:bg-muted/50'}`}
                              >
                                <span className="block text-sm font-medium">{parentOnPage ? item.name : `+ ${item.name}`}</span>
                                <span className="block text-[11px] text-muted-foreground">{parentOnPage ? 'On the page' : 'Saved section'}</span>
                              </button>
                              <button type="button" aria-label={`Rename ${item.name}`} title="Rename" className="cursor-pointer rounded-md border border-border px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground" onClick={() => openRename('section', item.id, item.name)}>
                                <Pencil className="size-3.5" />
                              </button>
                              <button type="button" aria-label={`Delete ${item.name}`} title="Delete" className="cursor-pointer rounded-md border border-border px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground" onClick={() => askRemoveSaved('section', item.id, item.name)}>
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          );
                        }
                        return (
                          <SavedPresetPicker
                            key={item.id}
                            label={item.name}
                            hint="Saved section"
                            anchorId={item.id}
                            used={familyOnPage}
                            open={presetMenu === item.id}
                            items={[
                              { id: item.id, label: item.name, used: parentOnPage },
                              ...versions.map((version) => ({
                                id: version.id,
                                label: version.name,
                                used: document.blocks.some((block) => block.type === 'blank' && block.sectionId === item.id && block.versionId === version.id),
                              })),
                            ]}
                            emptyText="No saved versions yet"
                            onToggle={() => setPresetMenu((open) => (open === item.id ? null : item.id))}
                            onChoose={(choiceId) => requestSavedSection(item.id, choiceId === item.id ? undefined : choiceId)}
                            onRename={(choiceId, name) => {
                              if (choiceId === item.id) openRename('section', item.id, name);
                              else openRename('version', choiceId, name, item.id);
                            }}
                            onDelete={(choiceId, name) => {
                              if (choiceId === item.id) askRemoveSaved('section', item.id, name);
                              else askRemoveVersion(item.id, choiceId, name);
                            }}
                          />
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addSection('blank')}
                        className="cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <span className="block text-sm font-medium">+ {choice.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{choice.hint}</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <button
                    key={choice.type}
                    type="button"
                    onClick={() => addSection(choice.type)}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-left ${used ? 'quotation-section-used' : 'border-border bg-background hover:bg-muted/50'}`}
                  >
                    <span className="block text-sm font-medium">{used ? choice.label : `+ ${choice.label}`}</span>
                    <span className="block text-[11px] text-muted-foreground">{used ? 'On the page' : choice.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
          {duplicatePrompt ? (
            <div className="absolute left-full z-40 ml-2 w-60 rounded-lg border border-border bg-background p-3 shadow-lg" style={{ top: promptTop }}>
              <p className="text-sm">This section is already on the page. Add it again?</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={cancelDuplicate}>Cancel</button>
                <button type="button" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={confirmDuplicate}>Add</button>
              </div>
            </div>
          ) : null}
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {readOnly ? null : (
          <div className="quotation-format quotation-edit-only sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 shadow-sm">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide">Format</span>
            <FormatControls variant="full" marks={marks} highlight={highlight} fontColor={fontColor} onFormat={format} onPrepare={prepareFormat} canUndo={historyCounts.undo > 0} canRedo={historyCounts.redo > 0} tableReady={tableReady} onInsertTable={insertTable} pictureReady={pictureReady} onInsertPicture={(file) => void insertPicture(file)} />
          </div>
        )}
        {bubble && !readOnly ? (
          <div
            className="quotation-bubble quotation-format fixed z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-full flex-wrap items-center gap-1 rounded-lg border p-1 shadow-lg"
            style={{ top: bubble.top, left: bubble.left }}
            onMouseDown={(event) => {
              const target = event.target;
              if (target instanceof Element && target.closest('select, option, input, textarea')) return;
              event.preventDefault();
            }}
          >
            <FormatControls variant="compact" marks={marks} highlight={highlight} fontColor={fontColor} onFormat={format} onPrepare={prepareFormat} />
          </div>
        ) : null}
        <div className="quotation-pages flex flex-col items-center gap-8 overflow-x-auto py-2">
          {pages.map((page, pageIndex) => (
            <article key={pageIndex} className="quotation-page quotation-pad relative shrink-0 overflow-hidden shadow" style={{ width: '210mm', height: '297mm', maxHeight: '297mm', overflow: 'hidden', fontFamily: 'Calibri, Candara, Arial, sans-serif' }}>
              <img src={pad} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />
              <div className="relative z-[1] h-full px-[14mm] pb-[26mm] pt-[40mm]">
                <div data-quotation-frame className="overflow-hidden" style={{ height: `${PAGE_INNER_MM}mm` }}>
                {page.some((slice) => slice.id === 'header') ? (
                  <div data-break="header">
                    <div className="flex justify-end">
                      <div className="flex items-baseline gap-1 text-[12pt] font-semibold underline">
                        <span>TRN-</span>
                        <Field value={document.trn} readOnly={readOnly} className="w-[46mm] shrink-0" onChange={(trn) => edit({ ...document, trn }, 'trn')} />
                      </div>
                    </div>
                    <h2 className="quotation-doc-title text-center text-[16pt] font-bold underline" style={{ margin: 0, fontSize: '16pt', fontWeight: 700, lineHeight: 'normal', color: '#111111' }}>Quotation</h2>
                    <div className="mt-2 border border-black text-[11pt]">
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="border-r border-black px-2 py-1"><span className="font-semibold">Quotation Number:</span> {quotationNumber || 'Assigned when forwarded'}</div>
                        <div className="flex items-center gap-2 px-2 py-1"><span className="font-semibold">Date:</span> {readOnly ? displayDate(document.date) : <input type="date" value={document.date} onChange={(event) => edit({ ...document, date: event.target.value }, 'date')} className="bg-transparent outline-none" />}</div>
                      </div>
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="space-y-0.5 border-r border-black px-2 py-1">
                          <div className="flex items-start gap-1">
                            <p className="flex min-w-0 flex-1 gap-2"><span className="shrink-0 font-semibold">M/S.</span><Field value={document.customer.name} readOnly={readOnly} className="min-w-0 flex-1" onChange={(name) => edit({ ...document, customer: { ...document.customer, name } }, 'customer-name')} /></p>
                            {readOnly || !sourceCustomerName ? null : (
                              <button
                                type="button"
                                className="quotation-edit-only shrink-0 rounded border border-sky-700 px-1 py-0.5 text-[9px] leading-tight text-sky-800"
                                onClick={() => edit({ ...document, customer: { ...document.customer, name: sourceCustomerName } }, 'customer-name')}
                              >
                                Use query name
                              </button>
                            )}
                          </div>
                          <Field value={document.customer.city} readOnly={readOnly} className="block w-full" onChange={(city) => edit({ ...document, customer: { ...document.customer, city } }, 'customer-city')} />
                          <p className="flex gap-2"><span className="shrink-0">TEL:</span><Field value={document.customer.tel} readOnly={readOnly} className="min-w-0 flex-1" onChange={(tel) => edit({ ...document, customer: { ...document.customer, tel } }, 'customer-tel')} /><span className="shrink-0">FAX:</span><Field value={document.customer.fax} readOnly={readOnly} className="min-w-0 flex-1" onChange={(fax) => edit({ ...document, customer: { ...document.customer, fax } }, 'customer-fax')} /></p>
                        </div>
                        <div className="space-y-0.5 px-2 py-1">
                          <p className="flex gap-2"><span className="shrink-0">Contact Name:</span><Field value={document.customer.contactName} readOnly={readOnly} className="min-w-0 flex-1" onChange={(contactName) => edit({ ...document, customer: { ...document.customer, contactName } }, 'contact-name')} /></p>
                          <p className="flex gap-2"><span className="shrink-0">Contact Number:</span><Field value={document.customer.contactNumber} readOnly={readOnly} className="min-w-0 flex-1" onChange={(contactNumber) => edit({ ...document, customer: { ...document.customer, contactNumber } }, 'contact-number')} /></p>
                          <p className="flex gap-2"><span className="shrink-0">Email ID:</span><Field value={document.customer.email} readOnly={readOnly} className="quotation-link min-w-0 flex-1" onChange={(email) => edit({ ...document, customer: { ...document.customer, email } }, 'customer-email')} /></p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 items-start border-b border-black">
                        <div className="flex items-start gap-2 border-r border-black px-2 py-1"><span className="shrink-0 font-semibold">Quote Title:</span><RichText value={document.quoteTitle} readOnly={readOnly} onChange={(quoteTitle) => edit({ ...document, quoteTitle }, 'quote-title')} className="min-w-0 flex-1" /></div>
                        <div className="flex items-start gap-2 px-2 py-1"><span className="shrink-0 font-semibold">Total Cost:</span><RichText value={document.totalCostWords} readOnly={readOnly} onChange={(totalCostWords) => edit({ ...document, totalCostWords }, 'total-cost')} className="min-w-0 flex-1" /></div>
                      </div>
                      {po ? <div className="border-b border-black px-2 py-1"><span className="font-semibold">Purchase Order:</span> {po.number}{po.date ? ` · ${displayDate(po.date)}` : ''}{po.value ? ` · ${po.value}` : ''}</div> : null}
                      <div className="flex gap-2 px-2 py-1"><span className="shrink-0 font-semibold">PROJECT:</span><RichText value={document.project} readOnly={readOnly} onChange={(project) => edit({ ...document, project }, 'project')} className="min-w-0 flex-1" /></div>
                    </div>
                    <RichText value={document.includesLine} readOnly={readOnly} onChange={(includesLine) => edit({ ...document, includesLine }, 'includes')} className="mt-2 uppercase italic underline" />
                  </div>
                ) : null}
                {page.filter((slice) => slice.id !== 'header').map((slice) => {
                  const block = blockById.get(slice.id);
                  if (!block) return null;
                  const isFirst = slice.top === 0;
                  const sliceAt = page.indexOf(slice);
                  const isLast = !page.slice(sliceAt + 1).some((item) => item.id === slice.id)
                    && !pages.slice(pageIndex + 1).some((entry) => entry.some((item) => item.id === slice.id));
                  return (
                  <section
                    key={`${slice.id}:${slice.top}`}
                    id={isFirst ? block.id : undefined}
                    data-break={isFirst ? block.id : undefined}
                    data-block={block.id}
                    className={`quotation-section relative ${selectedSectionId === block.id ? 'quotation-section-hot' : ''} ${isFirst && dropTarget?.beforeId === block.id ? 'quotation-drop-before' : ''}`}
                    style={{ marginTop: isFirst ? `${sectionGapMm(block)}mm` : 0 }}
                  >
                    {!isFirst || readOnly ? null : (
                      <div
                        className="quotation-gap-handle quotation-edit-only"
                        title="Drag to change the gap"
                        style={{ height: `${sectionGapMm(block)}mm` }}
                        onPointerDown={(event) => startGapDrag(event, block.id)}
                      >
                        <button
                          type="button"
                          aria-label={`Select ${sectionTitle(block)}`}
                          title="Drag to move this section"
                          className={`quotation-section-grip ${selectedSectionId === block.id ? 'is-selected' : ''}`}
                          style={{ position: 'absolute', left: '50%', top: `${sectionGapMm(block) / 2}mm`, transform: 'translate(-50%, -50%)', zIndex: 2 }}
                          onPointerDown={(event) => startSectionDrag(event, block.id)}
                        >
                          <GripHorizontal className="size-3.5" />
                        </button>
                      </div>
                    )}
                    {!isFirst || readOnly ? null : (
                      <button
                        type="button"
                        aria-label={`Remove ${sectionTitle(block)}`}
                        title="Remove section"
                        className="quotation-edit-only absolute right-0 top-0 z-20 inline-flex size-6 items-center justify-center rounded-md text-[#64748b] hover:bg-[#e8eef5] hover:text-[#111111]"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setPendingRemoveSection({ id: block.id, name: sectionTitle(block) })}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                    <div data-slice-clip style={slice.height > 0 ? { height: slice.height, overflow: 'hidden' } : undefined}>
                    <div className="quotation-block-full" style={slice.top > 0 ? { marginTop: -slice.top } : undefined}>
                    <BlockView
                      block={block}
                      readOnly={readOnly}
                      optionCount={options.length}
                      onSaveTerms={block.type === 'terms' && !readOnly ? () => {
                        setSaveSection(null);
                        setSavePreset(null);
                        setSaveName('');
                        setSaveError('');
                        setSaveTerms(block.type === 'terms' ? block.rows.map((row) => ({ label: row.label, value: row.value })) : null);
                      } : undefined}
                      onSaveScope={block.type === 'scope' && !readOnly ? () => {
                        if (block.type !== 'scope') return;
                        setSaveTerms(null);
                        setSaveSection(null);
                        setSaveName('');
                        setSaveError('');
                        setSavePreset({ kind: 'scope', body: block.body });
                      } : undefined}
                      onSaveSpecification={block.type === 'specification' && !readOnly ? () => {
                        if (block.type !== 'specification') return;
                        setSaveTerms(null);
                        setSaveSection(null);
                        setSaveName('');
                        setSaveError('');
                        setSavePreset({ kind: 'specification', rows: block.rows.map((row) => ({ label: row.label, value: row.value })) });
                      } : undefined}
                      onSaveSection={block.type === 'blank' && block.sectionId && !readOnly ? () => {
                        if (block.type !== 'blank') return;
                        void saveLinkedSection(block);
                      } : undefined}
                      onSaveSectionAsNew={block.type === 'blank' && !readOnly ? () => {
                        if (block.type !== 'blank') return;
                        setSaveTerms(null);
                        setSavePreset(null);
                        setSaveError('');
                        setSaveName(plainText(block.name).slice(0, 80));
                        setSaveSection({
                          blockId: block.id,
                          name: block.name,
                          body: block.body,
                          minHeightMm: block.minHeightMm ?? DEFAULT_BLANK_HEIGHT_MM,
                          widthPercent: block.widthPercent ?? 100,
                          parentSectionId: block.sectionId ?? '',
                        });
                      } : undefined}
                      spotlight={highlightBlockId === block.id}
                      onChange={(next) => patchBlock(block.id, next)}
                      onBlankResize={isLast && block.type === 'blank' && !readOnly ? (event, mode) => startBlankResize(event, block.id, mode) : undefined}
                    />
                    </div>
                    </div>
                  </section>
                  );
                })}
                </div>
              </div>
              <p className="absolute bottom-[18mm] left-0 right-0 z-[1] text-center text-[10pt]">Page {pageIndex + 1} of {pages.length}</p>
            </article>
          ))}
        </div>
      </div>
      <Modal
        isOpen={Boolean(pendingRemoveSection)}
        onClose={() => setPendingRemoveSection(null)}
        title="Remove this section?"
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setPendingRemoveSection(null)}>Cancel</Button>
            <Button type="button" variant="destructive" size="sm" onClick={confirmRemoveSection}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {pendingRemoveSection ? `${pendingRemoveSection.name} will be removed from this quotation.` : null}
        </p>
      </Modal>
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete the saved ${deleteTarget.kind === 'version' ? 'version' : deleteTarget.kind === 'terms' ? 'terms' : deleteTarget.kind === 'scope' ? 'scope' : deleteTarget.kind === 'specification' ? 'specification' : 'section'} “${deleteTarget.name}”?` : 'Delete'}
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Spinner size="sm" /> : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">Quotations that already use it keep their copy.</p>
      </Modal>
      {renameTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setRenameTarget(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitRename(event)}>
            <p className="text-sm font-semibold">{renameTarget.kind === 'terms' ? 'Rename saved terms' : renameTarget.kind === 'scope' ? 'Rename saved scope' : renameTarget.kind === 'specification' ? 'Rename saved specification' : renameTarget.kind === 'version' ? 'Rename saved version' : 'Rename saved section'}</p>
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
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={renameTermsState.isLoading || renameSectionState.isLoading || renamePresetState.isLoading || renameCustomVersionState.isLoading}>{renameTermsState.isLoading || renameSectionState.isLoading || renamePresetState.isLoading || renameCustomVersionState.isLoading ? <Spinner size="sm" /> : 'Save'}</button>
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
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={createTermsState.isLoading}>{createTermsState.isLoading ? <Spinner size="sm" /> : 'Save'}</button>
            </div>
          </form>
        </div>
      ) : null}
      {savePreset ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setSavePreset(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitSavedPreset(event)}>
            <p className="text-sm font-semibold">{savePreset.kind === 'scope' ? 'Save this scope as' : 'Save this specification as'}</p>
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              autoFocus
              maxLength={80}
              placeholder="Name"
              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
            {saveError ? <p className="mt-2 text-xs text-red-700">{saveError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setSavePreset(null)}>Cancel</button>
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={createPresetState.isLoading}>{createPresetState.isLoading ? <Spinner size="sm" /> : 'Save'}</button>
            </div>
          </form>
        </div>
      ) : null}
      {saveSection ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setSaveSection(null)}>
          <form className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => void submitSavedSection(event)}>
            <p className="text-sm font-semibold">Save as new template</p>
            {saveSectionParentName ? <p className="mt-1 text-xs text-muted-foreground">New version under {saveSectionParentName}</p> : null}
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
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" disabled={createCustomSectionState.isLoading || createCustomVersionState.isLoading}>{createCustomSectionState.isLoading || createCustomVersionState.isLoading ? <Spinner size="sm" /> : 'Save'}</button>
            </div>
          </form>
        </div>
      ) : null}
      {pictureSettings && pictureBox && !readOnly ? (
        <PictureChrome
          box={pictureBox}
          settings={pictureSettings}
          layoutOpen={layoutOpen}
          more={pictureMore}
          onToggle={() => setLayoutOpen((open) => !open)}
          onClose={() => setLayoutOpen(false)}
          onMore={() => setPictureMore(true)}
          onLayout={(layout) => changePicture({ layout })}
          onAnchor={(anchor) => changePicture({ anchor })}
          onWidth={previewPictureWidth}
          onCommitWidth={(width) => {
            const img = findPicture(sheetRef.current, pictureId);
            if (!img) return;
            const current = readPicture(img);
            writePicture(img, { ...current, width: Math.min(420, Math.max(40, Math.round(width))) });
            commitPicture(img);
          }}
          onPosition={(x, y) => changePicture({ x, y })}
          onResize={resizePicture}
          onRemove={removePicture}
        />
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

function itemRowStyle(mm: number | undefined) {
  if (!mm) return undefined;
  return { height: `${mm}mm` };
}

function startItemColumnResize(
  event: ReactPointerEvent<HTMLElement>,
  block: Extract<QuotationBlock, { type: 'option' }>,
  key: string,
  nextKey: string,
  onChange: (block: QuotationBlock) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const table = event.currentTarget.closest('table');
  const tableWidth = table?.getBoundingClientRect().width || 1;
  const startX = event.clientX;
  const start = priceColumnWidths(block);
  const move = (moveEvent: PointerEvent) => {
    onChange({ ...block, widths: resizedWidths(start, key, nextKey, ((moveEvent.clientX - startX) / tableWidth) * 100) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startItemRowResize(
  event: ReactPointerEvent<HTMLElement>,
  block: Extract<QuotationBlock, { type: 'option' }>,
  heightKey: string,
  onChange: (block: QuotationBlock) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  const row = event.currentTarget.closest('tr');
  const startY = event.clientY;
  const current = block.rowHeights?.[heightKey];
  const startMm = current ?? ((row?.getBoundingClientRect().height || 0) * 25.4) / 96;
  let last = startMm;
  const move = (moveEvent: PointerEvent) => {
    const heightMm = Math.min(80, Math.max(6, Math.round((startMm + ((moveEvent.clientY - startY) * 25.4) / 96) * 2) / 2));
    if (heightMm === last) return;
    last = heightMm;
    onChange({ ...block, rowHeights: { ...block.rowHeights, [heightKey]: heightMm } });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function ItemCellEdges({
  nextKey,
  onColumn,
  onRow,
}: {
  nextKey?: string;
  onColumn: (event: ReactPointerEvent<HTMLElement>) => void;
  onRow: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <>
      {nextKey ? (
        <span
          role="separator"
          aria-orientation="vertical"
          className="quotation-edit-only absolute bottom-2 right-0 top-0 z-20 w-2 cursor-col-resize"
          onPointerDown={onColumn}
        />
      ) : null}
      <span
        role="separator"
        aria-orientation="horizontal"
        title="Drag to change the row height"
        className="quotation-edit-only absolute inset-x-0 bottom-0 z-10 h-2 cursor-row-resize"
        onPointerDown={onRow}
      />
    </>
  );
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

function ItemRemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const name = plainText(label).trim() || 'this item';
  return (
    <>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        title="Remove"
        className="quotation-edit-only inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[#64748b] hover:bg-[#e8eef5] hover:text-[#111111]"
        onClick={() => setOpen(true)}
      >
        <X className="size-3.5" />
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Remove this item?"
        size="sm"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{name} will be removed from this section.</p>
      </Modal>
    </>
  );
}

function BlockView({
  block,
  readOnly,
  optionCount,
  onSaveTerms,
  onSaveScope,
  onSaveSpecification,
  onSaveSection,
  onSaveSectionAsNew,
  spotlight = false,
  onChange,
  onBlankResize,
}: {
  block: QuotationBlock;
  readOnly: boolean;
  optionCount: number;
  onSaveTerms?: () => void;
  onSaveScope?: () => void;
  onSaveSpecification?: () => void;
  onSaveSection?: () => void;
  onSaveSectionAsNew?: () => void;
  spotlight?: boolean;
  onChange: (block: QuotationBlock, recordHistory?: boolean) => void;
  onBlankResize?: (event: ReactPointerEvent<HTMLElement>, mode: 'height' | 'both') => void;
}) {
  if (block.type === 'option') {
    const total = optionTotal(block);
    const titled = showOptionTitle(block, optionCount);
    const columns = (block.columns ?? []).slice(0, 2);
    const leadColumns = 3 + columns.length;
    return (
      <div>
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
            <tr className="text-center font-semibold" style={itemRowStyle(block.rowHeights?.header)}>
              {priceHeaders(block, columns, readOnly, onChange).map((header) => (
                <th key={header.key} className="relative border border-black px-1 py-1 align-top" style={itemRowStyle(block.rowHeights?.header)}>
                  {header.content}
                  {readOnly ? null : (
                    <ItemCellEdges
                      nextKey={header.next}
                      onColumn={(event) => header.next && startItemColumnResize(event, block, header.key, header.next, onChange)}
                      onRow={(event) => startItemRowResize(event, block, 'header', onChange)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => {
              const rowMm = block.rowHeights?.[row.id];
              const edges = (columnKey: string, next?: string) => readOnly ? null : (
                <ItemCellEdges
                  nextKey={next}
                  onColumn={(event) => next && startItemColumnResize(event, block, columnKey, next, onChange)}
                  onRow={(event) => startItemRowResize(event, block, row.id, onChange)}
                />
              );
              const columnKeys = ['sl', 'item', 'description', ...columns.map((column) => column.id), 'unitPrice', 'quantity', 'total'];
              const nextOf = (key: string) => columnKeys[columnKeys.indexOf(key) + 1];
              return (
              <tr key={row.id} className="align-top" style={itemRowStyle(rowMm)}>
                <td className="relative border border-black px-1 py-1 text-center" style={itemRowStyle(rowMm)}>{index + 1}{edges('sl', nextOf('sl'))}</td>
                <td className="relative border border-black px-1 py-1 text-center" style={itemRowStyle(rowMm)}><RichText value={row.item} readOnly={readOnly} className="text-center" onChange={(item) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, item } : entry) })} />{edges('item', nextOf('item'))}</td>
                <td className="relative border border-black px-1 py-1" style={itemRowStyle(rowMm)}><RichText value={row.description} readOnly={readOnly} onChange={(description) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, description } : entry) })} />{edges('description', nextOf('description'))}</td>
                {columns.map((column) => (
                  <td key={column.id} className="relative border border-black px-1 py-1" style={itemRowStyle(rowMm)}>
                    <RichText
                      value={row.extras?.[column.id] ?? ''}
                      readOnly={readOnly}
                      onChange={(value) => onChange({
                        ...block,
                        rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, extras: { ...entry.extras, [column.id]: value } } : entry),
                      })}
                    />
                    {edges(column.id, nextOf(column.id))}
                  </td>
                ))}
                <td className="relative border border-black px-1 py-1 text-center" style={itemRowStyle(rowMm)}><Field value={row.unitPrice} readOnly={readOnly} className="w-full text-center" onChange={(unitPrice) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, unitPrice } : entry) })} />{edges('unitPrice', nextOf('unitPrice'))}</td>
                <td className="relative border border-black px-1 py-1 text-center" style={itemRowStyle(rowMm)}><Field value={row.quantity} readOnly={readOnly} className="w-full text-center" onChange={(quantity) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, quantity } : entry) })} />{edges('quantity', nextOf('quantity'))}</td>
                <td className="relative border border-black px-1 py-1 text-center tabular-nums" style={itemRowStyle(rowMm)}>
                  <span className="inline-flex items-center justify-center gap-1">
                    {money(lineAmount(row))}
                    {readOnly ? null : (
                      <ItemRemoveButton
                        label={row.item}
                        onRemove={() => onChange({ ...block, rows: block.rows.filter((entry) => entry.id !== row.id) }, true)}
                      />
                    )}
                  </span>
                  {edges('total')}
                </td>
              </tr>
              );
            })}
            <tr className="font-semibold" style={itemRowStyle(block.rowHeights?.total)}>
              <td colSpan={leadColumns + 2} className="relative border border-black px-1 py-1 text-center" style={itemRowStyle(block.rowHeights?.total)}>
                Grand Total (Amount is 5% VAT Excluded)
                {readOnly ? null : (
                  <ItemCellEdges
                    nextKey="total"
                    onColumn={(event) => startItemColumnResize(event, block, 'quantity', 'total', onChange)}
                    onRow={(event) => startItemRowResize(event, block, 'total', onChange)}
                  />
                )}
              </td>
              <td className="relative border border-black px-1 py-1 text-center tabular-nums" style={itemRowStyle(block.rowHeights?.total)}>
                {money(total)}
                {readOnly ? null : <ItemCellEdges onColumn={() => undefined} onRow={(event) => startItemRowResize(event, block, 'total', onChange)} />}
              </td>
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
      </div>
    );
  }

  if (block.type === 'terms' || block.type === 'specification') {
    const rows = visibleRows(block.rows, readOnly);
    return (
      <div>
        <div className="flex items-start justify-between gap-2">
          <RichText value={block.name} readOnly={readOnly} className="min-w-0 flex-1 font-semibold" onChange={(name) => onChange({ ...block, name })} />
          {block.type === 'terms' && onSaveTerms ? (
            <button type="button" className="quotation-edit-only shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveTerms}>Save</button>
          ) : null}
          {block.type === 'specification' && onSaveSpecification ? (
            <button type="button" className="quotation-edit-only shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveSpecification}>Save</button>
          ) : null}
        </div>
        <div className={`mt-1 grid items-baseline gap-x-2 gap-y-1 ${block.type === 'specification' ? 'grid-cols-[2rem_max-content_auto_minmax(0,1fr)_auto]' : 'grid-cols-[max-content_auto_minmax(0,1fr)_auto]'}`}>
          {rows.map((row, index) => (
            <div key={row.id} className="col-span-full grid grid-cols-subgrid items-baseline">
              {block.type === 'specification' ? <span>{index + 1}.</span> : null}
              <RichText value={row.label} readOnly={readOnly} className="w-fit max-w-[62mm]" onChange={(label) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, label } : entry) })} />
              <span>:</span>
              <RichText value={row.value} readOnly={readOnly} onChange={(value) => onChange({ ...block, rows: block.rows.map((entry) => entry.id === row.id ? { ...entry, value } : entry) })} />
              {readOnly ? null : (
                <ItemRemoveButton
                  label={row.label}
                  onRemove={() => onChange({ ...block, rows: block.rows.filter((entry) => entry.id !== row.id) }, true)}
                />
              )}
            </div>
          ))}
        </div>
        {readOnly ? null : <button type="button" className="quotation-edit-only mt-1 block text-left text-xs text-slate-600" onClick={() => onChange({ ...block, rows: [...block.rows, { id: crypto.randomUUID(), label: 'Label', value: '' }] })}>Add row</button>}
      </div>
    );
  }

  if (block.type === 'signatures') {
    return (
      <div>
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
      </div>
    );
  }

  if (block.type === 'blank') {
    const blankHeight = block.minHeightMm ?? DEFAULT_BLANK_HEIGHT_MM;
    return (
      <div className={spotlight ? 'quotation-section-hot' : ''}>
        <div className={`relative ${readOnly ? '' : 'quotation-draft-box rounded-md border border-dashed border-slate-400 px-2 py-1'}`} style={{ width: `${block.widthPercent ?? 100}%` }}>
          <div className="flex items-start justify-between gap-2">
            <RichText value={block.name} readOnly={readOnly} className="min-w-0 flex-1 text-[11pt] font-semibold" onChange={(name) => onChange({ ...block, name })} />
            {onSaveSection || onSaveSectionAsNew ? (
              <div className="quotation-edit-only flex shrink-0 gap-1">
                {onSaveSection ? (
                  <button type="button" className="rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveSection}>Save</button>
                ) : null}
                {onSaveSectionAsNew ? (
                  <button type="button" className="rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveSectionAsNew}>Save as new template</button>
                ) : null}
              </div>
            ) : null}
          </div>
          <RichText
            value={block.body}
            readOnly={readOnly}
            allowTable
            className="mt-1 w-full text-[11pt] leading-normal"
            style={{ minHeight: `${blankHeight}mm`, height: 'auto', fontSize: '11pt', lineHeight: 'normal' }}
            onChange={(body) => onChange({ ...block, body })}
          />
          {onBlankResize ? (
            <>
              <span
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize section height"
                title="Drag to change the height"
                className="quotation-edit-only absolute bottom-1 left-1/2 z-30 flex h-3 w-5 -translate-x-1/2 cursor-ns-resize items-end justify-center"
                onPointerDown={(event) => onBlankResize(event, 'height')}
              >
                <span className="h-0.5 w-3 rounded-full bg-slate-400" />
              </span>
              <span
                role="separator"
                aria-label="Resize section"
                title="Drag to change the size"
                className="quotation-edit-only absolute bottom-1 right-0.5 z-30 flex size-3 cursor-nwse-resize items-end justify-end"
                onPointerDown={(event) => onBlankResize(event, 'both')}
              >
                <span className="size-1.5 rounded-[1px] bg-slate-400" />
              </span>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      {block.type === 'closing' ? null : (
        <div className="flex items-start justify-between gap-2">
          <RichText value={block.name} readOnly={readOnly} className="min-w-0 flex-1 font-semibold" onChange={(name) => onChange({ ...block, name })} />
          {block.type === 'scope' && onSaveScope ? (
            <button type="button" className="quotation-edit-only shrink-0 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] leading-tight" onClick={onSaveScope}>Save</button>
          ) : null}
        </div>
      )}
      <RichText value={block.body} readOnly={readOnly} className="mt-1 text-justify" onChange={(body) => onChange({ ...block, body })} />
    </div>
  );
}

export function acceptedOptionId(savedOptions: Array<{ id: string }>, index: number) {
  return savedOptions[index]?.id ?? savedOptions[0]?.id ?? null;
}
