# API HR, Jobs, and Materials

> 69 nodes · cohesion 0.05

## Key Concepts

- **PUT()** (79 connections) — `app/api/warehouses/[id]/route.ts`
- **DELETE()** (75 connections) — `app/api/warehouses/[id]/route.ts`
- **loadJobItem()** (9 connections) — `app/api/jobs/[id]/items/[itemId]/progress-entries/route.ts`
- **canAccess()** (9 connections) — `app/api/media/[id]/route.ts`
- **canManageDrive()** (7 connections) — `app/api/settings/google-drive/status/route.ts`
- **loadFormula()** (5 connections) — `app/api/job-costing/formulas/[id]/route.ts`
- **loadProgressEntry()** (5 connections) — `app/api/jobs/[id]/items/[itemId]/progress-entries/[entryId]/route.ts`
- **route.ts** (4 connections) — `app/api/job-costing/formulas/[id]/route.ts`
- **route.ts** (4 connections) — `app/api/jobs/[id]/items/[itemId]/route.ts`
- **normalizePreferenceKey()** (4 connections) — `app/api/me/table-preferences/[key]/route.ts`
- **route.ts** (4 connections) — `app/api/settings/google-drive/status/route.ts`
- **loadSession()** (4 connections) — `app/api/stock-count-sessions/[id]/route.ts`
- **route.ts** (4 connections) — `app/api/job-costing/formulas/[id]/route.ts`
- **route.ts** (4 connections) — `app/api/jobs/[id]/items/[itemId]/route.ts`
- **route.ts** (4 connections) — `app/api/settings/google-drive/status/route.ts`
- **route.ts** (3 connections) — `app/api/customers/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/hr/document-types/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/items/[itemId]/progress-entries/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/items/[itemId]/progress-entries/[entryId]/route.ts`
- **route.ts** (3 connections) — `app/api/materials/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/me/table-preferences/[key]/route.ts`
- **route.ts** (3 connections) — `app/api/roles/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/stock-count-sessions/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/suppliers/[id]/route.ts`
- *... and 44 more nodes in this community*

## Relationships

- [[API Reports, Materials, and HR]] (48 shared connections)
- [[API HR, User, and Jobs]] (14 shared connections)
- [[API HR, Materials, and Upload]] (14 shared connections)
- [[API Media, Companies, and Materials]] (9 shared connections)
- [[Lib, API, and Auth]] (5 shared connections)
- [[Lib, Scripts, and Settings]] (4 shared connections)
- [[Lib Utils and Job Costing]] (4 shared connections)
- [[Lib Utils]] (4 shared connections)
- [[Lib Utils, Job Costing, and Stock]] (3 shared connections)
- [[Lib, Job Costing, and Job Item Assignments]] (3 shared connections)
- [[Lib and Party Contacts]] (2 shared connections)
- [[Lib, Jobs, and Job Required Expertises]] (2 shared connections)

## Source Files

- `app/api/categories/[id]/route.ts`
- `app/api/companies/[id]/route.ts`
- `app/api/customers/[id]/route.ts`
- `app/api/hr/attendance/route.ts`
- `app/api/hr/document-types/route.ts`
- `app/api/hr/employee-type-settings/route.ts`
- `app/api/hr/employees/[id]/portal-link/route.ts`
- `app/api/hr/schedule/[id]/absences/route.ts`
- `app/api/hr/schedule/[id]/assignments/route.ts`
- `app/api/hr/schedule/[id]/driver-logs/route.ts`
- `app/api/job-costing/formulas/[id]/route.ts`
- `app/api/jobs/[id]/items/[itemId]/progress-entries/[entryId]/route.ts`
- `app/api/jobs/[id]/items/[itemId]/progress-entries/route.ts`
- `app/api/jobs/[id]/items/[itemId]/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/materials/[id]/assembly/route.ts`
- `app/api/materials/[id]/route.ts`
- `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- `app/api/me/table-preferences/[key]/route.ts`
- `app/api/media/[id]/route.ts`

## Audit Trail

- EXTRACTED: 298 (86%)
- INFERRED: 47 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*