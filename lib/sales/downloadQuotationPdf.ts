type PdfWritable = {
  write: (data: BufferSource) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

type PdfSaveHandle = {
  createWritable: () => Promise<PdfWritable>;
};

type SavePicker = (options: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<PdfSaveHandle>;

function pdfName(fileName: string) {
  const safe = fileName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Quotation';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function savePicker() {
  return (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
}

function failure(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return new Error('The browser blocked the save. Click Download PDF and choose the file again.');
  }
  if (error instanceof Error && error.message) return error;
  return new Error('Could not save the PDF');
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

async function buildPdf(pages: HTMLElement[]) {
  const { domToJpeg } = await import('modern-screenshot');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage();
    const image = await domToJpeg(pages[index], {
      scale: 2,
      quality: 0.92,
      backgroundColor: '#ffffff',
    });
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
  }
  const output = pdf.output('blob');
  const blob = output instanceof Blob ? output : await output;
  if (!(blob instanceof Blob) || blob.size < 100) throw new Error('Could not build the PDF');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function downloadQuotationPdf(root: HTMLElement, fileName: string): Promise<'saved' | 'cancelled'> {
  const pages = [...root.querySelectorAll<HTMLElement>('.quotation-page')];
  if (!pages.length) throw new Error('The quotation page is not ready');
  const name = pdfName(fileName);
  const picker = savePicker();
  const preview = picker ? null : window.open('', '_blank');
  let writable: PdfWritable | null = null;
  if (picker) {
    try {
      const chosen = await picker({
        suggestedName: name,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      writable = await chosen.createWritable();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw failure(error);
    }
  }

  root.classList.add('quotation-capturing');
  try {
    const bytes = await buildPdf(pages);
    if (writable) {
      await writable.write(bytes);
      await writable.close();
      writable = null;
      return 'saved';
    }
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'saved';
    }
    preview?.close();
    saveBlob(blob, name);
    return 'saved';
  } catch (error) {
    preview?.close();
    if (writable) {
      const closing = writable;
      writable = null;
      await closing.abort().catch(() => undefined);
    }
    throw failure(error);
  } finally {
    root.classList.remove('quotation-capturing');
  }
}
