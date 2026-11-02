const PAGE_BUDGET_MS = 8_000;
const FILE_BUDGET_MS = 25_000;
const INK_LIMIT = 0.004;

class CaptureTimeoutError extends Error {
  constructor() {
    super('Could not download the PDF');
    this.name = 'CaptureTimeoutError';
  }
}

function pdfName(fileName: string) {
  const safe = fileName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Quotation';
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
  anchor.href = `/api/sales/pdf-download?${new URLSearchParams({ ticket, name, pages: String(pageCount) }).toString()}`;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return ticket;
}

async function cancelDownload(ticket: string) {
  await fetch(`/api/sales/pdf-download?${new URLSearchParams({ ticket, cancel: '1' }).toString()}`, { method: 'POST' }).catch(() => undefined);
}

function hiddenFromPdf(node: Element) {
  return node.classList.contains('quotation-edit-only') || node.classList.contains('quotation-bubble');
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

function jpeg(canvas: HTMLCanvasElement) {
  try {
    const image = canvas.toDataURL('image/jpeg', 0.85);
    return image.startsWith('data:image/jpeg') ? image : '';
  } catch {
    return '';
  }
}

function placeImage(pdf: import('jspdf').jsPDF, image: string, width: number, height: number) {
  const ratio = width / height;
  const pageRatio = 210 / 297;
  if (Math.abs(ratio - pageRatio) <= 0.02) {
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
    return;
  }
  if (ratio > pageRatio) {
    const fittedHeight = 210 / ratio;
    pdf.addImage(image, 'JPEG', 0, (297 - fittedHeight) / 2, 210, fittedHeight);
    return;
  }
  const fittedWidth = 297 * ratio;
  pdf.addImage(image, 'JPEG', (210 - fittedWidth) / 2, 0, fittedWidth, 297);
}

async function rasterize(page: HTMLElement, deadline: number) {
  const { default: html2canvas } = await import('html2canvas-pro');
  return withTimeout(html2canvas(page, {
    foreignObjectRendering: false,
    scale: 1.5,
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
  if (inkScore(canvas) < INK_LIMIT) throw new Error('Could not capture the quotation page');
  return canvas;
}

async function buildPdf(pages: HTMLElement[], fileDeadline: number) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    timeLeft(fileDeadline);
    if (index > 0) pdf.addPage();
    const canvas = await capturePage(pages[index], fileDeadline);
    const image = jpeg(canvas);
    const width = canvas.width;
    const height = canvas.height;
    canvas.width = 0;
    canvas.height = 0;
    if (!image) throw new Error('Could not capture the quotation page');
    placeImage(pdf, image, width, height);
  }
  const output = pdf.output('blob');
  const blob = output instanceof Blob ? output : await output;
  if (!(blob instanceof Blob) || blob.size < 100) throw new Error('Could not build the PDF');
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}

export async function downloadQuotationPdf(root: HTMLElement, fileName: string): Promise<'saved' | 'cancelled'> {
  const pages = [...root.querySelectorAll<HTMLElement>('.quotation-page')];
  if (!pages.length) throw new Error('The quotation page is not ready');
  const ticket = startDownload(pdfName(fileName), pages.length);
  root.classList.add('quotation-capturing');
  try {
    const blob = await buildPdf(pages, Date.now() + FILE_BUDGET_MS);
    const response = await withTimeout(fetch(`/api/sales/pdf-download?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: blob,
    }), 8_000);
    if (!response.ok) throw new Error('Could not download the PDF');
    return 'saved';
  } catch (error) {
    await cancelDownload(ticket);
    throw failure(error);
  } finally {
    root.classList.remove('quotation-capturing');
  }
}
