'use client';

import SalesListPage from '@/components/sales/SalesListPage';

export default function SalesQuotationsPage() {
  return (
    <SalesListPage
      eyebrow="Sales"
      title="Quotations"
      description="Open quotations. Receiving a purchase order moves the card to Purchase Orders."
      stage="QUOTATION"
      closure="OPEN"
      showGrandTotal
    />
  );
}
