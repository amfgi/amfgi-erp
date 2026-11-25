type HtmlNode =
  | { type: 'text'; value: string }
  | { type: 'el'; name: string; attrs: string; children: HtmlNode[] };

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const DROP_TAGS = new Set(['col', 'colgroup', 'script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'svg', 'noscript', 'canvas', 'video', 'audio', 'form', 'button', 'input', 'textarea', 'select', 'xml']);
const BLOCK_AS_DIV = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'address', 'figure', 'figcaption']);

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&#160;/g, '\u00a0')
    .replace(/&#x0*a0;/gi, '\u00a0')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');
}

function attribute(attrs: string, name: string) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return match ? match[1] ?? match[2] ?? match[3] ?? '' : null;
}

function marks(name: string, attrs: string) {
  const style = attribute(attrs, 'style') ?? '';
  const weightNormal = /font-weight\s*:\s*normal\b/i.test(style);
  const weightBold = /font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style);
  const italicNormal = /font-style\s*:\s*normal\b/i.test(style);
  const italic = /font-style\s*:\s*italic\b/i.test(style);
  const decorationNone = /text-decoration(?:-line)?\s*:\s*none\b/i.test(style);
  const underline = /text-decoration(?:-line)?\s*:\s*[^;]*underline/i.test(style);
  return {
    bold: weightNormal ? false : weightBold || name === 'b' || name === 'strong',
    italic: italicNormal ? false : italic || name === 'i' || name === 'em',
    underline: decorationNone ? false : underline || name === 'u',
  };
}

function wrapMarks(html: string, name: string, attrs: string) {
  if (!html) return '';
  const formatting = marks(name, attrs);
  let out = html;
  if (formatting.underline) out = name === 'u' ? `<u>${html}</u>` : `<u>${out}</u>`;
  if (formatting.italic) out = (name === 'i' || name === 'em') && out === html ? `<${name}>${html}</${name}>` : `<i>${out}</i>`;
  if (formatting.bold) out = (name === 'b' || name === 'strong') && out === html ? `<${name}>${html}</${name}>` : `<b>${out}</b>`;
  return out;
}

function visibleText(html: string) {
  return decodeHtml(html.replace(/<[^>]*>/g, '')).replace(/\u00a0/g, ' ').trim();
}

function styleValue(style: string, name: string) {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return match ? match[1].trim() : null;
}

function lengthInPoints(value: string) {
  const match = /^(-?[\d.]+)(pt|px|in|cm|mm|em|rem)?$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] || 'px').toLowerCase();
  if (unit === 'pt') return amount;
  if (unit === 'px') return (amount * 72) / 96;
  if (unit === 'in') return amount * 72;
  if (unit === 'cm') return (amount * 72) / 2.54;
  if (unit === 'mm') return (amount * 72) / 25.4;
  if (unit === 'em' || unit === 'rem') return amount * 11;
  return null;
}

/** Keep a real paragraph gap. Drop a gap large enough to look like a blank hole. */
function keepGap(value: string | null) {
  if (!value || value === 'auto') return '';
  const points = lengthInPoints(value);
  if (points == null || points <= 0 || points > 36) return '';
  return value.trim();
}

function verticalGap(style: string) {
  const tokens = styleValue(style, 'margin')?.split(/\s+/) ?? [];
  const top = tokens[0] ?? '';
  const bottom = tokens.length <= 2 ? top : tokens[2] ?? '';
  return {
    top: keepGap(styleValue(style, 'margin-top') ?? top),
    bottom: keepGap(styleValue(style, 'margin-bottom') ?? bottom),
  };
}

function keepLineHeight(style: string) {
  const raw = styleValue(style, 'line-height');
  if (!raw || /^normal$/i.test(raw)) return '';
  if (raw.endsWith('%')) {
    const amount = Number.parseFloat(raw);
    return amount >= 80 && amount <= 300 ? raw : '';
  }
  if (/^[\d.]+$/.test(raw)) {
    const amount = Number(raw);
    return amount >= 0.8 && amount <= 3 ? raw : '';
  }
  const points = lengthInPoints(raw);
  return points != null && points >= 8 && points <= 48 ? raw : '';
}

function spacingStyle(attrs: string, block: boolean) {
  const style = attribute(attrs, 'style') ?? '';
  const parts: string[] = [];
  const lineHeight = keepLineHeight(style);
  if (lineHeight) parts.push(`line-height:${lineHeight}`);
  if (block) {
    const gap = verticalGap(style);
    if (gap.top) parts.push(`margin-top:${gap.top}`);
    if (gap.bottom) parts.push(`margin-bottom:${gap.bottom}`);
  }
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

function extractFragment(html: string) {
  const start = html.indexOf('<!--StartFragment-->');
  const end = html.indexOf('<!--EndFragment-->');
  const source = start !== -1 && end > start ? html.slice(start + '<!--StartFragment-->'.length, end) : html;
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function parseFragment(html: string): HtmlNode[] {
  const source = extractFragment(html);
  const root: HtmlNode = { type: 'el', name: 'root', attrs: '', children: [] };
  const stack: HtmlNode[] = [root];
  const pattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (match.index > last) {
      const current = stack[stack.length - 1];
      if (current.type === 'el') current.children.push({ type: 'text', value: source.slice(last, match.index) });
    }
    last = match.index + match[0].length;
    const name = match[2].toLowerCase();
    const attrs = (match[3] ?? '').replace(/\/\s*$/, '');
    if (match[1] === '/') {
      while (stack.length > 1) {
        const top = stack[stack.length - 1];
        stack.pop();
        if (top.type === 'el' && top.name === name) break;
      }
      continue;
    }
    const node: HtmlNode = { type: 'el', name, attrs, children: [] };
    const parent = stack[stack.length - 1];
    if (parent.type === 'el') parent.children.push(node);
    if (!VOID_TAGS.has(name)) stack.push(node);
  }
  if (last < source.length) {
    const current = stack[stack.length - 1];
    if (current.type === 'el') current.children.push({ type: 'text', value: source.slice(last) });
  }
  return root.children;
}

function renderText(value: string, inline: boolean) {
  const decoded = decodeHtml(value);
  if (/^[\t\r\n]*$/.test(decoded)) return '';
  if (!inline && !decoded.replace(/\u00a0/g, ' ').trim()) return '';
  if (!decoded.includes('\n')) return escapeHtml(decoded);
  return decoded
    .split('\n')
    .map((line, index) => `${index ? '<br>' : ''}${escapeHtml(line)}`)
    .join('');
}

function renderChildren(nodes: HtmlNode[], allowTable: boolean, inline: boolean) {
  return nodes.map((node) => renderNode(node, allowTable, inline)).join('');
}

function directRows(table: Extract<HtmlNode, { type: 'el' }>) {
  const rows: Array<Extract<HtmlNode, { type: 'el' }>[]> = [];
  const addRow = (row: HtmlNode) => {
    if (row.type !== 'el') return;
    rows.push(row.children.filter((cell): cell is Extract<HtmlNode, { type: 'el' }> => cell.type === 'el' && (cell.name === 'td' || cell.name === 'th')));
  };
  for (const child of table.children) {
    if (child.type !== 'el') continue;
    if (child.name === 'tr') addRow(child);
    if (child.name === 'thead' || child.name === 'tbody' || child.name === 'tfoot') {
      for (const row of child.children) {
        if (row.type === 'el' && row.name === 'tr') addRow(row);
      }
    }
  }
  return rows;
}

function cellPlain(cell: Extract<HtmlNode, { type: 'el' }>): string {
  const text = decodeHtml(renderChildren(cell.children, false, true).replace(/<br>/g, ' ').replace(/<[^>]*>/g, ''));
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderTable(table: Extract<HtmlNode, { type: 'el' }>, allowTable: boolean) {
  const rows = directRows(table);
  if (!allowTable) {
    return rows
      .map((row) => row.map((cell) => cellPlain(cell)).filter(Boolean).join(' '))
      .filter(Boolean)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
  }
  const count = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!count) return '';
  const share = (100 / count).toFixed(2);
  const columns = `<col style="width:${share}%" />`.repeat(count);
  const body = rows
    .map((row) => {
      const cells = Array.from({ length: count }, (_, index) => {
        const cell = row[index];
        const inner = cell ? renderChildren(cell.children, false, true) : '';
        return `<td>${visibleText(inner) ? inner : '<br>'}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  if (!visibleText(body)) return '';
  return `<table class="quotation-insert"><colgroup>${columns}</colgroup><tbody>${body}</tbody></table>`;
}

function renderNode(node: HtmlNode, allowTable: boolean, inline: boolean): string {
  if (node.type === 'text') return renderText(node.value, inline);
  if (DROP_TAGS.has(node.name)) return '';
  if (node.name === 'br') return '<br>';
  if (node.name === 'img') {
    const alt = attribute(node.attrs, 'alt');
    return alt ? escapeHtml(decodeHtml(alt)) : '';
  }
  if (node.name === 'table') return renderTable(node, allowTable);
  if (node.name === 'ul' || node.name === 'ol') {
    const items = node.children
      .map((child) => {
        const html = renderNode(child, allowTable, false);
        if (!html) return '';
        if (/^<li[\s>]/.test(html)) return html;
        return visibleText(html) ? `<li>${html}</li>` : '';
      })
      .filter(Boolean);
    return items.length ? `<${node.name}>${items.join('')}</${node.name}>` : '';
  }
  const inner = renderChildren(node.children, allowTable, node.name !== 'tr');
  const marked = wrapMarks(inner, node.name, node.attrs);
  if (node.name === 'li') return visibleText(marked) ? `<li${spacingStyle(node.attrs, true)}>${marked}</li>` : '';
  if (node.name === 'p' || node.name === 'div' || BLOCK_AS_DIV.has(node.name)) {
    if (!visibleText(marked)) return '';
    const tag = node.name === 'p' ? 'p' : 'div';
    return `<${tag}${spacingStyle(node.attrs, true)}>${marked}</${tag}>`;
  }
  const lineHeight = spacingStyle(node.attrs, false);
  return lineHeight && marked ? `<span${lineHeight}>${marked}</span>` : marked;
}

/** Clean one clipboard HTML fragment. Does not touch HTML already stored on a quotation. */
export function cleanPastedHtml(value: string, allowTable: boolean) {
  return parseFragment(value).map((node) => renderNode(node, allowTable, false)).join('');
}

/** Plain clipboard text, with each line break kept as a br. */
export function pastedPlainTextHtml(value: string) {
  const text = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.replace(/\u00a0/g, ' ').trim()) return '';
  return escapeHtml(text).replace(/\n/g, '<br>');
}
