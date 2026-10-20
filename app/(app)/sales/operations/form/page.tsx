import { redirect } from 'next/navigation';

export default async function OperationsFormRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  redirect(params.id ? `/sales/purchase-orders/form?id=${params.id}` : '/sales/purchase-orders');
}
