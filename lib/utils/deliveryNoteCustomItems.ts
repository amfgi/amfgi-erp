export interface DeliveryNoteCustomItemPrint {
  lineNo: string;
  name: string;
  description: string;
  qty: string;
  unit: string;
}

function lineNoFromRow(o: Record<string, unknown>): string {
  if (typeof o.lineNo === 'string') return o.lineNo;
  if (typeof o.slno === 'string') return o.slno;
  if (o.lineNo != null) return String(o.lineNo);
  if (o.slno != null) return String(o.slno);
  return '';
}

const ITEMS_HEADER = '--- DELIVERY NOTE ITEMS (For Printing) ---';

function collapseForNotesLine(value: string): string {
  return value.replace(/\r?\n+/g, ' ').trim();
}

/** Serialize one custom item for legacy notes bullets (print fallback). */
export function formatDeliveryNoteCustomItemBullet(item: {
  name: string;
  description?: string | null;
  qty?: string | null;
  unit?: string | null;
}): string {
  const name = collapseForNotesLine(item.name ?? '');
  const description = collapseForNotesLine(item.description ?? '');
  const qty = (item.qty ?? '').trim();
  const unit = (item.unit ?? '').trim();
  const left = description ? `${name} - ${description}` : name;
  const right = [qty, unit].filter(Boolean).join(' ');
  return right ? `• ${left} | ${right}` : `• ${left} |`;
}

export function formatDeliveryNoteCustomItemsBlock(
  items: Array<{
    name: string;
    description?: string | null;
    qty?: string | null;
    unit?: string | null;
  }>
): string {
  const lines = items
    .filter((item) => item.name.trim())
    .map((item) => formatDeliveryNoteCustomItemBullet(item));
  if (lines.length === 0) return '';
  return `${ITEMS_HEADER}\n${lines.join('\n')}`;
}

/** Parse one bullet line; supports empty qty/unit after `|`. */
export function parseDeliveryNoteCustomItemBullet(line: string): DeliveryNoteCustomItemPrint | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('•')) return null;
  const rest = trimmed.replace(/^•\s*/, '').trim();
  if (!rest) return null;

  const pipeIdx = rest.indexOf('|');
  if (pipeIdx < 0) {
    return { lineNo: '', name: rest, description: '', qty: '', unit: '' };
  }

  const left = rest.slice(0, pipeIdx).trim();
  const right = rest.slice(pipeIdx + 1).trim();
  let qty = '';
  let unit = '';
  if (right) {
    const parts = right.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      qty = parts[0];
    } else if (parts.length > 1) {
      qty = parts[0];
      unit = parts.slice(1).join(' ');
    }
  }

  const dashIdx = left.indexOf(' - ');
  if (dashIdx >= 0) {
    return {
      lineNo: '',
      name: left.slice(0, dashIdx).trim(),
      description: left.slice(dashIdx + 3).trim(),
      qty,
      unit,
    };
  }

  return { lineNo: '', name: left, description: '', qty, unit };
}

export function parseDeliveryNoteCustomItemsFromNotes(notes?: string | null): DeliveryNoteCustomItemPrint[] {
  if (!notes) return [];
  const match = notes.match(
    /--- DELIVERY NOTE ITEMS \(For Printing\) ---\r?\n([\s\S]*?)(?=\r?\n---|\r?\n$|$)/
  );
  if (!match) return [];

  const items: DeliveryNoteCustomItemPrint[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseDeliveryNoteCustomItemBullet(line);
    if (parsed) items.push(parsed);
  }
  return items;
}

export function customItemsFromJson(json: unknown): DeliveryNoteCustomItemPrint[] {
  if (!Array.isArray(json)) return [];
  const items: DeliveryNoteCustomItemPrint[] = [];
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : String(o.name ?? '');
    const description = typeof o.description === 'string' ? o.description : '';
    if (!name.trim() && !description.trim()) continue;
    items.push({
      lineNo: lineNoFromRow(o),
      name,
      description,
      qty: typeof o.qty === 'string' ? o.qty : String(o.qty ?? ''),
      unit: typeof o.unit === 'string' ? o.unit : String(o.unit ?? ''),
    });
  }
  return items;
}

export function mapCustomItemsForTemplate(
  items: DeliveryNoteCustomItemPrint[]
): Array<DeliveryNoteCustomItemPrint & { slno: string }> {
  return items.map((item, idx) => ({
    ...item,
    slno: item.lineNo.trim() || String(idx + 1),
  }));
}

/** True when every stored line number is empty or matches 1..n (auto sequence). */
export function inferCustomItemsLineNoAuto(items: Array<{ lineNo?: string | null }>): boolean {
  return items.every((item, idx) => {
    const value = (item.lineNo ?? '').trim();
    return !value || value === String(idx + 1);
  });
}

export function resolveCustomItemLineNoForSave(
  item: { lineNo?: string | null },
  index: number,
  auto: boolean
): string | undefined {
  if (auto) return String(index + 1);
  const trimmed = (item.lineNo ?? '').trim();
  return trimmed || undefined;
}
