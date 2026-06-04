import type { ImportFieldDef } from '@/lib/import-export/types';

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function autoMapHeader(header: string, fields: ImportFieldDef[]): string {
  const normalized = normalizeHeader(header);
  for (const field of fields) {
    if (normalizeHeader(field.label) === normalized || normalizeHeader(field.key) === normalized) {
      return field.key;
    }
    for (const alias of field.aliases ?? []) {
      if (normalizeHeader(alias) === normalized) return field.key;
    }
  }
  return '__skip__';
}

export function buildInitialColumnMapping(headers: string[], fields: ImportFieldDef[]) {
  const mapping: Record<number, string> = {};
  const autoMapped = new Set<number>();
  headers.forEach((header, idx) => {
    const mapped = autoMapHeader(header, fields);
    mapping[idx] = mapped;
    if (mapped !== '__skip__') autoMapped.add(idx);
  });
  return { mapping, autoMapped };
}
