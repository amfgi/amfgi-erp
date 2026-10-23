type Waiter = {
  userId: string;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  bytes: Uint8Array | null;
  failed: boolean;
  timer: ReturnType<typeof setTimeout>;
};

const TICKET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 80_000_000;
const MIN_LIFETIME_MS = 15_000;
const MAX_LIFETIME_MS = 10 * 60_000;

export function ticketLifetime(pageCount: number) {
  const pages = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 1;
  return Math.min(MAX_LIFETIME_MS, Math.max(120_000, pages * MIN_LIFETIME_MS));
}

function store() {
  const globalStore = globalThis as typeof globalThis & { __quotationPdfDownloads?: Map<string, Waiter> };
  return globalStore.__quotationPdfDownloads ?? (globalStore.__quotationPdfDownloads = new Map());
}

export function validPdfTicket(ticket: string) {
  return TICKET.test(ticket);
}

function slot(ticket: string, userId: string, pageCount = 1) {
  const downloads = store();
  const existing = downloads.get(ticket);
  if (existing) {
    if (existing.userId !== userId) return null;
    return existing;
  }
  const created: Waiter = {
    userId,
    controller: null,
    bytes: null,
    failed: false,
    timer: setTimeout(() => downloads.delete(ticket), ticketLifetime(pageCount)),
  };
  downloads.set(ticket, created);
  return created;
}

function close(waiter: Waiter) {
  try {
    waiter.controller?.close();
  } catch {
    // The browser already finished the download.
  }
  waiter.controller = null;
}

export function beginPdfDownload(ticket: string, userId: string, pageCount = 1) {
  const waiter = slot(ticket, userId, pageCount);
  if (!waiter) return null;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      waiter.controller = controller;
      if (waiter.bytes) {
        controller.enqueue(waiter.bytes);
        waiter.bytes = null;
        close(waiter);
        return;
      }
      if (waiter.failed) close(waiter);
    },
  });
}

export function deliverPdfDownload(ticket: string, userId: string, bytes: Uint8Array) {
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_BYTES) return false;
  if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return false;
  const waiter = slot(ticket, userId);
  if (!waiter || waiter.failed) return false;
  if (waiter.controller) {
    waiter.controller.enqueue(bytes);
    close(waiter);
    return true;
  }
  waiter.bytes = bytes;
  return true;
}

export function cancelPdfDownload(ticket: string, userId: string) {
  const waiter = store().get(ticket);
  if (!waiter || waiter.userId !== userId) return;
  waiter.failed = true;
  waiter.bytes = null;
  close(waiter);
}
