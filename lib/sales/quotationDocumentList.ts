export type QuotationDocumentRow = {
  id: string;
  typeId: string;
  typeName: string;
  fileName: string;
  mimeType: string;
  viewerUrl: string;
  note: string | null;
  carriedToPurchaseOrder: boolean;
  createdAt: string;
};

export function latestIdsByType(rows: Array<{ id: string; typeId: string; createdAt: string | Date }>): string[] {
  const sorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of sorted) {
    if (seen.has(row.typeId)) continue;
    seen.add(row.typeId);
    ids.push(row.id);
  }
  return ids;
}

export function groupQuotationDocuments(files: QuotationDocumentRow[]) {
  const groups = new Map<string, { typeId: string; typeName: string; latestAt: string; files: QuotationDocumentRow[] }>();
  const sorted = [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const file of sorted) {
    const group = groups.get(file.typeId) ?? {
      typeId: file.typeId,
      typeName: file.typeName,
      latestAt: file.createdAt,
      files: [],
    };
    group.files.push(file);
    if (file.createdAt > group.latestAt) group.latestAt = file.createdAt;
    groups.set(file.typeId, group);
  }
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
