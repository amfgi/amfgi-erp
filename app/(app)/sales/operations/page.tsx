import { redirect } from 'next/navigation';

export default function OperationsRedirectPage() {
  redirect('/sales/purchase-orders');
}
