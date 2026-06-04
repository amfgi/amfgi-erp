import type { BulkImportResult } from '@/lib/import-export/types';

const DEFAULT_CHUNK_SIZE = 25;

export type BulkImportChunkPayload = {
  newRows: unknown[];
  updateRows: unknown[];
};

export async function runChunkedBulkImport(
  payload: BulkImportChunkPayload,
  importChunk: (chunk: BulkImportChunkPayload) => Promise<BulkImportResult>,
  options?: {
    chunkSize?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<BulkImportResult> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const total = payload.newRows.length + payload.updateRows.length;
  let processed = 0;

  const aggregate: BulkImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: [],
  };

  const report = () => options?.onProgress?.(processed, total);

  for (let i = 0; i < payload.newRows.length; i += chunkSize) {
    const newRows = payload.newRows.slice(i, i + chunkSize);
    const result = await importChunk({ newRows, updateRows: [] });
    aggregate.created += result.created;
    aggregate.updated += result.updated;
    aggregate.skipped += result.skipped;
    aggregate.warnings.push(...result.warnings);
    processed += newRows.length;
    report();
  }

  for (let i = 0; i < payload.updateRows.length; i += chunkSize) {
    const updateRows = payload.updateRows.slice(i, i + chunkSize);
    const result = await importChunk({ newRows: [], updateRows });
    aggregate.created += result.created;
    aggregate.updated += result.updated;
    aggregate.skipped += result.skipped;
    aggregate.warnings.push(...result.warnings);
    processed += updateRows.length;
    report();
  }

  return aggregate;
}
