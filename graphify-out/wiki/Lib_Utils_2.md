# Lib Utils

> 33 nodes · cohesion 0.12

## Key Concepts

- **route.ts** (26 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- **route.ts** (19 connections) — `app/api/materials/receipt-history-entries/route.ts`
- **receiptLineMetadata.ts** (14 connections) — `lib/utils/receiptLineMetadata.ts`
- **GET()** (12 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- **receiptHeaderMetadata.ts** (12 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **receiptHeaderMetadata.test.ts** (10 connections) — `__tests__/unit/receiptHeaderMetadata.test.ts`
- **receiptLineMetadata.test.ts** (10 connections) — `__tests__/unit/receiptLineMetadata.test.ts`
- **parseReceiptHeaderMetadata()** (7 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **parseReceiptLineMetadata()** (7 connections) — `lib/utils/receiptLineMetadata.ts`
- **resolveReceiptBillAmount()** (5 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **buildStockBatchReceiptHeaderMeta()** (5 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **stripReceiptCancellationMarkers()** (4 connections) — `lib/utils/receiptCancellation.ts`
- **buildStockBatchReceiptLineMeta()** (4 connections) — `lib/utils/receiptLineMetadata.ts`
- **parseReceiptLineMetadataFromNotes()** (4 connections) — `lib/utils/receiptLineMetadata.ts`
- **stripReceiptLineMetadata()** (4 connections) — `lib/utils/receiptLineMetadata.ts`
- **normalizeOptionalString()** (3 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **normalizeOptionalNumber()** (3 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **mergeStockBatchReceiptMeta()** (3 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **parseMarkerNumber()** (3 connections) — `lib/utils/receiptLineMetadata.ts`
- **appendReceiptLineMetadata()** (3 connections) — `lib/utils/receiptLineMetadata.ts`
- **readReceiptLineFromMeta()** (2 connections) — `lib/utils/receiptLineMetadata.ts`
- **ReceiptHeaderMetadata** (1 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **EMPTY_HEADER** (1 connections) — `lib/utils/receiptHeaderMetadata.ts`
- **ReceiptLineDisplayMetadata** (1 connections) — `lib/utils/receiptLineMetadata.ts`
- **StockBatchReceiptLineMetaInput** (1 connections) — `lib/utils/receiptLineMetadata.ts`
- *... and 8 more nodes in this community*

## Relationships

- [[API Reports, Materials, and Transactions]] (12 shared connections)
- [[API and Lib]] (9 shared connections)
- [[Lib Utils, Dispatch Entry Revision, and Delivery Note Number]] (8 shared connections)
- [[API HR, Settings, and Stock Exception Approvals]] (3 shared connections)
- [[API Materials, Settings, and Stock Exception Approvals]] (3 shared connections)
- [[Tests Integration]] (3 shared connections)
- [[API, Lib, and Auth]] (2 shared connections)
- [[API Suppliers, Transactions, and Customers]] (2 shared connections)
- [[Lib Stock, Warehouses, and Utils]] (2 shared connections)
- [[Stock, Components, and Lib]] (1 shared connections)
- [[API HR, Stock, and Me]] (1 shared connections)

## Source Files

- `__tests__/unit/receiptHeaderMetadata.test.ts`
- `__tests__/unit/receiptLineMetadata.test.ts`
- `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- `app/api/materials/receipt-history-entries/route.ts`
- `lib/utils/receiptCancellation.ts`
- `lib/utils/receiptHeaderMetadata.ts`
- `lib/utils/receiptLineMetadata.ts`

## Audit Trail

- EXTRACTED: 172 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*