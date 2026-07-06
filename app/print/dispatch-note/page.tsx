'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { DocumentRenderer } from '@/components/print-builder/DocumentRenderer';
import { readCompanyDocumentTemplates } from '@/lib/utils/companyPrintTemplates';
import { buildDataContext } from '@/lib/utils/templateData';
import { DEFAULT_DISPATCH_NOTE } from '@/lib/utils/documentDefaults';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';
import { filterTemplatesForDispatchNotePrint } from '@/lib/utils/printItemTypes';
import {
  DISPATCH_NOTE_PRINT_DONE,
  DISPATCH_NOTE_PRINT_ERROR,
} from '@/lib/print/openDispatchNotePrint';
import { prefersPrintWindow } from '@/lib/print/printEnvironment';

interface Transaction {
  id: string;
  companyId: string;
  type: string;
  isDeliveryNote?: boolean;
  notes?: string;
  date: string;
  totalCost: number;
  quantity: number;
  material?: { name: string; unit: string; unitCost: number };
  warehouse?: { id: string; name: string } | null;
  job?: Record<string, unknown> | null;
  performedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    signatureUrl?: string | null;
  } | null;
}

interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  letterheadUrl?: string;
  printTemplates?: unknown[] | null;
}

export default function PrintDispatchNotePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const idsParam = searchParams.get('ids');
  const templateId = searchParams.get('templateId');
  const embed = searchParams.get('embed') === '1';

  const transactionIds = (idsParam ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const notifyParent = useCallback(
    (type: string, message?: string) => {
      if (!embed || window.parent === window) return;
      window.parent.postMessage({ type, message }, window.location.origin);
    },
    [embed]
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [screenPageCount, setScreenPageCount] = useState(1);

  useEffect(() => {
    if (transactionIds.length === 0) {
      setLoading(false);
      const msg = 'No dispatch transactions provided';
      if (embed) {
        notifyParent(DISPATCH_NOTE_PRINT_ERROR, msg);
      } else {
        toast.error(msg);
        router.back();
      }
      return;
    }

    if (!session?.user?.activeCompanyId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const txnResults = await Promise.all(
          transactionIds.map(async (id) => {
            const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`);
            if (!res.ok) return null;
            const json = await res.json();
            return json.data as Transaction | null;
          })
        );

        const validTxns = txnResults.filter((txn): txn is Transaction => Boolean(txn));
        if (validTxns.length === 0) {
          const msg = 'Dispatch transactions not found';
          if (embed) notifyParent(DISPATCH_NOTE_PRINT_ERROR, msg);
          else {
            toast.error(msg);
            router.back();
          }
          return;
        }

        if (cancelled) return;
        setTransactions(validTxns);

        const companyId = validTxns[0]?.companyId ?? session.user.activeCompanyId;
        if (companyId) {
          const companyRes = await fetch(`/api/companies/${companyId}`);
          if (companyRes.ok && !cancelled) {
            const companyJson = await companyRes.json();
            setCompany(companyJson.data as Company);
          }
        }
      } catch (err) {
        console.error('Failed to load dispatch note:', err);
        const msg = 'Failed to load dispatch note';
        if (embed) notifyParent(DISPATCH_NOTE_PRINT_ERROR, msg);
        else toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [idsParam, router, session?.user?.activeCompanyId, embed, notifyParent]);

  useEffect(() => {
    if (!loading && transactions.length > 0 && company) {
      if (!embed && prefersPrintWindow()) return;

      let cancelled = false;
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) window.print();
          });
        });
      }, 500);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [loading, transactions, company, embed]);

  useEffect(() => {
    if (!embed) return;
    const onAfterPrint = () => {
      notifyParent(DISPATCH_NOTE_PRINT_DONE);
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [embed, notifyParent]);

  useEffect(() => {
    if (loading || transactions.length === 0 || !company) return;
    const root = document.querySelector('.document-renderer-root') as HTMLElement | null;
    if (!root) return;
    const widthPx = root.getBoundingClientRect().width || 1;
    const pxPerMm = widthPx / 210;
    const pagePx = 297 * pxPerMm;
    const pages = Math.max(1, Math.ceil(root.scrollHeight / pagePx));
    setScreenPageCount(pages);
  }, [loading, transactions, company, templateId]);

  useEffect(() => {
    if (!embed || loading) return;
    if (transactions.length === 0 || !company) {
      notifyParent(DISPATCH_NOTE_PRINT_ERROR, 'Failed to load data');
    }
  }, [embed, loading, transactions, company, notifyParent]);

  if (loading) {
    if (embed) return null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ color: '#666', fontFamily: 'Arial' }}>Loading document...</p>
      </div>
    );
  }

  if (transactions.length === 0 || !company) {
    if (embed) return null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ color: '#c00', fontFamily: 'Arial' }}>Failed to load data</p>
      </div>
    );
  }

  const companyTemplates = readCompanyDocumentTemplates(company.printTemplates);
  const templatePool = filterTemplatesForDispatchNotePrint(companyTemplates);
  let template: DocumentTemplate = DEFAULT_DISPATCH_NOTE;
  if (companyTemplates.length > 0) {
    if (templateId) {
      const found = companyTemplates.find((t) => t.id === templateId);
      if (found) template = found;
    } else if (templatePool.length > 0) {
      template = templatePool.find((t) => t.isDefault) ?? templatePool[0];
    }
  }

  const creatorUser =
    transactions.find((txn) => txn.performedByUser)?.performedByUser ??
    ({
      name: session?.user?.name,
      image: session?.user?.image,
      signatureUrl: session?.user?.signatureUrl,
    } as Transaction['performedByUser']);

  const data = buildDataContext('dispatch-note', transactions, company, creatorUser ?? undefined);
  const dispatchRef = (data as { dispatch?: { reference?: string } }).dispatch?.reference ?? '';

  return (
    <div className="dispatch-note-print-root">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, .dispatch-note-print-root, .dispatch-note-print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        html, body, .dispatch-note-print-root {
          margin: 0; padding: 0; background: #ffffff; color: #0f172a; color-scheme: light;
        }
        @page { size: A4; margin: 0; }
        @media print {
          html, body, .dispatch-note-print-root {
            background: #ffffff !important; color: #0f172a !important; color-scheme: light !important;
          }
          .screen-only { display: none !important; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }
          .document-renderer > div:last-child { page-break-inside: avoid; break-inside: avoid; }
          .document-renderer-root { min-height: auto !important; height: auto !important; }
        }
        @media screen {
          body { background: #e5e7eb; }
          .print-toolbar {
            position: fixed; top: 0; left: 0; right: 0; padding: 12px 20px;
            background: #1e293b; display: flex; align-items: center; gap: 12px;
            z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          }
          .print-toolbar button {
            padding: 8px 20px; border: none; border-radius: 6px;
            cursor: pointer; font-weight: 600; font-size: 14px;
          }
          .print-page-wrapper {
            max-width: 210mm; margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15); position: relative;
            --preview-total-pages: 1;
          }
        }
      `}</style>

      {!embed && (
        <div className="screen-only print-toolbar">
          <button type="button" onClick={() => window.print()} style={{ background: '#059669', color: '#fff' }}>
            Print
          </button>
          <button type="button" onClick={() => window.close()} style={{ background: '#475569', color: '#fff' }}>
            Close
          </button>
          <span style={{ color: '#94a3b8', fontSize: '13px', marginLeft: '8px' }}>
            {template.name} &mdash; {dispatchRef}
          </span>
        </div>
      )}

      {!embed && <div className="screen-only" style={{ height: prefersPrintWindow() ? '0' : '60px' }} />}

      <div
        className="print-page-wrapper"
        style={{ ['--preview-total-pages' as string]: `"${screenPageCount}"` }}
      >
        <DocumentRenderer template={template} data={data} mode="print" />
      </div>
    </div>
  );
}
