'use client';

import { Suspense } from 'react';

import SalesRecordForm from '@/components/sales/SalesRecordForm';

export default function SalesQuotationFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <SalesRecordForm section="quotation" />
    </Suspense>
  );
}
