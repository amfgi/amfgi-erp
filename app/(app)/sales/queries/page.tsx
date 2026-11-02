'use client';

import SalesListPage from '@/components/sales/SalesListPage';

export default function SalesQueriesPage() {
  return (
    <SalesListPage
      eyebrow="Sales"
      title="Queries"
      description="Queries that have not been forwarded. Rejected queries stay off this list until you choose them."
      stage="QUERY"
      showQueryQueue
      addHref="/sales/queries/form"
      addLabel="Add query"
    />
  );
}
