/** User-facing ERP guide content for `/docs` (keep in sync when workflows change). */

export type UserGuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: { title: string; body: string }[] }
  | { type: 'callout'; variant: 'tip' | 'note' | 'warning'; title: string; body: string };

export type UserGuideSection = {
  id: string;
  title: string;
  blocks: UserGuideBlock[];
};

export type UserGuidePage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  appHref: string;
  order: number;
  sections: UserGuideSection[];
  relatedSlugs?: string[];
};

export const USER_GUIDE_PAGES: UserGuidePage[] = [
  {
    slug: 'company-setup',
    title: 'Company setup',
    eyebrow: 'Getting started',
    description:
      'Configure your active company profile, currency, integration source modes, stock control defaults, users, and roles before day-to-day operations.',
    appHref: '/admin/companies/company',
    order: 1,
    relatedSlugs: ['stock', 'customers', 'suppliers'],
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            text: 'AMFGI is multi-company: every record (materials, jobs, customers, stock transactions) belongs to the active company you select after login. Super admins manage the company directory; company admins maintain the active company profile and operational defaults.',
          },
          {
            type: 'list',
            items: [
              'Companies — create companies and switch context (super admin).',
              'Company profile — address, currency, integration IDs, and stock control thresholds.',
              'Users & roles — who can sign in and which permissions they receive per company.',
              'Settings — print formats, storage, email, and API center for integrations.',
            ],
          },
        ],
      },
      {
        id: 'company-profile',
        title: 'Company profile',
        blocks: [
          {
            type: 'paragraph',
            text: 'Open Admin → Companies → Company profile (or Settings if you have manage permission). Save contact details, default currency, and integration identifiers used when syncing with external systems.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Set currency',
                body: 'Choose the reporting currency (e.g. AED). Valuation panels, job budgets, and reports use this code for display.',
              },
              {
                title: 'Configure source modes',
                body: 'Jobs, customers, and suppliers each support HYBRID (local + external), EXTERNAL_ONLY, or INTERNAL_ONLY. Hybrid lets you create records in AMFGI while still accepting integration upserts. Internal-only disables party-list sync buttons.',
              },
              {
                title: 'External company ID',
                body: 'When using the integration API, external systems send companyExternalId — it must match the value stored on the company profile.',
              },
              {
                title: 'Stock control thresholds',
                body: 'Super admins can set negative-evidence and decision-note quantity thresholds used when investigating stock integrity exceptions.',
              },
            ],
          },
        ],
      },
      {
        id: 'party-sync',
        title: 'Party lists sync',
        blocks: [
          {
            type: 'paragraph',
            text: 'If PARTY_LISTS_API_* environment variables are configured, the company profile page can pull master customers and suppliers from an external party directory. Sync respects customer/supplier source mode — internal-only mode blocks the matching button.',
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Before first job or receipt',
            body: 'Run customer and supplier sync (or create records manually) so goods receipt and dispatch can reference the correct parties.',
          },
        ],
      },
      {
        id: 'users-roles',
        title: 'Users and roles',
        blocks: [
          {
            type: 'paragraph',
            text: 'Admin → Users assigns people to companies with a role. Admin → Roles defines permission presets (material view, stock in/out, job budget, HR modules, reports, settings). Users only see sidebar items their role allows.',
          },
          {
            type: 'list',
            items: [
              'Grant stock permissions before handing out goods receipt or dispatch work.',
              'Job view is required for Customers → Jobs and job-linked stock.',
              'settings.manage unlocks company profile edits and stock master data.',
              'Linked employees get the self-service portal at /me.',
            ],
          },
        ],
      },
      {
        id: 'settings',
        title: 'Operational settings',
        blocks: [
          {
            type: 'paragraph',
            text: 'Use Settings in the sidebar for print templates (delivery notes, dispatch notes, payslips), file storage, outbound email, and API keys. Print format settings control letterhead and layout on printed documents.',
          },
        ],
      },
    ],
  },
  {
    slug: 'stock',
    title: 'Stock module',
    eyebrow: 'Inventory & production',
    description:
      'Complete reference for every stock workspace screen: valuation, master data, materials, goods receipt, dispatch, delivery notes, production log, job budgets, FIFO batches, transfers, adjustments, and integrity.',
    appHref: '/stock',
    order: 2,
    relatedSlugs: ['company-setup', 'jobs', 'suppliers'],
    sections: [
      {
        id: 'overview',
        title: 'Stock workspace & valuation',
        blocks: [
          {
            type: 'paragraph',
            text: 'Stock → /stock is the hub for all inventory operations. The valuation panel compares your company preferred costing method against current material cost, then breaks stock value down by warehouse. Quick actions at the top jump to the most common entry screens: new receipt, new dispatch, delivery note, and warehouse transfer (when permitted).',
          },
          {
            type: 'list',
            items: [
              'Preferred value — total stock value using the company preferred method (typically FIFO layers).',
              'Current value — valuation using each material’s current unit cost field.',
              'Warehouse breakdown — how total value splits across warehouses; shows fallback warehouse when configured on the company.',
              'Integrity badge on the hub — count of materials with reconciliation exceptions; opens Stock integrity.',
            ],
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Recommended setup order',
            body: 'Master data (units, categories, warehouses) → materials → suppliers → goods receipt → job budget on variations → dispatch / production log → periodic integrity review.',
          },
        ],
      },
      {
        id: 'permissions',
        title: 'Permissions reference',
        blocks: [
          {
            type: 'paragraph',
            text: 'Stock screens appear in the sidebar and hub only when the user’s role includes the matching permission. Super admins see everything.',
          },
          {
            type: 'list',
            items: [
              'material.view / material.create / material.edit / material.delete — Materials list and detail.',
              'transaction.stock_in — Goods receipt list, receive editor, receipt adjustments.',
              'transaction.stock_out — Dispatch list, dispatch entry, delivery notes, print.',
              'transaction.transfer — Inter-company transfers.',
              'stock.warehouse_transfer.view / stock.warehouse_transfer.transfer — Warehouse transfer ledger and new transfer.',
              'transaction.reconcile — Issue reconcile (non-stock allocation to jobs).',
              'transaction.adjust — Manual stock adjustments and approval queue.',
              'stock.count_session.view / stock.count_session.edit — Stock count sessions.',
              'stock.job_budget.view / stock.job_budget.edit — Job budget list and editor.',
              'stock.formula.view / stock.formula.edit — Budget formula templates.',
              'stock.production_log.view / stock.production_log.edit — Production log days and finalize.',
              'settings.manage — Full master data maintenance alongside material.view.',
            ],
          },
        ],
      },
      {
        id: 'master-data-units',
        title: 'Master data — Units',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Master data → Units tab (/stock/master-data?tab=units). Units are the measurement labels attached to materials (kg, m², litre, pcs, bag, etc.). Every material must reference exactly one base unit.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Add a unit',
                body: 'Click add, enter the display name, and save. Names should match how warehouse staff speak (e.g. “Square metre” or “m²”).',
              },
              {
                title: 'Edit or retire',
                body: 'Rename from the row action menu. Deletion is blocked when any material still references the unit — reassign materials first.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'warning',
            title: 'Do this before materials',
            body: 'Create all common units upfront. Changing units on live materials affects historical reports and UOM conversions on the material detail page.',
          },
        ],
      },
      {
        id: 'master-data-categories',
        title: 'Master data — Categories',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Master data → Categories tab. Categories group materials for filtering, imports, and reports (e.g. Resin, Catalyst, Consumables, Tools). They are company-scoped reference data.',
          },
          {
            type: 'list',
            items: [
              'One category per material; optional but strongly recommended for large catalogs.',
              'Used on the materials list sort/filter and bulk import mapping.',
              'Cannot delete a category while materials are still assigned — move or deactivate materials first.',
            ],
          },
        ],
      },
      {
        id: 'master-data-warehouses',
        title: 'Master data — Warehouses',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Master data → Warehouses tab. Warehouses are stock-holding locations within the active company. FIFO batches, goods receipts, dispatches, and warehouse balances are all warehouse-aware.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create warehouses',
                body: 'Add each physical store, site cage, or logical staging location you need to track separately (Main store, Site A, Transit, etc.).',
              },
              {
                title: 'Default on materials',
                body: 'Materials can store a default warehouse hint; transactions still let you pick warehouse per line when posting.',
              },
              {
                title: 'Company fallback warehouse',
                body: 'Super admins can set a stock fallback warehouse on the company — used when a transaction does not specify a warehouse explicitly.',
              },
            ],
          },
        ],
      },
      {
        id: 'materials',
        title: 'Materials',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Materials (/stock/materials). The item master lists every material with current stock, unit cost snapshot, category, warehouse hint, stock type, and active flag. Search, sort, paginate, export to XLSX, or bulk-import from spreadsheet templates.',
          },
          {
            type: 'list',
            items: [
              'Stock type STOCK — tracked in FIFO batches; receipt increases layers; dispatch consumes oldest layers first.',
              'Stock type NON_STOCK — no FIFO balance; quantities allocated to jobs via Issue reconcile instead of normal dispatch.',
              'allowNegativeConsumption — when enabled, dispatch can proceed without sufficient FIFO (creates negative evidence for integrity review).',
              'reorderLevel — optional alert threshold on the list.',
              'externalItemName — label used when matching integration or import rows.',
              'isActive — inactive materials are hidden from pickers but history remains.',
            ],
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create from list',
                body: 'Open the create modal or import wizard. Minimum fields: name, unit, category. Set stock type before first receipt.',
              },
              {
                title: 'Material detail (/stock/materials/[id])',
                body: 'Tabs: Details (edit core fields), Files (attachments), UOM (alternate units with conversion factors), History (audit log and manual price log entries).',
              },
              {
                title: 'Assembly components',
                body: 'On detail, define bill-of-material style components if this item is built from other materials (used in costing context).',
              },
              {
                title: 'Quick dispatch',
                body: 'Context menu → Dispatch opens dispatch entry pre-filtered for this material when you have transaction.stock_out.',
              },
              {
                title: 'Deactivate vs delete',
                body: 'Materials with transaction history cannot be hard-deleted; deactivate to remove from pickers. Delete is only offered when no batches or transactions exist.',
              },
            ],
          },
        ],
      },
      {
        id: 'goods-receipt',
        title: 'Goods receipt',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Goods receipt (/stock/goods-receipt) for the ledger; Receive (/stock/goods-receipt/receive) for data entry. Goods receipt is how stock enters the system — purchase deliveries, returns to stock, and opening balances posted as receipts.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Receipt list',
                body: 'Browse by day, month, or all history. Each row shows receipt number, supplier, date, bill amount, status (Active/Cancelled), and linked transaction summary. Context menu supports view lines, edit, adjust, cancel, or delete when policy allows.',
              },
              {
                title: 'New receipt — header',
                body: 'Required: supplier (searchable picker). Optional: receipt number (auto-generated if blank), LPO number, supplier invoice number, receipt date, notes. Toggle include tax to calculate bill amount with VAT when applicable.',
              },
              {
                title: 'Line items',
                body: 'Per line: material (search or quick-create), quantity, unit cost, warehouse per line when multi-warehouse. Posting creates STOCK_IN transactions and FIFO batches with received date, supplier reference, and unit cost.',
              },
              {
                title: 'Edit existing receipt',
                body: 'Open receive with ?edit= receipt number to amend lines. System may block changes that would break FIFO consumption already dispatched — adjustment impact preview warns before save.',
              },
              {
                title: 'Cancel or delete',
                body: 'Cancel marks receipt inactive without removing audit trail. Delete removes entry only when no downstream dispatch consumed its batches; otherwise use controlled adjustment workflows.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Supplier prerequisite',
            body: 'Create or sync suppliers before posting receipts. Supplier name is stored on each FIFO batch for traceability reports.',
          },
        ],
      },
      {
        id: 'dispatch',
        title: 'Dispatch',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Dispatch (/stock/dispatch) for history; Dispatch entry (/stock/dispatch/entry) for new stock-out. Dispatch issues FIFO-tracked materials to variation jobs. Consumption always uses oldest available batches first unless the material allows negative consumption.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Dispatch list filters',
                body: 'Filter by day, month, or all; tabs for All, Dispatches only, Delivery notes only, or In transit. Search by job number, customer, or material text.',
              },
              {
                title: 'New dispatch entry',
                body: 'Pick variation job (not parent contract), transaction date, and optional notes. Add material lines: warehouse, material, quantity in material UOM. System validates available FIFO per warehouse before post.',
              },
              {
                title: 'Budget warning',
                body: 'When a job budget exists, dispatch may warn if cumulative issues exceed planned quantities — review before confirming.',
              },
              {
                title: 'Returns on edit',
                body: 'Editing or removing dispatch lines can post RETURN transactions that put quantity back into FIFO using the original batch linkage where possible.',
              },
              {
                title: 'Print dispatch note',
                body: 'From list context menu, print using templates from Settings → Print format. Opens dispatch note print layout with job and material lines.',
              },
              {
                title: 'Delete',
                body: 'Deleting a dispatch reverses stock impact and removes linked transactions when no delivery note lock applies.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'warning',
            title: 'Variation jobs only',
            body: 'Stock-out must target a variation job. Parent contract jobs are containers — select the numbered variation that receives material cost.',
          },
        ],
      },
      {
        id: 'delivery-notes',
        title: 'Delivery notes',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Dispatch → Delivery note tab, Stock quick action “Delivery note”, or /stock/dispatch/delivery-note. A delivery note is a formal document of goods leaving toward a job site. It can be created standalone (custom lines only) or linked to existing dispatch transactions.',
          },
          {
            type: 'list',
            items: [
              'DISPATCH type — standard customer delivery tied to a variation job and source warehouse.',
              'SUBCONTRACT type — references another job (reference job) for subcontractor deliveries.',
              'Custom line items — add non-material rows (descriptions, qty, unit) for services or mixed loads.',
              'Delivery contact fields — person, phone, email printed on the note.',
              'Transit state — notes can show “in transit” until received on site when workflow uses target warehouse staging.',
              'Numbering — sequential delivery note numbers per company.',
            ],
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create',
                body: 'Select job, warehouses (source / transit when used), materials or custom items, and base notes for the printed document.',
              },
              {
                title: 'Print',
                body: 'Use print action with a delivery-note template. Letterhead, customer, job site, and supplier blocks come from print field mappings.',
              },
              {
                title: 'Link to dispatch',
                body: 'When built from existing dispatches, line quantities stay aligned with posted STOCK_OUT transactions for audit consistency.',
              },
            ],
          },
        ],
      },
      {
        id: 'production-log',
        title: 'Production log',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Production log (/stock/daily-quantity-log) and day editor (/stock/daily-quantity-log/[workDate]). Records daily output quantities per scheduled job — separate from material dispatch. Used for progress tracking and production reporting tied to the HR/work schedule.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Landing list',
                body: 'Shows work dates with PENDING or FINALIZED status, linked schedule, client display name, assignment count, and last submission time. Filter by status; create entry for a new date.',
              },
              {
                title: 'Day editor',
                body: 'Jobs appear from schedule assignments for that work date. Enter quantity per job line (area, length, units produced, etc. per schedule definition). Save drafts while editing.',
              },
              {
                title: 'Finalize',
                body: 'Finalize locks the day — requires stock.production_log.edit. Finalized days cannot be casually edited; used as official production record.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Schedule dependency',
            body: 'If no schedule exists for a date, create schedule planning first under Schedule & Attendance. Production log reads assignments from that schedule.',
          },
        ],
      },
      {
        id: 'job-budget',
        title: 'Job budget',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Job budget (/stock/job-budget) and per-job editor (/stock/job-budget/[id]). Plans material quantities and estimated cost per variation job before dispatch. List shows all variation jobs with budget snapshot status, line counts, planned value, and pricing mode.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Open a job budget',
                body: 'Click a variation row to open the budget editor. Add material lines manually: material, planned quantity, optional unit override, notes.',
              },
              {
                title: 'Apply formulas',
                body: 'Use “Add from formula” to generate lines from a template based on measured inputs (pool area, depth, etc.).',
              },
              {
                title: 'Pricing modes',
                body: 'Lines can value at FIFO, moving average, current material cost, or custom unit rate — affects planned total on the list.',
              },
              {
                title: 'Snapshots',
                body: 'Approved budget snapshots freeze a version for comparison. New edits supersede older snapshots for reporting.',
              },
              {
                title: 'Compare to dispatch',
                body: 'Job detail → Consumption costing compares budget lines to cumulative dispatch quantities and cost.',
              },
            ],
          },
        ],
      },
      {
        id: 'job-budget-formulas',
        title: 'Job budget — Formula templates',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Job budget → Formulas (/stock/job-budget/formulas), create (/formulas/new), edit (/formulas/[id]/edit). Reusable calculation templates that output material lines from numeric inputs.',
          },
          {
            type: 'list',
            items: [
              'Define input fields (e.g. surface area m², coat count) with labels and defaults.',
              'Map each output line to a material and quantity expression.',
              'Formulas are company-wide — maintain centrally, apply on any variation budget.',
              'Requires stock.formula.view to browse and stock.formula.edit to create or change.',
            ],
          },
        ],
      },
      {
        id: 'stock-batches',
        title: 'Stock batches (FIFO layers)',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Stock batches (/stock/stock-batches). Every goods receipt creates one or more FIFO layers per material and warehouse. Dispatch consumes quantityAvailable from oldest receivedDate first.',
          },
          {
            type: 'list',
            items: [
              'batchNumber — unique identifier, often tied to receipt.',
              'quantityReceived / quantityAvailable — original vs remaining after dispatches and transfers.',
              'unitCost / totalCost — layer cost used when this batch is consumed.',
              'receivedDate — FIFO sort key.',
              'supplier — copied from receipt header for traceability.',
              'Filter by material, warehouse, or search text to audit remaining stock.',
            ],
          },
        ],
      },
      {
        id: 'inventory-by-warehouse',
        title: 'Inventory by warehouse',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Inventory by warehouse (/stock/inventory-by-warehouse). Matrix view of each material’s on-hand quantity split across all warehouses, derived from live warehouse balance records (not just material.currentStock total).',
          },
          {
            type: 'list',
            items: [
              'Use before dispatch to confirm which location has stock.',
              'Identifies materials sitting in wrong warehouse vs default.',
              'Pairs with warehouse transfers when physical stock must move between locations.',
            ],
          },
        ],
      },
      {
        id: 'inter-company-transfers',
        title: 'Inter-company transfers',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Inter-company transfers (/stock/inter-company-transfers), new transfer (/inter-company-transfers/new). Moves FIFO stock from one AMFGI company to another. Requires transaction.transfer permission and super-admin or configured cross-company access.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create transfer',
                body: 'Select destination company, source warehouse, destination warehouse (or auto-create material in destination), material lines and quantities.',
              },
              {
                title: 'FIFO at source',
                body: 'Consumes batches at source company using FIFO; creates matching inbound batch at destination with transferred cost.',
              },
              {
                title: 'Material matching',
                body: 'Destination material matched by name; category, unit, and warehouse refs created if missing at destination.',
              },
              {
                title: 'History',
                body: 'Ledger lists past transfers with date, companies, materials, quantities, and user.',
              },
            ],
          },
        ],
      },
      {
        id: 'warehouse-transfers',
        title: 'Warehouse transfers',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Warehouse transfers (/stock/warehouse-transfers), new (/warehouse-transfers/new). Moves stock between warehouses within the same company without leaving the company books.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Post transfer',
                body: 'Pick source warehouse, destination warehouse, date, and material lines. FIFO consumed at source; new layer created at destination preserving unit cost.',
              },
              {
                title: 'Ledger',
                body: 'Searchable history of TRANSFER_OUT / TRANSFER_IN pairs with quantities and warehouses.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Permission split',
            body: 'stock.warehouse_transfer.view sees the ledger; stock.warehouse_transfer.transfer is required to post new transfers.',
          },
        ],
      },
      {
        id: 'issue-reconcile',
        title: 'Issue reconcile (non-stock)',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Stock → Issue reconcile (/stock/issue-reconcile), new entry (/issue-reconcile/new). Allocates NON_STOCK materials to variation jobs. These items skip normal FIFO dispatch but still need job costing allocation.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Dashboard',
                body: 'Shows materials with stock type NON_STOCK and outstanding unallocated quantities, plus paginated history of past reconcile entries.',
              },
              {
                title: 'New reconcile',
                body: 'Select variation job and lines: material, quantity, optional notes. May consume FIFO if material was misclassified or has batches; otherwise posts reconcile transaction without batch layers.',
              },
              {
                title: 'Delete entry',
                body: 'Removing history reverses job allocation when policy allows — blocked if downstream costing locked.',
              },
            ],
          },
        ],
      },
      {
        id: 'manual-adjustments',
        title: 'Manual adjustments',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Manual adjustments (/stock/manual-adjustments). Controlled stock corrections (damage, write-off, found stock, supplier claim) that require evidence and often approver sign-off before balances change.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Request adjustment',
                body: 'Add lines: material, warehouse, quantity change (negative reduces stock), reason. Attach evidence type (physical count, damage report, supplier claim, customer return, other), reference number, and notes.',
              },
              {
                title: 'Approval workflow',
                body: 'Non–super-admin requests create PENDING stock exception approval. Approver reviews policy summary (especially for large negative qty) and approves or rejects.',
              },
              {
                title: 'On approval',
                body: 'System consumes FIFO for reductions (oldest batches first) or creates inbound batch for increases. Posts audited STOCK_OUT or STOCK_IN linked to approval reference.',
              },
              {
                title: 'Super admin',
                body: 'Super admins may auto-approve on submit; high-impact negatives still log decision notes per company stock control settings.',
              },
            ],
          },
        ],
      },
      {
        id: 'stock-count-session',
        title: 'Stock count session',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Stock count session (/stock/count-session). Structured physical inventory count per warehouse with variance calculation and optional adjustment request.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create session',
                body: 'Pick warehouse, title, evidence reference (count sheet number), and notes. System seeds lines from current system quantities per material.',
              },
              {
                title: 'Enter counted qty',
                body: 'Walk the warehouse and fill counted quantity per line. Variance = counted − system.',
              },
              {
                title: 'Submit',
                body: 'Submit builds manual adjustment request lines from non-zero variances. Session moves to ADJUSTMENT_PENDING or ADJUSTMENT_APPROVED if auto-approved.',
              },
              {
                title: 'Statuses',
                body: 'DRAFT → ADJUSTMENT_PENDING → ADJUSTMENT_APPROVED or ADJUSTMENT_REJECTED. Revisions snapshot each save for audit.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Permissions',
            body: 'stock.count_session.view to open sessions; stock.count_session.edit to enter counts and submit.',
          },
        ],
      },
      {
        id: 'stock-integrity',
        title: 'Stock integrity',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Stock → Stock integrity (/stock/integrity). Reconciliation report comparing three views of the same material: company-level currentStock, sum of warehouse balances, and sum of open FIFO batch quantityAvailable.',
          },
          {
            type: 'list',
            items: [
              'Materials with exceptions — count shown on Stock hub valuation panel.',
              'Exception types include warehouse mismatch, batch mismatch, negative batch, and negative warehouse balance.',
              'Filter all / exceptions only; search by material name.',
              'Resolve by posting warehouse transfers, manual adjustments, or correcting mis-posted transactions — then refresh.',
            ],
          },
          {
            type: 'callout',
            variant: 'warning',
            title: 'Month-end practice',
            body: 'Run integrity before closing periods. Company profile negative-evidence thresholds flag materials needing investigation notes.',
          },
        ],
      },
      {
        id: 'workflow-map',
        title: 'How stock items connect',
        blocks: [
          {
            type: 'paragraph',
            text: 'End-to-end flow for a typical variation job:',
          },
          {
            type: 'steps',
            items: [
              {
                title: '1. Setup',
                body: 'Master data → Material (STOCK) → Supplier → Goods receipt posts FIFO batch.',
              },
              {
                title: '2. Plan',
                body: 'Job budget (+ optional formula) sets planned material quantities and value.',
              },
              {
                title: '3. Issue',
                body: 'Dispatch consumes FIFO to variation job; delivery note documents physical movement.',
              },
              {
                title: '4. Progress',
                body: 'Production log records daily output from schedule (parallel track to materials).',
              },
              {
                title: '5. Control',
                body: 'Stock batches and inventory-by-warehouse audit layers; integrity catches drift; count session or manual adjustment corrects physical differences.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Related reports',
            body: 'Sidebar → Reports: stock valuation, stock adjustments, stock exceptions, supplier traceability, job profitability. These read the same transaction and batch data documented above.',
          },
        ],
      },
    ],
  },
  {
    slug: 'customers',
    title: 'Customers',
    eyebrow: 'CRM & contracts',
    description:
      'Maintain customer directory, contacts, compliance fields, import/export, and link customers to jobs and stock activity.',
    appHref: '/customers',
    order: 3,
    relatedSlugs: ['jobs', 'company-setup'],
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            text: 'Customers holds your client directory for the active company. Each customer can have multiple contacts, trade license and TRN fields, active/inactive status, and an external party ID when synced from integration or party lists API.',
          },
        ],
      },
      {
        id: 'directory',
        title: 'Customer directory',
        blocks: [
          {
            type: 'steps',
            items: [
              {
                title: 'Browse and filter',
                body: 'Use search and active/inactive filters. Pagination options are remembered per user.',
              },
              {
                title: 'Create or edit',
                body: 'Open the form modal to set name, contacts, address, and compliance fields. Multiple contacts support site vs accounts roles.',
              },
              {
                title: 'Import and export',
                body: 'Import from spreadsheet templates or export the current list to XLSX for offline review.',
              },
            ],
          },
        ],
      },
      {
        id: 'source-modes',
        title: 'Local vs external customers',
        blocks: [
          {
            type: 'paragraph',
            text: 'Company profile customer source mode controls whether you only maintain customers inside AMFGI or also accept integration upserts and party-list sync. External customers show a source badge; edits may be restricted when EXTERNAL_ONLY.',
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Integration API',
            body: 'POST /api/integrations/customers/upsert matches on externalPartyId. Jobs synced later reference customerExternalId to avoid duplicates.',
          },
        ],
      },
      {
        id: 'jobs-link',
        title: 'Relationship to jobs',
        blocks: [
          {
            type: 'paragraph',
            text: 'Every variation job belongs to one customer. Parent contract jobs group variations under one customer for reporting. From the customer list you can inspect linked jobs and jump to Customers → Jobs for full job management.',
          },
        ],
      },
    ],
  },
  {
    slug: 'jobs',
    title: 'Jobs',
    eyebrow: 'Contracts & variations',
    description:
      'Parent contracts, variation jobs, statuses, imports, budgets, dispatch costing, and integration with project management systems.',
    appHref: '/customers/jobs',
    order: 4,
    relatedSlugs: ['customers', 'stock'],
    sections: [
      {
        id: 'overview',
        title: 'Job model',
        blocks: [
          {
            type: 'paragraph',
            text: 'Jobs are split into parent contracts and variation jobs. The parent holds customer-level reporting context (project name, site, quotation/LPO references). Variations hold operational detail — budgets, dispatch, production log, and costing.',
          },
          {
            type: 'list',
            items: [
              'Parent job — container for one customer contract.',
              'Variation job — numbered suffix (e.g. JOB-001-1) used for stock and costing.',
              'Provisional jobs — promoted to full variations when scope is confirmed.',
              'Statuses — Active, Completed, On hold, Cancelled.',
            ],
          },
        ],
      },
      {
        id: 'listing',
        title: 'Jobs list',
        blocks: [
          {
            type: 'paragraph',
            text: 'Customers → Jobs shows paginated variations with filters for customer, status, and parent/variation scope. Quick actions support edit, promote provisional jobs, import parent or variation sheets, and export.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Create a job',
                body: 'Use the job form to pick customer, parent (if variation), dates, site, and commercial references.',
              },
              {
                title: 'Job detail',
                body: 'Open a job for overview, linked budget, consumption costing, and cost engine views when permitted.',
              },
            ],
          },
        ],
      },
      {
        id: 'integration',
        title: 'External & hybrid jobs',
        blocks: [
          {
            type: 'paragraph',
            text: 'When job source mode is HYBRID or EXTERNAL_ONLY, jobs can arrive via integration upsert using externalJobId and parentExternalJobId. AMFGI matches customers by externalPartyId and creates missing links when allowed.',
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Developer reference',
            body: 'See /docs/api for job upsert payload fields and authentication headers.',
          },
        ],
      },
      {
        id: 'costing',
        title: 'Budget & costing',
        blocks: [
          {
            type: 'paragraph',
            text: 'Stock → Job budget plans material. Dispatch consumes stock against variations. Job detail pages show consumption costing and cost engine analysis comparing planned budget, issues, and production context.',
          },
        ],
      },
    ],
  },
  {
    slug: 'suppliers',
    title: 'Suppliers',
    eyebrow: 'Purchasing & receipt',
    description:
      'Supplier directory, contacts, import/export, and linkage to goods receipt and FIFO batches.',
    appHref: '/suppliers',
    order: 5,
    relatedSlugs: ['stock', 'company-setup'],
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            text: 'Suppliers mirrors the customer directory for vendors. Records support contacts, address, trade license, TRN, active flag, and external party ID for integrations.',
          },
        ],
      },
      {
        id: 'directory',
        title: 'Supplier directory',
        blocks: [
          {
            type: 'steps',
            items: [
              {
                title: 'Add suppliers',
                body: 'Create manually, import spreadsheet, or sync from party lists on the company profile when supplier source mode allows.',
              },
              {
                title: 'Edit and deactivate',
                body: 'Suppliers linked to stock batches cannot be hard-deleted; deactivate instead if they have history.',
              },
              {
                title: 'Export',
                body: 'Export filtered lists to XLSX for audits or sharing with finance.',
              },
            ],
          },
        ],
      },
      {
        id: 'goods-receipt',
        title: 'Used in goods receipt',
        blocks: [
          {
            type: 'paragraph',
            text: 'Every goods receipt line ties to a supplier (header level) and warehouse. Supplier traceability reports show which batches came from which vendor — useful for quality and warranty tracking.',
          },
        ],
      },
      {
        id: 'source-modes',
        title: 'Local vs external suppliers',
        blocks: [
          {
            type: 'paragraph',
            text: 'Supplier source mode on the company profile works like customers: INTERNAL_ONLY blocks party sync; HYBRID allows both manual entry and integration upsert via /api/integrations/suppliers/upsert.',
          },
        ],
      },
    ],
  },
  {
    slug: 'hr',
    title: 'HR module',
    eyebrow: 'People operations',
    description:
      'Complete reference for schedule planning, attendance, employees, leave, payroll, HR settings, and the employee self-service portal.',
    appHref: '/hr/schedule',
    order: 6,
    relatedSlugs: ['company-setup', 'stock'],
    sections: [
      {
        id: 'overview',
        title: 'HR module overview',
        blocks: [
          {
            type: 'paragraph',
            text: 'HR in AMFGI is organized into five sidebar groups: Schedule & Attendance, Employees, Leave Management, Payroll, and My HR (self-service for linked employees). The legacy /hr URL redirects to schedule planning. Daily operations flow from published schedules → attendance capture → leave approvals → payroll preview.',
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Recommended daily order',
            body: '1) Employee type timings (before period changes) → 2) Publish schedule day → 3) Mark day absences on schedule if needed → 4) Attendance day sheet: save, submit, approve → 5) Approve leave requests (syncs to attendance) → 6) Month-end: payroll preview and export.',
          },
        ],
      },
      {
        id: 'permissions',
        title: 'Permissions reference',
        blocks: [
          {
            type: 'paragraph',
            text: 'HR screens are gated by fine-grained permissions. Grant combinations matching each team’s responsibility — payroll settings should be limited to HR managers.',
          },
          {
            type: 'list',
            items: [
              'hr.schedule.view / hr.schedule.edit / hr.schedule.publish — Schedule list and day editor.',
              'hr.attendance.view / hr.attendance.edit / hr.attendance.approve — Attendance overview, day sheet, employee month grid, reports.',
              'hr.employee.view / hr.employee.edit — Employee directory and profile edits.',
              'hr.document.* / hr.document_type.* — Employee files and document type catalog.',
              'hr.leave.view / hr.leave.approve / hr.leave.edit / hr.leave.delete — Leave inbox and balances.',
              'hr.payroll.settings — Leave types, pay types, salary structure, components, holidays.',
              'hr.payroll.compensation — Payroll preview.',
              'hr.compensation.* — View/edit compensation records on employee profiles.',
              'hr.visa.* — Visa & contract tab on employee profile.',
              'hr.account_access.* — Link portal login to employee record.',
              'hr.settings.employee_types / hr.settings.expertise_catalog / hr.settings.document_types — Catalog settings.',
            ],
          },
        ],
      },
      {
        id: 'schedule-planning',
        title: 'Schedule planning',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Schedule & Attendance → Schedule planning (/hr/schedule). Month calendar listing every work date with schedule status, assignment counts, and attendance readiness badges.',
          },
          {
            type: 'list',
            items: [
              'DRAFT — schedule created but not yet published; editable freely.',
              'PUBLISHED — visible to operations; attendance sheets can be built from assignments.',
              'LOCKED — frozen day; prevents casual edits after sign-off.',
              'Badge “Needs attendance” — published day with zero saved attendance rows.',
              'Badge green — published day with attendance already started.',
            ],
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Pick month',
                body: 'Use month navigator or ?month=YYYY-MM in the URL. Table lists each work date in the month.',
              },
              {
                title: 'Create schedule day',
                body: 'Click create, pick work date, confirm. Opens the day editor for that date.',
              },
              {
                title: 'Open existing day',
                body: 'Click a row to open /hr/schedule/[workDate] for full planning UI.',
              },
            ],
          },
        ],
      },
      {
        id: 'schedule-day',
        title: 'Schedule day editor',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: /hr/schedule/[workDate]. The main planning canvas: assign jobs, workers, drivers, teams, shifts, and trip details for one work date. Supports drag-and-drop reordering, multi-assign workers, live collaboration presence, and print layouts for field distribution.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Add jobs',
                body: 'Search variation jobs and add to the day. Job rows show customer, site, and project context from the job record.',
              },
              {
                title: 'Assign employees',
                body: 'Drag from worker pool or use pickers to assign office staff, drivers, hybrid staff, or labour workers. Team columns group workers under team leaders with optional driver slots.',
              },
              {
                title: 'Shift & timing',
                body: 'Set shift start/end, break window, and per-row time entries. Employee type timings provide defaults (basic hours per day, duty windows).',
              },
              {
                title: 'Day absences',
                body: 'Mark employees absent on the schedule before attendance — reduces manual cleanup on the attendance sheet.',
              },
              {
                title: 'Publish',
                body: 'Requires hr.schedule.publish. Validation warns on low-hour teams or incomplete rows. Published schedules feed attendance day sheet assignments and production log job list.',
              },
              {
                title: 'Print',
                body: 'Print work schedule using templates from Settings → Print format. Supports multi-assign worker numbering for driver trip plans.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Production log link',
            body: 'Jobs scheduled for a date appear in Stock → Production log for that work date after the schedule exists.',
          },
        ],
      },
      {
        id: 'attendance-management',
        title: 'Attendance management',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Schedule & Attendance → Attendance management (/hr/attendance). Month overview of published schedule days with attendance progress — which days need data entry vs already saved.',
          },
          {
            type: 'list',
            items: [
              'Links each row to the schedule day and attendance day sheet.',
              'Shows saved vs pending status per work date.',
              'Jump to create attendance when schedule is published but sheet empty.',
              'Cross-link back to schedule list for the same month.',
            ],
          },
        ],
      },
      {
        id: 'attendance-day-sheet',
        title: 'Attendance day sheet',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: /hr/attendance/create?workDate=YYYY-MM-DD. Grid editor for one work date: one row per scheduled employee with status, job assignment, check-in/out, break, basic hours, overtime, and leave type when applicable.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Load from schedule',
                body: 'Assignments seed from published schedule — job, site, team leader, drivers pre-filled where configured.',
              },
              {
                title: 'Edit rows',
                body: 'Statuses include Present, Absent, Leave, Half day, and non-working patterns. Leave rows pick leave type (annual, sick, emergency, etc.). Time cells use Dubai wall-time helpers for shift math.',
              },
              {
                title: 'Save draft',
                body: 'Requires hr.attendance.edit. Saves rows with workflowStatus DRAFT — visible in preview warnings but not counted in payroll.',
              },
              {
                title: 'Submit day',
                body: 'Locks draft for supervisor review; moves workflow toward approval queue.',
              },
              {
                title: 'Approve day',
                body: 'Requires hr.attendance.approve. APPROVED rows count in payroll preview and monthly reports.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'warning',
            title: 'Payroll impact',
            body: 'Only APPROVED attendance rows are included in payroll preview. ABSENT status deducts pay per pay type rules; paid leave types do not deduct when configured.',
          },
        ],
      },
      {
        id: 'attendance-employee',
        title: 'Employee attendance (month grid)',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Schedule & Attendance → Employee attendance (/hr/attendance/employee). Edit one employee’s full month in a calendar grid instead of a single day sheet — useful for office staff monthly patterns or corrections across dates.',
          },
          {
            type: 'list',
            items: [
              'Pick employee and month; grid shows each day with status and hours.',
              'Same draft / submit / approve workflow as day sheet.',
              'Undo/redo support for bulk edits before save.',
              'Validation highlights rows missing required fields before submit.',
            ],
          },
        ],
      },
      {
        id: 'attendance-reports',
        title: 'Monthly attendance reports',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: /hr/reports/attendance (summary list) and /hr/reports/attendance/builder (custom column layout). Aggregates approved attendance per employee for a selected month.',
          },
          {
            type: 'list',
            items: [
              'Per-employee totals: present, absent, leave, paid/unpaid leave, half days, worked hours, OT hours.',
              'Drill into daily entries with job number, location, check times, late/early minutes.',
              'Builder: choose columns, formats, and save presets for recurring exports.',
              'Signature sheet print support for field sign-off (separate print route).',
            ],
          },
        ],
      },
      {
        id: 'employees',
        title: 'Employees directory',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Employees → Employees (/hr/employees). Searchable directory with table or card grid view, status filters (Active, On leave, Suspended, Exited), import/export, and quick stats.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Browse',
                body: 'Search by name, code, or metadata. Pagination and view mode (table/grid) persist per browser.',
              },
              {
                title: 'Add employee',
                body: '/hr/employees/new — wizard for core identity, employment type, contact, and workforce profile.',
              },
              {
                title: 'Open profile',
                body: '/hr/employees/[id] — full employee record (see next section).',
              },
              {
                title: 'Import / export',
                body: 'Bulk import from spreadsheet template; export selected fields for audits or WPS preparation.',
              },
            ],
          },
          {
            type: 'list',
            items: [
              'Employee types: OFFICE_STAFF, HYBRID_STAFF, DRIVER, LABOUR_WORKER — affects schedule defaults and pay rules.',
              'Status ON_LEAVE syncs when leave approved; EXITED employees hidden from schedule pickers.',
              'Compensation column visible only with hr.compensation.view.',
            ],
          },
        ],
      },
      {
        id: 'employee-profile',
        title: 'Employee profile',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: /hr/employees/[id]. Tabbed profile for everything about one person.',
          },
          {
            type: 'list',
            items: [
              'Overview — legal name, preferred name, code, nationality, DOB, contacts, emergency contacts, employment dates, employee type, expertise tags, photo, workforce profile extension.',
              'Visa & Contract — visa periods with sponsor, job title, contract windows (requires hr.visa.view).',
              'Documents — upload scans with document type, expiry tracking, and alerts for expiring documents.',
              'Compensation — pay type, monthly basic, allowance, daily rate, effective dates, history (requires hr.compensation.view/edit).',
              'Account access — link User account for portal login and Google sign-in (requires hr.account_access.*).',
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Portal link',
            body: 'When a user account is linked, the employee sees My HR at /me for profile, attendance, leave requests, and documents.',
          },
        ],
      },
      {
        id: 'employment-options',
        title: 'Employment options',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Employees → Employment options (/hr/settings/employment-options). Company catalogs for dropdown fields used on employee profiles: departments, designations, workforce roles, visa sponsors, banks, and similar meta options.',
          },
          {
            type: 'list',
            items: [
              'Each kind is a separate section — add, rename, or deactivate options.',
              'Requires hr.employee.edit.',
              'Options appear in EmployeeMetaSelect pickers across HR forms.',
            ],
          },
        ],
      },
      {
        id: 'employee-type-timings',
        title: 'Employee type timings',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Employees → Employee type timings (/hr/settings/employee-types). Defines default duty windows and basicHoursPerDay per employee type (office, driver, hybrid, worker).',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Configure before a period',
                body: 'Update timings before Ramadan, summer hours, or policy changes — e.g. 7h basic day then revert to 9h.',
              },
              {
                title: 'Attendance snapshot',
                body: 'basicHours is snapshotted onto each attendance row when saved — later timing changes do not retroactively alter past rows.',
              },
            ],
          },
        ],
      },
      {
        id: 'expertise-catalog',
        title: 'Expertise catalog',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Employees → Expertise catalog (/hr/settings/expertises). Skills and trade labels (fiberglass, welding, driving, etc.) tagged on employee profiles for schedule filtering and reporting.',
          },
        ],
      },
      {
        id: 'document-types',
        title: 'Document types',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Employees → Document types (/hr/settings/document-types). Templates for employee file categories: passport, visa, labour card, driving license, etc. Each type can require expiry date and renewal reminders.',
          },
          {
            type: 'list',
            items: [
              'hr.document_type.view to browse; hr.settings.document_types or create/edit permissions to manage.',
              'Dashboard alerts surface expiring documents for HR follow-up.',
            ],
          },
        ],
      },
      {
        id: 'leave-management',
        title: 'Leave management',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Leave Management → Leave management (/hr/leave). HR inbox for all leave requests with pending, approved, and historical filters.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Review request',
                body: 'See employee, leave type, date range, day count, reason, and current balance when type deducts from entitlement.',
              },
              {
                title: 'Approve',
                body: 'Requires hr.leave.approve. Creates or updates attendance rows as DRAFT leave entries on affected dates; syncs schedule absences where configured.',
              },
              {
                title: 'Reject or cancel',
                body: 'Adds review note; does not consume balance. HR can edit or delete with hr.leave.edit / hr.leave.delete.',
              },
              {
                title: 'HR-initiated leave',
                body: 'Create leave on behalf of employee from the same screen when hr.leave.edit granted.',
              },
            ],
          },
          {
            type: 'callout',
            variant: 'note',
            title: 'Employee submissions',
            body: 'Employees submit from My HR → My Leave (/me/leave). Approved requests appear here and in attendance.',
          },
        ],
      },
      {
        id: 'leave-balances',
        title: 'Leave balances',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Leave Management → Leave balances (/hr/leave/balances). Per-employee, per-year entitlement tracking for leave types that deduct from balance (typically annual leave).',
          },
          {
            type: 'list',
            items: [
              'Fields: entitlement days, used days, manual adjustments, remaining days.',
              'Allocation basis follows leave type rules (hire date vs oldest visa anchor).',
              'Approving annual or one-day leave consumes balance unless override approve used.',
              'Probation and rollover rules come from leave type configuration.',
            ],
          },
        ],
      },
      {
        id: 'leave-types',
        title: 'Leave types (settings)',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Leave Management → Leave types (/hr/settings/leave-types). Configure company leave policies. Requires hr.payroll.settings.',
          },
          {
            type: 'list',
            items: [
              'Name, code, description, active flag, sort order.',
              'Entitlement days and allocation basis (hire date, visa anchor, etc.).',
              'Probation gate — block requests until probation complete.',
              'countsAsPaidLeave — affects payroll absence deduction logic.',
              'deductFromBalance — whether approval reduces entitlement bucket.',
              'rolloverUnusedLeave — carry forward unused days to next year.',
              'hideFromEmployeePortal — HR-only leave types.',
              'Pay tiers — graduated pay percent by day range within one leave spell (e.g. full pay days 1–15, half pay thereafter).',
            ],
          },
        ],
      },
      {
        id: 'payroll-preview',
        title: 'Payroll preview',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Payroll → Payroll preview (/hr/payroll/preview). Live calculation for a calendar month before locking payroll. Requires hr.payroll.compensation.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Select month',
                body: 'Picker defaults to current month. Loads all active employees with compensation effective in that month.',
              },
              {
                title: 'Review rows',
                body: 'Each row shows gross, pay type, basic/OT hours, allowances, salary component earnings/deductions, and health-check warnings (caps exceeded, missing compensation, draft attendance).',
              },
              {
                title: 'Drill into days',
                body: 'Expand employee to see per-day breakdown: status, hours, rates, allowance, component lines.',
              },
              {
                title: 'Export',
                body: 'Download XLSX of included and skipped employees for finance review.',
              },
            ],
          },
        ],
      },
      {
        id: 'pay-types',
        title: 'Pay types',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: /hr/settings/pay-types (linked from Salary structure UI). Defines how attendance maps to pay: office monthly, daily worker, driver trip, hybrid schemes. Requires hr.payroll.settings.',
          },
          {
            type: 'list',
            items: [
              'Four seeded system templates are read-only — clone to customize for your company.',
              'Custom types: edit OT percent, basic hour rules, allowance handling, absence deduction mode.',
              'Cannot delete a pay type assigned to active employee compensation.',
              'Assigned on employee profile → Compensation tab with effective-from date.',
            ],
          },
        ],
      },
      {
        id: 'salary-structure',
        title: 'Salary structure & components',
        blocks: [
          {
            type: 'paragraph',
            text: 'Routes: Payroll → Salary structure (/hr/settings/salary-structure) and Salary components (/hr/settings/salary-component). Optional recurring earnings and deductions beyond basic pay type calculation.',
          },
          {
            type: 'list',
            items: [
              'Salary structure — assign component packages or defaults tied to pay types.',
              'Salary components — define codes (housing, transport, loan repayment) as fixed monthly earning or deduction.',
              'Allowance types (/hr/settings/allowance-types) — catalog for allowance line labels on compensation.',
              'Components flow into payroll preview day lines and salary breakdowns.',
            ],
          },
        ],
      },
      {
        id: 'company-holidays',
        title: 'Company holidays',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: Payroll → Company holidays (/hr/settings/company-holidays). Mark public holidays and company shutdown days. Affects attendance expectations and pay type holiday pay structure resolution.',
          },
          {
            type: 'list',
            items: [
              'Define date, label, and whether paid for each workforce category.',
              'Holiday pay may use dedicated tiers on pay types — configure before month close.',
              'Schedule and attendance rows on holiday dates follow your published plan.',
            ],
          },
        ],
      },
      {
        id: 'my-hr',
        title: 'My HR (employee portal)',
        blocks: [
          {
            type: 'paragraph',
            text: 'Route: My HR (/me) — visible only when the signed-in user is linked to an employee record. Self-service without full ERP permissions.',
          },
          {
            type: 'list',
            items: [
              '/me — profile summary and photo.',
              '/me/attendance — personal attendance history view.',
              '/me/leave — submit leave requests, track status, see balances for portal-visible types.',
              '/me/documents — view own uploaded documents and expiry status.',
            ],
          },
          {
            type: 'callout',
            variant: 'tip',
            title: 'Linking accounts',
            body: 'HR sets up portal access from employee profile → Account access tab. User must belong to the same company.',
          },
        ],
      },
      {
        id: 'workflow-map',
        title: 'How HR modules connect',
        blocks: [
          {
            type: 'paragraph',
            text: 'Typical month lifecycle:',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Setup',
                body: 'Employees, pay types, compensation, leave types, employee type timings, company holidays.',
              },
              {
                title: 'Daily ops',
                body: 'Publish schedule → capture attendance → approve days → employees submit leave → HR approves leave.',
              },
              {
                title: 'Reporting',
                body: 'Monthly attendance reports for supervisors; production log reads schedule jobs (Stock module).',
              },
              {
                title: 'Payroll close',
                body: 'Payroll preview (approved attendance only) → export Excel for finance review.',
              },
            ],
          },
        ],
      },
    ],
  },
];

export const USER_GUIDE_BY_SLUG = Object.fromEntries(
  USER_GUIDE_PAGES.map((page) => [page.slug, page]),
) as Record<string, UserGuidePage>;

export function getUserGuidePage(slug: string): UserGuidePage | undefined {
  return USER_GUIDE_BY_SLUG[slug];
}
