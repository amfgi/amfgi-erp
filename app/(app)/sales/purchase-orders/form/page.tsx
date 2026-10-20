'use client';

import { Suspense } from 'react';

import SalesRecordForm from '@/components/sales/SalesRecordForm';

export default function PurchaseOrderFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <SalesRecordForm section="purchaseOrder" />
    </Suspense>
  );
}
