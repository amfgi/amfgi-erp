import {
  buildDispatchNotePrintUrl,
  prefersPrintWindow,
  type DispatchNotePrintParams,
} from '@/lib/print/printEnvironment';

export const DISPATCH_NOTE_PRINT_DONE = 'dispatch-note-print-finished';
export const DISPATCH_NOTE_PRINT_ERROR = 'dispatch-note-print-error';

export type { DispatchNotePrintParams };

type OpenDispatchNotePrintOptions = {
  onError?: (message: string) => void;
};

/** Open the system print dialog for a dispatch entry without leaving the current page. */
export function openDispatchNotePrint(
  params: DispatchNotePrintParams,
  options?: OpenDispatchNotePrintOptions
): void {
  if (params.transactionIds.length === 0) {
    options?.onError?.('No transactions to print');
    return;
  }

  if (prefersPrintWindow()) {
    const url = buildDispatchNotePrintUrl(params);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(url);
    }
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'Dispatch note print';
  iframe.style.cssText =
    'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('message', onMessage);
    iframe.remove();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; message?: string } | null;
    if (!data || typeof data !== 'object') return;
    if (data.type === DISPATCH_NOTE_PRINT_DONE) {
      cleanup();
      return;
    }
    if (data.type === DISPATCH_NOTE_PRINT_ERROR) {
      options?.onError?.(data.message || 'Failed to print dispatch note');
      cleanup();
    }
  };

  window.addEventListener('message', onMessage);
  window.setTimeout(cleanup, 5 * 60 * 1000);

  iframe.src = buildDispatchNotePrintUrl(params, { embed: true });
  document.body.appendChild(iframe);
}
