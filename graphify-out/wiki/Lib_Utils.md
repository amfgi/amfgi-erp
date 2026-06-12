# Lib Utils

> 20 nodes · cohesion 0.21

## Key Concepts

- **route.ts** (27 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/adjust/route.ts`
- **route.ts** (26 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/cancel/route.ts`
- **route.ts** (14 connections) — `app/api/reports/stock-exceptions/route.ts`
- **receiptCancellation.ts** (14 connections) — `lib/utils/receiptCancellation.ts`
- **parseReceiptCancellationMetadata()** (10 connections) — `lib/utils/receiptCancellation.ts`
- **GET()** (9 connections) — `app/api/reports/stock-exceptions/route.ts`
- **parseReceiptAdjustmentMetadata()** (9 connections) — `lib/utils/receiptCancellation.ts`
- **stockExceptionApproval.ts** (7 connections) — `lib/utils/stockExceptionApproval.ts`
- **upsertStockExceptionApproval()** (6 connections) — `lib/utils/stockExceptionApproval.ts`
- **sanitizeReason()** (5 connections) — `lib/utils/receiptCancellation.ts`
- **buildReceiptCancellationNotes()** (3 connections) — `lib/utils/receiptCancellation.ts`
- **buildReceiptAdjustmentNotes()** (3 connections) — `lib/utils/receiptCancellation.ts`
- **buildReceiptCancellationTransactionNote()** (3 connections) — `lib/utils/receiptCancellation.ts`
- **buildReceiptAdjustmentTransactionNote()** (3 connections) — `lib/utils/receiptCancellation.ts`
- **parseOverrideReason()** (2 connections) — `app/api/reports/stock-exceptions/route.ts`
- **uniqueStrings()** (2 connections) — `app/api/reports/stock-exceptions/route.ts`
- **AdjustReceiptSchema** (1 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/adjust/route.ts`
- **CancelReceiptSchema** (1 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/cancel/route.ts`
- **Tx** (1 connections) — `lib/utils/stockExceptionApproval.ts`
- **StockExceptionApprovalInput** (1 connections) — `lib/utils/stockExceptionApproval.ts`

## Relationships

- [[API Jobs, Reports, and Transactions]] (14 shared connections)
- [[Lib Utils]] (10 shared connections)
- [[API Materials, Me, and Stock Exception Approvals]] (9 shared connections)
- [[Tests Integration]] (8 shared connections)
- [[API and Lib]] (7 shared connections)
- [[API Transactions, Companies, and Delivery Notes]] (4 shared connections)
- [[Lib Stock and Utils]] (4 shared connections)
- [[API, Lib, and Auth]] (3 shared connections)
- [[API HR and Stock Exception Approvals]] (3 shared connections)
- [[Lib Utils and Stock Control]] (3 shared connections)
- [[Lib Stock and Warehouses]] (2 shared connections)
- [[Lib Dispatch Entry Revision, Utils, and Db]] (2 shared connections)

## Source Files

- `app/api/materials/receipt-history-entries/[receiptNumber]/adjust/route.ts`
- `app/api/materials/receipt-history-entries/[receiptNumber]/cancel/route.ts`
- `app/api/reports/stock-exceptions/route.ts`
- `lib/utils/receiptCancellation.ts`
- `lib/utils/stockExceptionApproval.ts`

## Audit Trail

- EXTRACTED: 147 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*