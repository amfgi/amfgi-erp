function pdfName(fileName: string) {
  const safe = fileName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Quotation';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function failure(error: unknown) {
  if (error instanceof Error && error.message) return error;
  return new Error('Could not download the PDF');
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

async function buildPdf(pages: HTMLElement[]) {
  const { default: html2canvas } = await import('html2canvas-pro');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage();
    const canvas = await html2canvas(pages[index], {
      foreignObjectRendering: false,
      scale: 1.5,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      ignoreElements: (node) => node instanceof Element && hiddenFromPdf(node),
    });
    const image = canvas.toDataURL('image/jpeg', 0.8);
    canvas.width = 0;
    canvas.height = 0;
    if (!image.startsWith('data:image/jpeg')) throw new Error('Could not capture the quotation page');
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
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
    const blob = await buildPdf(pages);
    const response = await fetch(`/api/sales/pdf-download?ticket=${ticket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: blob,
    });
    if (!response.ok) throw new Error('Could not download the PDF');
    return 'saved';
  } catch (error) {
    await cancelDownload(ticket);
    throw failure(error);
  } finally {
    root.classList.remove('quotation-capturing');
  }
}
