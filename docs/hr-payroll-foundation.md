# HR payroll foundation — operations guide

This document describes how to use the payroll **foundation** features (pay types, compensation, leave, attendance snapshots). **Pay runs** (month finalize / payslip print) are temporarily disabled in the app; use payroll preview + Excel export instead.

## Recommended daily order

1. **Employee type timings** (`/hr/settings/employee-types`) — set `basicHoursPerDay` and duty windows *before* creating attendance for a period (e.g. Ramadan 7h, then back to 9h).
2. **Schedule** — publish the day; mark **day absences** on the schedule screen if needed.
3. **Attendance day sheet** — create or edit rows; save; **Submit day** then **Approve day** when ready.
4. **Leave** — employees submit via `/me/leave`; HR approves at `/hr/leave` (syncs to attendance as DRAFT leave rows).

## Pay types and compensation

- **Pay types** (`/hr/settings/pay-types`, requires `hr.payroll.settings`): four seeded **system** templates (read-only). Use **Add pay type** or **Clone to customize** for company-specific types; **Edit** / **Delete** custom types only (not assigned to any employee compensation).
- **Employee compensation** (employee profile → Compensation tab): assign pay type, monthly basic, allowance, daily rate, effective from date.

## Attendance fields used by payroll (later)

| Field | Purpose |
|-------|---------|
| `basicHours` | Snapshotted per row when created/saved |
| `leaveType` | ANNUAL, SICK, EMERGENCY, ONE_DAY when status is LEAVE |
| `workflowStatus` | Only APPROVED rows should count in payroll preview |
| `status` | ABSENT = unpaid deduction (office scheme); paid leave types do not deduct |

## Leave balance

HR sets annual entitlement per employee/year under **Leave → Annual balances**. Approving annual or one-day leave consumes balance unless HR uses override approve.

## Payroll preview

- **Route:** `/hr/payroll/preview` (requires `hr.payroll.compensation`).
- Uses **approved** attendance rows only for the selected month; draft rows are shown as a warning.
- Resolves the compensation record effective during that month and runs `calculatePayLine`.
- **Export Excel** downloads all rows (included and skipped) for the selected month.

## Pay runs (temporarily disabled)

Pay run list, finalize, pay-run detail, and payslip print routes/API return unavailable for now. DB tables remain for a later restore.

## WPS export (later)

Bank transfer (WPS) files need employee IBAN and bank fields on the employee profile — not in scope yet.

## Calculator library (developers)

`lib/hr/payroll/calculatePayLine.ts` implements the four seeded pay type modes. Preview builder: `lib/hr/payroll/buildPayPreview.ts`. Unit tests: `__tests__/lib/hr/payroll/calculatePayLine.test.ts`.

## Backfill script

After migrating schema, run:

```bash
npx tsx scripts/backfill-attendance-basic-hours.ts
```

Requires `DATABASE_URL` in the environment.
