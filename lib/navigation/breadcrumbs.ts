export type BreadcrumbCrumb = {
  href: string;
  label: string;
  link: boolean;
};

type RouteDef = {
  pattern: string;
  label: string;
  parent?: string;
  /** Shown instead of the parent route's own label. */
  parentLabel?: string;
  link?: boolean;
};

const ROUTES: RouteDef[] = [
  { pattern: '/dashboard', label: 'Dashboard' },
  { pattern: '/profile', label: 'Profile', parent: '/dashboard' },

  { pattern: '/stock', label: 'Stock', parent: '/dashboard' },
  { pattern: '/stock/materials', label: 'Materials', parent: '/stock' },
  { pattern: '/stock/materials/dispatch', label: 'Dispatch', parent: '/stock/materials' },
  { pattern: '/stock/materials/dispatch-history', label: 'Dispatch history', parent: '/stock/materials' },
  { pattern: '/stock/materials/new', label: 'New', parent: '/stock/materials' },
  { pattern: '/stock/materials/:id', label: 'Material', parent: '/stock/materials' },
  { pattern: '/stock/master-data', label: 'Master data', parent: '/stock' },
  { pattern: '/stock/goods-receipt', label: 'Goods receipt', parent: '/stock' },
  { pattern: '/stock/goods-receipt/receive', label: 'Receive', parent: '/stock/goods-receipt' },
  { pattern: '/stock/dispatch', label: 'Dispatch', parent: '/stock' },
  { pattern: '/stock/dispatch/entry', label: 'New dispatch', parent: '/stock/dispatch' },
  { pattern: '/stock/dispatch/delivery-note', label: 'Delivery note', parent: '/stock/dispatch' },
  { pattern: '/stock/daily-quantity-log', label: 'Job tracking', parent: '/stock' },
  { pattern: '/stock/daily-quantity-log/:workDate', label: 'Day', parent: '/stock/daily-quantity-log' },
  { pattern: '/stock/factory-production', label: 'Factory production', parent: '/stock' },
  { pattern: '/stock/factory-production/new', label: 'New', parent: '/stock/factory-production' },
  { pattern: '/stock/job-budget', label: 'Job budget', parent: '/stock' },
  { pattern: '/stock/job-budget/formulas', label: 'Formulas', parent: '/stock/job-budget' },
  { pattern: '/stock/job-budget/formulas/new', label: 'New', parent: '/stock/job-budget/formulas' },
  { pattern: '/stock/job-budget/formulas/:id/edit', label: 'Formula', parent: '/stock/job-budget/formulas' },
  { pattern: '/stock/job-budget/:id', label: 'Job', parent: '/stock/job-budget' },
  { pattern: '/stock/stock-batches', label: 'Stock batches', parent: '/stock' },
  { pattern: '/stock/inventory-by-warehouse', label: 'Inventory by warehouse', parent: '/stock' },
  { pattern: '/stock/inter-company-transfers', label: 'Inter-company transfers', parent: '/stock' },
  { pattern: '/stock/inter-company-transfers/new', label: 'New', parent: '/stock/inter-company-transfers' },
  { pattern: '/stock/warehouse-transfers', label: 'Warehouse transfers', parent: '/stock' },
  { pattern: '/stock/warehouse-transfers/new', label: 'New', parent: '/stock/warehouse-transfers' },
  { pattern: '/stock/issue-reconcile', label: 'Issue reconcile', parent: '/stock' },
  { pattern: '/stock/issue-reconcile/new', label: 'New', parent: '/stock/issue-reconcile' },
  { pattern: '/stock/integrity', label: 'Stock integrity', parent: '/stock' },
  { pattern: '/stock/manual-adjustments', label: 'Manual adjustments', parent: '/stock' },
  { pattern: '/stock/count-session', label: 'Stock count session', parent: '/stock' },

  { pattern: '/suppliers', label: 'Suppliers', parent: '/dashboard' },
  { pattern: '/suppliers/new', label: 'New', parent: '/suppliers' },
  { pattern: '/suppliers/:id/edit', label: 'Supplier', parent: '/suppliers' },

  { pattern: '/customers', label: 'Customers', parent: '/dashboard' },
  { pattern: '/customers/jobs', label: 'Jobs', parent: '/customers' },
  { pattern: '/customers/jobs/form', label: 'New', parent: '/customers/jobs' },
  { pattern: '/customers/jobs/:id', label: 'Job', parent: '/customers/jobs' },

  { pattern: '/sales', label: 'Sales', parent: '/dashboard', link: false },
  { pattern: '/sales/queries', label: 'Queries', parent: '/sales' },
  { pattern: '/sales/queries/form', label: 'New', parent: '/sales/queries' },
  { pattern: '/sales/quotations', label: 'Quotations', parent: '/sales' },
  { pattern: '/sales/quotations/form', label: 'New', parent: '/sales/quotations' },
  { pattern: '/sales/purchase-orders', label: 'Purchase orders', parent: '/sales' },
  { pattern: '/sales/purchase-orders/form', label: 'New', parent: '/sales/purchase-orders' },

  { pattern: '/hr/schedule', label: 'Schedule planning', parent: '/dashboard' },
  { pattern: '/hr/schedule/:workDate', label: 'Day', parent: '/hr/schedule' },
  { pattern: '/hr/attendance', label: 'Attendance management', parent: '/hr/schedule', parentLabel: 'Schedule & Attendance' },
  { pattern: '/hr/attendance/employee', label: 'Employee attendance', parent: '/hr/schedule', parentLabel: 'Schedule & Attendance' },
  { pattern: '/hr/attendance/create', label: 'Day sheet', parent: '/hr/attendance' },
  { pattern: '/hr/reports/attendance', label: 'Monthly attendance reports', parent: '/hr/schedule', parentLabel: 'Schedule & Attendance' },
  { pattern: '/hr/reports/attendance/builder', label: 'Builder', parent: '/hr/reports/attendance' },

  { pattern: '/hr/employees', label: 'Employees', parent: '/dashboard' },
  { pattern: '/hr/employees/new', label: 'New', parent: '/hr/employees' },
  { pattern: '/hr/employees/history', label: 'Employee history', parent: '/hr/employees' },
  { pattern: '/hr/employees/:id', label: 'Employee', parent: '/hr/employees' },
  { pattern: '/hr/employee-setup', label: 'Employee setup', parent: '/dashboard' },
  { pattern: '/hr/settings/employment-options', label: 'Employment options', parent: '/hr/employee-setup' },
  { pattern: '/hr/settings/employee-codes', label: 'Employee ID format', parent: '/hr/employee-setup' },
  { pattern: '/hr/settings/employee-types', label: 'Employee types', parent: '/hr/employee-setup' },
  { pattern: '/hr/settings/expertises', label: 'Expertise catalog', parent: '/hr/employee-setup' },
  { pattern: '/hr/settings/document-types', label: 'Document types', parent: '/hr/employee-setup' },

  { pattern: '/hr/leave', label: 'Leave management', parent: '/dashboard' },
  { pattern: '/hr/leave/balances', label: 'Leave balances', parent: '/hr/leave', parentLabel: 'Leave Management' },
  { pattern: '/hr/settings/leave-types', label: 'Leave types', parent: '/hr/leave', parentLabel: 'Leave Management' },

  { pattern: '/hr/payroll/preview', label: 'Payroll preview', parent: '/dashboard' },
  { pattern: '/hr/payroll/fines', label: 'Fine management', parent: '/hr/payroll/preview', parentLabel: 'Payroll' },
  { pattern: '/hr/payroll/runs', label: 'Payroll runs', parent: '/hr/payroll/preview', parentLabel: 'Payroll' },
  { pattern: '/hr/payroll/runs/:id', label: 'Payroll run', parent: '/hr/payroll/runs' },
  { pattern: '/hr/settings/salary-structure', label: 'Salary structure', parent: '/hr/payroll/preview', parentLabel: 'Payroll' },
  { pattern: '/hr/settings/salary-component', label: 'Salary components', parent: '/hr/payroll/preview', parentLabel: 'Payroll' },
  { pattern: '/hr/settings/company-holidays', label: 'Company holidays', parent: '/hr/payroll/preview', parentLabel: 'Payroll' },

  { pattern: '/me', label: 'My profile', parent: '/dashboard' },
  { pattern: '/me/attendance', label: 'My attendance', parent: '/me', parentLabel: 'My profile' },
  { pattern: '/me/leave', label: 'My leave', parent: '/me', parentLabel: 'My profile' },
  { pattern: '/me/documents', label: 'My documents', parent: '/me', parentLabel: 'My profile' },

  { pattern: '/reports', label: 'Reports', parent: '/dashboard' },
  { pattern: '/reports/monthly-job-summary', label: 'Monthly job summary', parent: '/reports' },
  { pattern: '/reports/material-consumption', label: 'Material consumption', parent: '/reports' },
  { pattern: '/reports/job-profitability', label: 'Customer and job profitability', parent: '/reports' },
  { pattern: '/reports/supplier-traceability', label: 'Supplier traceability', parent: '/reports' },
  { pattern: '/reports/stock-exceptions', label: 'Stock exception dashboard', parent: '/reports' },
  { pattern: '/reports/stock-adjustments', label: 'Stock adjustment report', parent: '/reports' },
  { pattern: '/reports/stock-count-sessions', label: 'Stock count session report', parent: '/reports' },

  { pattern: '/admin/users', label: 'Users', parent: '/dashboard' },
  { pattern: '/admin/roles', label: 'Roles', parent: '/dashboard' },
  { pattern: '/admin/profiles', label: 'Profiles', parent: '/dashboard' },
  { pattern: '/admin/companies', label: 'Companies', parent: '/dashboard' },
  { pattern: '/admin/companies/company', label: 'Company profile', parent: '/admin/companies' },

  { pattern: '/settings', label: 'Settings', parent: '/dashboard', link: false },
  { pattern: '/settings/print-format', label: 'Print format', parent: '/settings' },
  { pattern: '/settings/serial-number', label: 'Serial number', parent: '/settings' },
  { pattern: '/settings/storage', label: 'Storage', parent: '/settings' },
  { pattern: '/settings/media', label: 'Media', parent: '/settings' },
  { pattern: '/settings/email', label: 'Email', parent: '/settings' },
  { pattern: '/settings/api', label: 'API center', parent: '/settings' },

  { pattern: '/docs', label: 'Documentation' },
  { pattern: '/docs/api', label: 'API docs', parent: '/docs' },
  { pattern: '/docs/:slug', label: 'Guide', parent: '/docs' },

  { pattern: '/jobs/:id/cost-engine', label: 'Costing', parent: '/customers/jobs/:id' },
];

const DATE_PARAMS = new Set(['workDate']);

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function patternToRegExp(pattern: string) {
  const names: string[] = [];
  const source = pattern
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { names, regex: new RegExp(`^${source}$`) };
}

function matchRoute(pattern: string, pathname: string) {
  const { names, regex } = patternToRegExp(pattern);
  const match = regex.exec(pathname);
  if (!match) return null;
  const params: Record<string, string> = {};
  names.forEach((name, index) => {
    params[name] = decodeURIComponent(match[index + 1] ?? '');
  });
  return params;
}

function specificity(pattern: string) {
  const parts = pattern.split('/').filter(Boolean);
  const staticCount = parts.filter((part) => !part.startsWith(':')).length;
  return staticCount * 10 + parts.length;
}

function fillPattern(pattern: string, params: Record<string, string>) {
  return pattern
    .split('/')
    .map((part) => (part.startsWith(':') ? encodeURIComponent(params[part.slice(1)] ?? '') : part))
    .join('/');
}

function labelFor(route: RouteDef, params: Record<string, string>, search: URLSearchParams) {
  if (route.pattern === '/customers/jobs/form') {
    const mode = search.get('mode');
    if (mode === 'edit') return 'Edit';
    if (mode === 'variation') return 'Variation';
    return 'New';
  }
  if (route.pattern.endsWith('/form')) {
    return search.get('id') ? 'Edit' : route.label;
  }
  if (route.pattern === '/stock/goods-receipt/receive' && search.get('edit')) return 'Edit';
  for (const key of DATE_PARAMS) {
    if (params[key] && /^\d{4}-\d{2}-\d{2}$/.test(params[key])) return formatDay(params[key]);
  }
  return route.label;
}

function routeByPattern(pattern: string) {
  return ROUTES.find((route) => route.pattern === pattern) ?? null;
}

function ancestors(route: RouteDef, params: Record<string, string>): BreadcrumbCrumb[] {
  if (!route.parent) return [];
  const parent = routeByPattern(route.parent);
  if (!parent) return [];
  const parentParams = matchRoute(parent.pattern, fillPattern(parent.pattern, params)) ?? {};
  return [
    ...ancestors(parent, parentParams),
    {
      href: fillPattern(parent.pattern, parentParams),
      label: route.parentLabel ?? parent.label,
      link: parent.link !== false,
    },
  ];
}

export function buildBreadcrumbs(pathname: string, search: URLSearchParams = new URLSearchParams()): BreadcrumbCrumb[] {
  const path = pathname.split('?')[0] || '/';
  if (path === '/') return [];

  let best: { route: RouteDef; params: Record<string, string>; score: number } | null = null;
  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, path);
    if (!params) continue;
    const score = specificity(route.pattern);
    if (!best || score > best.score) best = { route, params, score };
  }
  if (!best) return [];

  const crumbs = [
    ...ancestors(best.route, best.params),
    {
      href: fillPattern(best.route.pattern, best.params),
      label: labelFor(best.route, best.params, search),
      link: false,
    },
  ];

  if (!path.startsWith('/docs') && crumbs[0]?.href !== '/dashboard') {
    crumbs.unshift({ href: '/dashboard', label: 'Dashboard', link: true });
  }

  const last = crumbs.length - 1;
  return crumbs.map((crumb, index) => ({ ...crumb, link: index === last ? false : crumb.link }));
}
