# Lib Utils

> 20 nodes · cohesion 0.17

## Key Concepts

- **route.ts** (23 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- **receiptLineMetadata.ts** (13 connections) — `lib/utils/receiptLineMetadata.ts`
- **GET()** (10 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- **receiptLineMetadata.test.ts** (10 connections) — `__tests__/unit/receiptLineMetadata.test.ts`
- **parseReceiptLineMetadata()** (7 connections) — `lib/utils/receiptLineMetadata.ts`
- **DELETE()** (5 connections) — `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- **stripReceiptCancellationMarkers()** (4 connections) — `lib/utils/receiptCancellation.ts`
- **parseReceiptLineMetadataFromNotes()** (4 connections) — `lib/utils/receiptLineMetadata.ts`
- **stripReceiptLineMetadata()** (4 connections) — `lib/utils/receiptLineMetadata.ts`
- **buildStockBatchReceiptLineMeta()** (3 connections) — `lib/utils/receiptLineMetadata.ts`
- **parseMarkerNumber()** (3 connections) — `lib/utils/receiptLineMetadata.ts`
- **appendReceiptLineMetadata()** (3 connections) — `lib/utils/receiptLineMetadata.ts`
- **readReceiptLineFromMeta()** (2 connections) — `lib/utils/receiptLineMetadata.ts`
- **ReceiptLineDisplayMetadata** (1 connections) — `lib/utils/receiptLineMetadata.ts`
- **StockBatchReceiptLineMetaInput** (1 connections) — `lib/utils/receiptLineMetadata.ts`
- **EMPTY_METADATA** (1 connections) — `lib/utils/receiptLineMetadata.ts`
- **meta** (1 connections) — `__tests__/unit/receiptLineMetadata.test.ts`
- **parsed** (1 connections) — `__tests__/unit/receiptLineMetadata.test.ts`
- **legacyNotes** (1 connections) — `__tests__/unit/receiptLineMetadata.test.ts`
- **notes** (1 connections) — `__tests__/unit/receiptLineMetadata.test.ts`

## Relationships

- [[Lib and API]] (7 shared connections)
- [[API Materials, Reports, and Settings]] (5 shared connections)
- [[Lib Utils, Dispatch Entry Revision, and Db]] (5 shared connections)
- [[Lib Utils, Stock, and Warehouses]] (4 shared connections)
- [[Tests Integration]] (4 shared connections)
- [[API Categories, Transactions, and Units]] (3 shared connections)
- [[API, Lib, and Auth]] (1 shared connections)
- [[API and Lib]] (1 shared connections)
- [[Lib Import Export and Utils]] (1 shared connections)
- [[API, Lib, and Tests]] (1 shared connections)

## Source Files

- `__tests__/unit/receiptLineMetadata.test.ts`
- `app/api/materials/receipt-history-entries/[receiptNumber]/route.ts`
- `lib/utils/receiptCancellation.ts`
- `lib/utils/receiptLineMetadata.ts`

## Audit Trail

- EXTRACTED: 98 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*