'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { QuotationSheet } from '@/components/sales/QuotationSheet';
import { documentFromRecord, quotationFileName } from '@/lib/sales/quotationDocument';
import { dateInputValue } from '@/lib/sales/format';
import { useGetSalesQueryQuery } from '@/store/hooks';

function SalesQuotationPrint() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const copy = params.get('copy') === 'po' ? 'po' : 'quotation';
  const query = useGetSalesQueryQuery(id, { skip: !id });
  const record = query.data;

  useEffect(() => {
    if (!record) return;
    const previousTitle = window.document.title;
    window.document.title = quotationFileName(documentFromRecord(record), record.quotationNumber || '');
    return () => {
      window.document.title = previousTitle;
    };
  }, [record]);

  if (!id) return <p className="p-6 text-sm">Missing quotation.</p>;
  if (query.isLoading || !record) return <p className="p-6 text-sm">Preparing the document…</p>;

  const accepted = record.options.findIndex((option) => option.isAccepted);
  const document = documentFromRecord(record);

  return (
    <main className="bg-white p-4 print:p-0">
      <style>{`@media print { @page { size: A4; margin: 0; } body { background: white !important; } }`}</style>
      <QuotationSheet
        document={document}
        readOnly
        quotationNumber={record.quotationNumber || ''}
        letterheadUrl={record.company?.letterheadUrl}
        acceptedOptionIndex={copy === 'po' ? (accepted >= 0 ? accepted : 0) : null}
        po={copy === 'po' && record.poNumber ? {
          number: record.poNumber,
          date: dateInputValue(record.poDate),
          value: record.poValue != null ? String(record.poValue) : '',
        } : null}
      />
    </main>
  );
}

export default function SalesQuotationPrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Preparing the document…</p>}>
      <SalesQuotationPrint />
    </Suspense>
  );
}
