'use client';

import { Suspense } from 'react';

import SalesRecordForm from '@/components/sales/SalesRecordForm';
import Spinner from '@/components/ui/Spinner';

export default function SalesQuotationFormPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>}>
      <SalesRecordForm section="quotation" />
    </Suspense>
  );
}
