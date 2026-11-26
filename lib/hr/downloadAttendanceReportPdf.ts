const PAGE_BUDGET_MS = 15_000;
const FILE_BUDGET_MS = 45_000;
const INK_LIMIT = 0.004;
const CAPTURE_SCALE = 3;

class CaptureTimeoutError extends Error {
  constructor() {
    super('Could not download the PDF');
    this.name = 'CaptureTimeoutError';
  }
}

function pdfName(fileName: string) {
  const safe = fileName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Employee report';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function failure(error: unknown) {
  if (error instanceof CaptureTimeoutError) return error;
  if (error instanceof Error && error.message) return error;
  return new Error('Could not download the PDF');
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CaptureTimeoutError()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function timeLeft(deadline: number) {
  const left = deadline - Date.now();
  if (left <= 0) throw new CaptureTimeoutError();
  return left;
}

function startDownload(name: string, pageCount: number) {
  const ticket = crypto.randomUUID();
  const anchor = document.createElement('a');
  anchor.href = `/api/hr/pdf-download?${new URLSearchParams({ ticket, name, pages: String(pageCount) }).toString()}`;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return ticket;
}

async function cancelDownload(ticket: string) {
  await fetch(`/api/hr/pdf-download?${new URLSearchParams({ ticket, cancel: '1' }).toString()}`, { method: 'POST' }).catch(() => undefined);
}

function hiddenFromPdf(node: Element) {
  return node.classList.contains('attendance-report-edit-only');
}

function inkScore(canvas: HTMLCanvasElement) {
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width < 2 || canvas.height < 2) return 0;
    const step = Math.max(12, Math.floor(Math.min(canvas.width, canvas.height) / 30));
    let ink = 0;
    let seen = 0;
    for (let y = step; y < canvas.height; y += step) {
      const row = context.getImageData(0, y, canvas.width, 1).data;
      for (let x = 0; x < canvas.width; x += step) {
        const index = x * 4;
        seen += 1;
        if (row[index] < 248 || row[index + 1] < 248 || row[index + 2] < 248) ink += 1;
      }
    }
    return seen ? ink / seen : 0;
  } catch {
    return 0;
  }
}

function pageImage(canvas: HTMLCanvasElement) {
  try {
    const image = canvas.toDataURL('image/png');
    return image.startsWith('data:image/png') ? image : '';
  } catch {
    return '';
  }
}

function placeImage(pdf: import('jspdf').jsPDF, image: string, width: number, height: number) {
  const ratio = width / height;
  const pageRatio = 210 / 297;
  if (Math.abs(ratio - pageRatio) <= 0.02) {
    pdf.addImage(image, 'PNG', 0, 0, 210, 297);
    return;
  }
  if (ratio > pageRatio) {
    const fittedHeight = 210 / ratio;
    pdf.addImage(image, 'PNG', 0, (297 - fittedHeight) / 2, 210, fittedHeight);
    return;
  }
  const fittedWidth = 297 * ratio;
  pdf.addImage(image, 'PNG', (210 - fittedWidth) / 2, 0, fittedWidth, 297);
}

async function rasterize(page: HTMLElement, deadline: number) {
  const { default: html2canvas } = await import('html2canvas-pro');
  return withTimeout(html2canvas(page, {
    foreignObjectRendering: false,
    scale: CAPTURE_SCALE,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
    ignoreElements: (node) => node instanceof Element && hiddenFromPdf(node),
  }), timeLeft(deadline));
}

async function capturePage(page: HTMLElement, fileDeadline: number) {
  const deadline = Math.min(fileDeadline, Date.now() + PAGE_BUDGET_MS);
  let canvas = await rasterize(page, deadline);
  if (inkScore(canvas) >= INK_LIMIT) return canvas;
  const retryDeadline = Math.min(fileDeadline, Date.now() + PAGE_BUDGET_MS);
  canvas = await rasterize(page, retryDeadline);
  if (inkScore(canvas) < INK_LIMIT) throw new Error('Could not capture the report page');
  return canvas;
}

async function buildPdf(pages: HTMLElement[], fileDeadline: number) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    timeLeft(fileDeadline);
    if (index > 0) pdf.addPage();
    const canvas = await capturePage(pages[index], fileDeadline);
    const image = pageImage(canvas);
    const width = canvas.width;
    const height = canvas.height;
    canvas.width = 0;
    canvas.height = 0;
    if (!image) throw new Error('Could not capture the report page');
    placeImage(pdf, image, width, height);
  }
  const output = pdf.output('blob');
  const blob = output instanceof Blob ? output : await output;
  if (!(blob instanceof Blob) || blob.size < 100) throw new Error('Could not build the PDF');
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}

function overflows(page: HTMLElement) {
  return page.scrollHeight > page.clientHeight + 1;
}

function flowOf(page: HTMLElement) {
  return page.firstElementChild as HTMLElement;
}

function makePage() {
  const page = document.createElement('article');
  page.className = 'attendance-report-page';
  page.style.cssText = 'width:210mm;height:297mm;box-sizing:border-box;padding:8mm;overflow:hidden;background:#ffffff;color:#1F2937;font-family:Calibri,"Segoe UI",sans-serif;';
  const flow = document.createElement('div');
  flow.className = 'attendance-report-sheet';
  flow.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  page.appendChild(flow);
  return page;
}

function isSpacer(node: HTMLElement) {
  return node.tagName === 'DIV' && node.childElementCount === 0 && !(node.textContent || '').trim();
}

function collectUnits(sheet: HTMLElement) {
  const root = [...sheet.children].find((node) => node instanceof HTMLElement && node.tagName !== 'STYLE');
  if (!(root instanceof HTMLElement)) return [];
  const children = [...root.children].filter((node): node is HTMLElement => node instanceof HTMLElement);
  const units: HTMLElement[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (node.classList.contains('attendance-report-appendix')) {
      const inner = node.firstElementChild instanceof HTMLElement ? node.firstElementChild : node;
      for (const part of [...inner.children]) {
        if (!(part instanceof HTMLElement)) continue;
        const wrap = document.createElement('div');
        wrap.className = 'attendance-report-appendix';
        wrap.appendChild(part.cloneNode(true));
        units.push(wrap);
      }
      continue;
    }
    const next = children[index + 1];
    if (next && next.tagName === 'TABLE' && (node.tagName === 'P' || isSpacer(node))) {
      const wrap = document.createElement('div');
      wrap.append(node.cloneNode(true), next.cloneNode(true));
      units.push(wrap);
      index += 1;
      continue;
    }
    if (isSpacer(node)) continue;
    units.push(node.cloneNode(true) as HTMLElement);
  }
  return units;
}

function continuation(unit: HTMLElement) {
  const shell = unit.cloneNode(true) as HTMLElement;
  const copy = shell.querySelector('table');
  if (!copy) return shell;
  const heading = shell.querySelector('h3, p');
  const walk = (parent: Element) => {
    for (const child of [...parent.children]) {
      if (child === copy || child.contains(copy)) {
        if (child !== copy) walk(child);
        continue;
      }
      if (heading && (child === heading || child.contains(heading))) {
        if (child !== heading) walk(child);
        continue;
      }
      child.remove();
    }
  };
  walk(shell);
  copy.querySelectorAll('tbody').forEach((body) => {
    body.replaceChildren();
  });
  if (!copy.tBodies.length) copy.createTBody();
  return shell;
}

function placeRows(host: HTMLElement, pages: HTMLElement[], template: HTMLElement, rows: HTMLTableRowElement[], start: number) {
  let index = start;
  let guard = 0;
  while (index < rows.length && pages.length < 40 && guard < 40) {
    guard += 1;
    const before = index;
    const page = makePage();
    host.appendChild(page);
    pages.push(page);
    const shell = template.cloneNode(true) as HTMLElement;
    flowOf(page).appendChild(shell);
    const body = shell.querySelector('tbody');
    if (!body) break;
    while (index < rows.length) {
      body.appendChild(rows[index]);
      if (overflows(page) && body.rows.length > 1) {
        body.removeChild(rows[index]);
        break;
      }
      index += 1;
      if (overflows(page)) break;
    }
    if (index === before) break;
  }
  return pages[pages.length - 1];
}

function splitUnit(host: HTMLElement, pages: HTMLElement[], page: HTMLElement, unit: HTMLElement) {
  const table = unit.querySelector('table');
  const body = table?.tBodies[0];
  if (!table || !body || body.rows.length === 0) return page;
  const rows = [...body.rows];
  const template = continuation(unit);
  for (const row of rows) row.remove();
  if (overflows(page)) {
    table.remove();
    return placeRows(host, pages, template, rows, 0);
  }
  let index = 0;
  while (index < rows.length) {
    body.appendChild(rows[index]);
    if (overflows(page)) {
      body.removeChild(rows[index]);
      break;
    }
    index += 1;
  }
  if (index === 0) {
    body.appendChild(rows[0]);
    index = 1;
  }
  if (index >= rows.length) return page;
  return placeRows(host, pages, template, rows, index);
}

function placeUnit(host: HTMLElement, pages: HTMLElement[], page: HTMLElement, unit: HTMLElement) {
  const flow = flowOf(page);
  flow.appendChild(unit);
  if (!overflows(page)) return page;
  if (flow.childElementCount > 1) {
    flow.removeChild(unit);
    const next = makePage();
    host.appendChild(next);
    pages.push(next);
    return placeUnit(host, pages, next, unit);
  }
  return splitUnit(host, pages, page, unit);
}

function layoutPages(sheet: HTMLElement) {
  const host = document.createElement('div');
  host.setAttribute('data-attendance-pdf-pages', '');
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;';
  document.body.appendChild(host);
  const pages: HTMLElement[] = [];
  const first = makePage();
  host.appendChild(first);
  pages.push(first);
  let page = first;
  for (const unit of collectUnits(sheet)) {
    page = placeUnit(host, pages, page, unit);
  }
  return host;
}

export async function downloadAttendanceReportPdf(sheet: HTMLElement, fileName: string): Promise<'saved'> {
  const name = pdfName(fileName);
  const host = layoutPages(sheet);
  const pages = [...host.querySelectorAll('article')].filter((node): node is HTMLElement => node instanceof HTMLElement);
  let ticket = '';
  try {
    if (!pages.length) throw new Error('The report page is not ready');
    ticket = startDownload(name, pages.length);
    const blob = await buildPdf(pages, Date.now() + FILE_BUDGET_MS);
    const response = await withTimeout(fetch(`/api/hr/pdf-download?ticket=${encodeURIComponent(ticket)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: blob,
    }), 8_000);
    if (!response.ok) throw new Error('Could not download the PDF');
    return 'saved';
  } catch (error) {
    if (ticket) await cancelDownload(ticket);
    throw failure(error);
  } finally {
    host.remove();
  }
}
