
import {
  resolveVariationImportRecordKey,
  variationDuplicateInFileMessage,
} from '@/lib/import-export/jobVariationFields';
import type { MappedImportRow } from '@/lib/import-export/types';

function row(overrides: Record<string, string | number>): MappedImportRow {
  return { __rowIndex: 0, __errors: [], ...overrides };
}

describe('resolveVariationImportRecordKey', () => {
  const parents = {
    byId: new Map([['parent-1', 'JOB-1001']]),
    byNumber: new Map([['job-1001', 'JOB-1001']]),
  };

  it('allows multiple rows with the same parent when suffixes differ', () => {
    const a = resolveVariationImportRecordKey(
      row({ parent_job_number: 'JOB-1001', variation_suffix: '1' }),
      parents
    );
    const b = resolveVariationImportRecordKey(
      row({ parent_job_number: 'JOB-1001', variation_suffix: '2' }),
      parents
    );
    expect(a).toBe('job-1001-1');
    expect(b).toBe('job-1001-2');
    expect(a).not.toBe(b);
  });

  it('flags duplicate when parent and suffix match', () => {
    const a = resolveVariationImportRecordKey(
      row({ parent_job_number: 'JOB-1001', variation_suffix: '1' }),
      parents
    );
    const b = resolveVariationImportRecordKey(
      row({ parent_job_number: 'JOB-1001', variation_suffix: '1' }),
      parents
    );
    expect(a).toBe(b);
  });

  it('uses full job number when provided', () => {
    const key = resolveVariationImportRecordKey(row({ job_number: 'JOB-1001-3' }), parents);
    expect(key).toBe('job-1001-3');
  });

  it('formats duplicate message with parent and suffix', () => {
    const msg = variationDuplicateInFileMessage(
      row({ parent_job_number: 'JOB-1001', variation_suffix: '2' })
    );
    expect(msg).toBe('JOB-1001 / suffix 2');
  });
});
