export const DEFAULT_TRN = '100364593200003';
export const DEFAULT_PAD_URL = '/sales/almuraqib-pad.jpg';

export type RichText = string;

export type LabelRow = { id: string; label: RichText; value: RichText };

export type PriceColumn = { id: string; name: string };

export type PriceRow = {
  id: string;
  item: RichText;
  description: RichText;
  unitPrice: string;
  quantity: string;
  extras?: Record<string, RichText>;
};

export type SignatureBlock = {
  name: string;
  phone: string;
  title: string;
  email: string;
};

export type QuotationBlock =
  | { id: string; type: 'terms'; name: string; rows: LabelRow[] }
  | { id: string; type: 'scope'; name: string; body: RichText }
  | { id: string; type: 'specification'; name: string; rows: LabelRow[] }
  | { id: string; type: 'blank'; name: string; body: RichText; minHeightMm?: number; widthPercent?: number }
  | { id: string; type: 'option'; name: string; titleCustomized: boolean; columns?: PriceColumn[]; widths?: Record<string, number>; rows: PriceRow[] }
  | { id: string; type: 'closing'; name: string; body: RichText }
  | { id: string; type: 'signatures'; name: string; left: SignatureBlock; right: SignatureBlock };

export type QuotationCustomer = {
  name: string;
  city: string;
  tel: string;
  fax: string;
  contactName: string;
  contactNumber: string;
  email: string;
};

export type QuotationDocument = {
  trn: string;
  date: string;
  customer: QuotationCustomer;
  quoteTitle: string;
  totalCostWords: string;
  project: string;
  includesLine: string;
  /** Saved download name. Empty until the user types one. */
  fileName?: string;
  fileNameCustomized?: boolean;
  blocks: QuotationBlock[];
};

export type QuotationOptionInput = {
  name: string;
  vatAmount: number;
  lines: Array<{ item: string; description: string | null; unitPrice: number; quantity: number; fields: [] }>;
};

const PRESET_TYPES = new Set(['terms', 'scope', 'specification']);

function id() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`;
}

function row(label: string, value: string): LabelRow {
  return { id: id(), label, value };
}

export function plainText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeRichText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<(?!\/?(b|strong|i|em|u|span|font|br|p|div|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|colgroup|col)\b)[^>]*>/gi, '');
}

function moneyWordsUnderThousand(value: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (value < 20) return ones[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`.trim();
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${moneyWordsUnderThousand(value % 100)}` : ''}`.trim();
}

export function amountInWords(amount: number) {
  const dirhams = Math.round(amount);
  if (!Number.isFinite(dirhams) || dirhams <= 0) return '';
  const millions = Math.floor(dirhams / 1_000_000);
  const thousands = Math.floor((dirhams % 1_000_000) / 1000);
  const rest = dirhams % 1000;
  const parts = [
    millions ? `${moneyWordsUnderThousand(millions)} Million` : '',
    thousands ? `${moneyWordsUnderThousand(thousands)} Thousand` : '',
    rest ? moneyWordsUnderThousand(rest) : '',
  ].filter(Boolean);
  return `${parts.join(' ')} Dirhams Only.`;
}

export function defaultTerms(): QuotationBlock {
  return {
    id: id(),
    type: 'terms',
    name: 'Terms & Conditions',
    rows: [
      row('VAT', 'Value in quotation is VAT Excluded. 5% VAT will be included with invoice.'),
      row('Warranty', '10 years. (Hot Press Tanks); 5 Years (Cold Press Tanks)'),
      row('Delivery period', 'As Discussed.'),
      row('Delivery location', 'at your site.'),
      row('Materials Offloading', 'Materials offloading, Electricity, Scaffolding, Crane and Fire & Safety should be provided by the main contractor.'),
    ],
  };
}

export function defaultScope(): QuotationBlock {
  return {
    id: id(),
    type: 'scope',
    name: 'Not in our scope',
    body: 'Concrete foundation, Valve Chambers, U Valves, Gate valves and other valves, float switches, any other fittings not specified, electricity for the installation work & water for testing & Commissioning and crane facility if required.',
  };
}

export function defaultSpecification(): QuotationBlock {
  return {
    id: id(),
    type: 'specification',
    name: 'Specification & Note',
    rows: [
      row('Panel Type', 'Insulated & Non-Insulated'),
      row('Assy Bolt', 'Internal SS 316 and External SS 304.'),
      row('Accessories', 'Internal SS 316 and External SS 304.'),
      row('Ladder', 'Internal (GRP) & External (HDG) (1.5m above tank only).'),
      row('Manhole', 'Lockable.'),
      row('Steel skid', 'Not-Included.'),
      row('Air-vents', 'Not-Included.'),
      row('Water Level Indicator', 'Not-Included.'),
      row('Nozzles', 'Not Included.'),
      row('Terms of price', 'For UAE.'),
      row('Supply Due Date', 'As per the site requirement.'),
      row('Validity', '15 days from quote date.'),
      row('Payment Terms', '50% advance with order confirmation along with LPO CDC, 40% upon materials delivery at site CDC & balance 10% after completion CDC. NO RETENTION.'),
      row('Country of Origin', ''),
      row('Roof support', ''),
    ],
  };
}

export function optionHeading(index: number) {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Option ${letters}`;
}

export function emptyPriceRow(columns: PriceColumn[] = []): PriceRow {
  return {
    id: id(),
    item: '',
    description: '',
    unitPrice: '',
    quantity: '1',
    extras: Object.fromEntries(columns.map((column) => [column.id, ''])),
  };
}

export function defaultOption(): QuotationBlock {
  return {
    id: id(),
    type: 'option',
    name: optionHeading(0),
    titleCustomized: false,
    columns: [],
    rows: [emptyPriceRow()],
  };
}

export function defaultBlank(): QuotationBlock {
  return { id: id(), type: 'blank', name: 'Description', body: '', minHeightMm: 36, widthPercent: 100 };
}

export function quotationFileName(document: Pick<QuotationDocument, 'fileName' | 'fileNameCustomized' | 'customer'>, quotationNumber: string) {
  const custom = (document.fileName ?? '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (document.fileNameCustomized && custom) return custom.slice(0, 160);
  const customer = plainText(document.customer?.name).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return [quotationNumber.trim(), customer].filter(Boolean).join(' ').slice(0, 160) || 'Quotation';
}

function defaultClosing(): QuotationBlock {
  return {
    id: id(),
    type: 'closing',
    name: 'Closing',
    body: 'Please feel free to get in touch with me about any of the specifics of this quotation. We believe that you will find our offer as quite attractive and cost effective to your needs. In case you require any further clarifications or details please do feel free to contact us. Looking forward to receive your valuable order. Thanking you and assuring of our best services.',
  };
}

function defaultSignatures(): QuotationBlock {
  return {
    id: id(),
    type: 'signatures',
    name: 'AL MURAQIB FIBER GLASS INDUSTRY LLC.',
    left: { name: 'M. N. Amin', phone: '05 4400 9905', title: 'Head of Sales', email: 'amin@almuraqib.ae' },
    right: { name: 'Kamrul Hasan', phone: '05 4400 9929', title: 'Managing Director', email: 'kamrul@almuraqib.ae' },
  };
}

export function emptyQuotationDocument(input?: {
  customerName?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  address?: string | null;
  project?: string | null;
  quoteTitle?: string | null;
  date?: string | null;
}): QuotationDocument {
  return {
    trn: DEFAULT_TRN,
    date: input?.date || new Date().toISOString().slice(0, 10),
    customer: {
      name: input?.customerName?.trim() || '',
      city: input?.address?.trim() || '',
      tel: input?.phone?.trim() || '',
      fax: '',
      contactName: input?.contactPerson?.trim() || '',
      contactNumber: '',
      email: input?.email?.trim() || '',
    },
    quoteTitle: input?.quoteTitle?.trim() || '',
    totalCostWords: '',
    project: input?.project?.trim() || '',
    includesLine: 'THIS QUOTATION INCLUDES SUPPLY AND INSTALLATION OF GRP PANEL TYPE WATER TANKS.',
    blocks: [defaultOption(), defaultTerms(), defaultScope(), defaultSpecification(), defaultClosing(), defaultSignatures()],
  };
}

export function isQuotationDocument(value: unknown): value is QuotationDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<QuotationDocument>;
  return typeof record.trn === 'string' && Array.isArray(record.blocks) && !!record.customer;
}

export function readQuotationDocument(value: unknown): QuotationDocument | null {
  if (!isQuotationDocument(value)) return null;
  return sanitizeDocument(value);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

const DEFAULT_PRICE_WIDTH: Record<string, number> = {
  sl: 8,
  item: 20,
  description: 26,
  unitPrice: 14,
  quantity: 12,
  total: 20,
};

export function priceColumnWidths(block: Extract<QuotationBlock, { type: 'option' }>) {
  const columns = (block.columns ?? []).slice(0, 2);
  const keys = ['sl', 'item', 'description', ...columns.map((column) => column.id), 'unitPrice', 'quantity', 'total'];
  const stored = block.widths ?? {};
  const values = keys.map((key) => {
    const number = Number(stored[key]);
    return Number.isFinite(number) && number >= 6 ? number : DEFAULT_PRICE_WIDTH[key] ?? 12;
  });
  const sum = values.reduce((total, value) => total + value, 0) || 1;
  return Object.fromEntries(keys.map((key, index) => [key, (values[index] / sum) * 100]));
}

function sanitizePriceWidths(widths: Record<string, number> | undefined, columnIds: string[]) {
  if (!widths || typeof widths !== 'object') return undefined;
  const allowed = new Set(['sl', 'item', 'description', 'unitPrice', 'quantity', 'total', ...columnIds]);
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(widths)) {
    if (!allowed.has(key)) continue;
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    next[key] = Math.min(70, Math.max(6, Math.round(number)));
  }
  return Object.keys(next).length ? next : undefined;
}

function sanitizePriceColumns(columns: PriceColumn[] | undefined): PriceColumn[] {
  if (!Array.isArray(columns)) return [];
  const seen = new Set<string>();
  const next: PriceColumn[] = [];
  for (const column of columns) {
    const columnId = String(column?.id ?? '').slice(0, 40);
    if (!columnId || seen.has(columnId)) continue;
    seen.add(columnId);
    next.push({ id: columnId, name: plainText(column?.name).slice(0, 40) || 'Column' });
    if (next.length === 2) break;
  }
  return next;
}

export function sanitizeDocument(document: QuotationDocument): QuotationDocument {
  return {
    ...document,
    trn: document.trn.slice(0, 40),
    date: document.date.slice(0, 10),
    quoteTitle: sanitizeRichText(document.quoteTitle),
    totalCostWords: sanitizeRichText(document.totalCostWords),
    project: sanitizeRichText(document.project),
    includesLine: sanitizeRichText(document.includesLine),
    fileName: String(document.fileName ?? '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
    fileNameCustomized: Boolean(document.fileNameCustomized),
    customer: {
      name: document.customer.name.slice(0, 200),
      city: document.customer.city.slice(0, 200),
      tel: document.customer.tel.slice(0, 80),
      fax: document.customer.fax.slice(0, 80),
      contactName: document.customer.contactName.slice(0, 120),
      contactNumber: document.customer.contactNumber.slice(0, 80),
      email: document.customer.email.slice(0, 160),
    },
    blocks: document.blocks.filter((block) => (
      block.type === 'terms' || block.type === 'scope' || block.type === 'specification' || block.type === 'blank' || block.type === 'option' || block.type === 'closing' || block.type === 'signatures'
    )).map((block) => {
      if (block.type === 'terms' || block.type === 'specification') {
        return { ...block, name: block.name.slice(0, 120), rows: block.rows.map((entry) => ({ ...entry, label: sanitizeRichText(entry.label), value: sanitizeRichText(entry.value) })) };
      }
      if (block.type === 'option') {
        const columns = sanitizePriceColumns(block.columns);
        return {
          ...block,
          name: block.name.slice(0, 160),
          columns,
          widths: sanitizePriceWidths(block.widths, columns.map((column) => column.id)),
          rows: block.rows.map((entry) => ({
            ...entry,
            item: sanitizeRichText(entry.item),
            description: sanitizeRichText(entry.description),
            unitPrice: String(entry.unitPrice ?? '').slice(0, 20),
            quantity: String(entry.quantity ?? '').slice(0, 20),
            extras: Object.fromEntries(columns.map((column) => [column.id, sanitizeRichText(entry.extras?.[column.id])])),
          })),
        };
      }
      if (block.type === 'signatures') {
        return block;
      }
      return {
        ...block,
        name: block.name.slice(0, 120),
        body: sanitizeRichText(block.body),
        ...(block.type === 'blank'
          ? {
              minHeightMm: clampNumber(block.minHeightMm, 24, 160, 36),
              widthPercent: clampNumber(block.widthPercent, 45, 100, 100),
            }
          : {}),
      };
    }),
  };
}

export function optionBlocks(document: QuotationDocument) {
  return document.blocks.filter((block): block is Extract<QuotationBlock, { type: 'option' }> => block.type === 'option');
}

export function lineAmount(row: PriceRow) {
  const amount = Number(row.unitPrice || 0) * Number(row.quantity || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function optionTotal(block: Extract<QuotationBlock, { type: 'option' }>) {
  return block.rows.reduce((sum, row) => sum + lineAmount(row), 0);
}

export function syncTotalCostWords(document: QuotationDocument): QuotationDocument {
  const options = optionBlocks(document);
  if (options.length !== 1) return document;
  if (plainText(document.totalCostWords)) return document;
  return { ...document, totalCostWords: amountInWords(optionTotal(options[0])) };
}

export function optionsFromDocument(document: QuotationDocument): QuotationOptionInput[] {
  return optionBlocks(document).map((block, index) => ({
    name: plainText(block.name).slice(0, 120) || `Option ${index + 1}`,
    vatAmount: 0,
    lines: block.rows.flatMap((row) => {
      const unitPrice = Number(row.unitPrice);
      const quantity = Number(row.quantity);
      const item = plainText(row.item).slice(0, 200);
      const description = plainText(row.description).slice(0, 2000);
      const price = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
      const qty = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
      if (!item && !description && price <= 0 && qty <= 0) return [];
      return [{
        item: item || description.slice(0, 200) || 'Item',
        description: description || null,
        unitPrice: price,
        quantity: qty,
        fields: [] as [],
      }];
    }),
  }));
}

export function presetAlreadyUsed(document: QuotationDocument, type: 'terms' | 'scope' | 'specification') {
  return document.blocks.some((block) => block.type === type);
}

const FOOTER_TYPES = new Set(['closing', 'signatures']);

function contentEnd(blocks: QuotationBlock[]) {
  let index = blocks.length;
  while (index > 0 && FOOTER_TYPES.has(blocks[index - 1].type)) index -= 1;
  return index;
}

function assignOptionNames(document: QuotationDocument): QuotationDocument {
  let index = 0;
  return {
    ...document,
    blocks: document.blocks.map((block) => {
      if (block.type !== 'option') return block;
      const name = optionHeading(index);
      index += 1;
      if (block.titleCustomized) return block;
      return name === block.name ? block : { ...block, name };
    }),
  };
}

function optionInsertIndex(blocks: QuotationBlock[]) {
  const first = blocks.findIndex((entry) => entry.type === 'option');
  if (first < 0) return 0;
  let end = first + 1;
  while (end < blocks.length && blocks[end].type === 'option') end += 1;
  return end;
}

export function applySavedTerms(document: QuotationDocument, rows: Array<{ label: string; value: string }>): QuotationDocument {
  const nextRows = rows.map((entry) => row(entry.label, entry.value));
  const existing = document.blocks.find((block) => block.type === 'terms');
  if (existing && existing.type === 'terms') {
    return {
      ...document,
      blocks: document.blocks.map((block) => (block.type === 'terms' ? { ...block, rows: nextRows } : block)),
    };
  }
  return insertBlock(document, { id: id(), type: 'terms', name: 'Terms & Conditions', rows: nextRows });
}

export function insertBlock(document: QuotationDocument, block: QuotationBlock): QuotationDocument {
  if (PRESET_TYPES.has(block.type) && document.blocks.some((entry) => entry.type === block.type)) return document;
  const blocks = [...document.blocks];
  const at = block.type === 'option' ? optionInsertIndex(blocks) : contentEnd(blocks);
  blocks.splice(at, 0, block);
  const next = syncTotalCostWords({ ...document, blocks });
  return block.type === 'option' ? assignOptionNames(next) : next;
}

export function moveBlock(document: QuotationDocument, blockId: string, direction: -1 | 1): QuotationDocument {
  const index = document.blocks.findIndex((block) => block.id === blockId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= document.blocks.length) return document;
  const movingFooter = FOOTER_TYPES.has(document.blocks[index].type);
  const targetFooter = FOOTER_TYPES.has(document.blocks[next].type);
  if (movingFooter !== targetFooter) return document;
  const blocks = [...document.blocks];
  const [block] = blocks.splice(index, 1);
  blocks.splice(next, 0, block);
  return { ...document, blocks };
}

export function removeBlock(document: QuotationDocument, blockId: string): QuotationDocument {
  const removed = document.blocks.find((block) => block.id === blockId);
  const next = syncTotalCostWords({ ...document, blocks: document.blocks.filter((block) => block.id !== blockId) });
  return removed?.type === 'option' ? assignOptionNames(next) : next;
}

export function visibleRows<T extends { value: RichText }>(rows: T[], printing: boolean) {
  if (!printing) return rows;
  return rows.filter((row) => plainText(row.value));
}

export function showOptionTitle(block: Extract<QuotationBlock, { type: 'option' }>, optionCount: number) {
  return optionCount > 1 || block.titleCustomized;
}

type HydrateSource = {
  quotationDocument?: unknown;
  quotationIssuedAt?: string | null;
  projectLocation?: string | null;
  projectDescription?: string | null;
  customer?: { name?: string | null; phone?: string | null; contactPerson?: string | null; email?: string | null; address?: string | null } | null;
  customerName?: string | null;
  options?: Array<{
    name: string;
    lines: Array<{ item: string; description?: string | null; unitPrice: number | string; quantity: number | string }>;
  }>;
};

export function documentFromRecord(source: HydrateSource): QuotationDocument {
  const saved = readQuotationDocument(source.quotationDocument);
  if (saved) return saved;
  const base = emptyQuotationDocument({
    customerName: source.customer?.name || source.customerName,
    phone: source.customer?.phone,
    contactPerson: source.customer?.contactPerson,
    email: source.customer?.email,
    address: source.customer?.address,
    project: source.projectLocation,
    quoteTitle: source.projectDescription,
    date: source.quotationIssuedAt ? String(source.quotationIssuedAt).slice(0, 10) : undefined,
  });
  if (!source.options?.length) return base;
  const options: QuotationBlock[] = source.options.map((option) => ({
    id: id(),
    type: 'option' as const,
    name: option.name || 'Price option',
    titleCustomized: source.options!.length > 1,
    rows: option.lines.length
      ? option.lines.map((line) => ({
          id: id(),
          item: line.item,
          description: line.description ?? '',
          unitPrice: String(line.unitPrice ?? ''),
          quantity: String(line.quantity ?? ''),
        }))
      : [emptyPriceRow()],
  }));
  return {
    ...base,
    blocks: [...options, ...base.blocks.filter((block) => block.type !== 'option')],
  };
}

export function padImageUrl(letterheadUrl?: string | null) {
  if (letterheadUrl && /\.(png|jpe?g|webp)(\?|$)/i.test(letterheadUrl)) return letterheadUrl;
  return DEFAULT_PAD_URL;
}
