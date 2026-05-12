import { redirect } from 'next/navigation';

/** Legacy URL: consumption & costing now lives on the job ledger. */
export default async function ConsumptionCostingRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customers/jobs/${id}`);
}
