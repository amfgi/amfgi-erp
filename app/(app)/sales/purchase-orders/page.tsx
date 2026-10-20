'use client';

import SalesListPage from '@/components/sales/SalesListPage';

export default function PurchaseOrdersPage() {
  return (
    <SalesListPage
      eyebrow="Sales"
      title="Purchase Orders"
      description="Received purchase orders that do not have a job yet."
      stage="PURCHASE_ORDER"
      closure="OPEN"
      withoutJob
    />
  );
}
