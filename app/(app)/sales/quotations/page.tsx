'use client';

import SalesListPage from '@/components/sales/SalesListPage';

export default function SalesQuotationsPage() {
  return (
    <SalesListPage
      eyebrow="Sales"
      title="Quotations"
      description="Open quotations. Use Status to find lost or cancelled ones. Receiving a purchase order moves the card to Purchase Orders."
      stage="QUOTATION"
      showClosureFilter
      showGrandTotal
    />
  );
}
