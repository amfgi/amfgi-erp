'use client';

import SalesListPage from '@/components/sales/SalesListPage';

export default function PurchaseOrdersPage() {
  return (
    <SalesListPage
      eyebrow="Sales"
      title="Purchase Orders"
      description="Received purchase orders that do not have a job yet. Use Status to find lost or cancelled ones."
      stage="PURCHASE_ORDER"
      showClosureFilter
      withoutJob
    />
  );
}
