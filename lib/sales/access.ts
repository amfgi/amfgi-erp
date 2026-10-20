import { P, type Permission } from '@/lib/permissions';

export type SalesStageName = 'QUERY' | 'QUOTATION' | 'PURCHASE_ORDER';

type SessionUser = {
  isSuperAdmin?: boolean | null;
  permissions?: string[] | null;
};

export type SalesAccess = {
  queryView: boolean;
  queryManage: boolean;
  quotationView: boolean;
  quotationManage: boolean;
  purchaseOrdersView: boolean;
  purchaseOrdersManage: boolean;
  customerView: boolean;
  customerCreate: boolean;
  customerEdit: boolean;
  jobCreate: boolean;
};

function has(user: SessionUser, key: Permission): boolean {
  if (user.isSuperAdmin) return true;
  return (user.permissions ?? []).includes(key);
}

export function salesAccess(user: SessionUser): SalesAccess {
  return {
    queryView: has(user, P.SALES_QUERY_VIEW),
    queryManage: has(user, P.SALES_QUERY_MANAGE),
    quotationView: has(user, P.SALES_QUOTATION_VIEW),
    quotationManage: has(user, P.SALES_QUOTATION_MANAGE),
    purchaseOrdersView: has(user, P.SALES_PURCHASE_ORDERS_VIEW),
    purchaseOrdersManage: has(user, P.SALES_PURCHASE_ORDERS_MANAGE),
    customerView: has(user, P.CUSTOMER_VIEW),
    customerCreate: has(user, P.CUSTOMER_CREATE),
    customerEdit: has(user, P.CUSTOMER_EDIT),
    jobCreate: has(user, P.JOB_CREATE),
  };
}

export function canListSales(access: SalesAccess): boolean {
  return access.queryView || access.quotationView || access.purchaseOrdersView;
}

export function canSeeStage(access: SalesAccess, stage: SalesStageName): boolean {
  if (stage === 'QUERY') return access.queryView;
  if (stage === 'QUOTATION') return access.quotationView;
  return access.purchaseOrdersView;
}

export function hidesPurchaseOrders(access: SalesAccess): boolean {
  return !access.purchaseOrdersView;
}
