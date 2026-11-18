import { groupQuotationDocuments, latestIdsByType, type QuotationDocumentRow } from '@/lib/sales/quotationDocumentList';

function row(id: string, typeId: string, createdAt: string, typeName = typeId): QuotationDocumentRow {
  return {
    id,
    typeId,
    typeName,
    fileName: `${id}.pdf`,
    mimeType: 'application/pdf',
    viewerUrl: `https://drive.example/${id}`,
    note: null,
    carriedToPurchaseOrder: false,
    createdAt,
  };
}

describe('quotation document list', () => {
  it('keeps the newest file of each type and ignores types with no file', () => {
    const ids = latestIdsByType([
      { id: 'old-a', typeId: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new-a', typeId: 'a', createdAt: '2026-02-01T00:00:00.000Z' },
      { id: 'only-b', typeId: 'b', createdAt: '2026-01-15T00:00:00.000Z' },
    ]);
    expect(ids.sort()).toEqual(['new-a', 'only-b']);
    expect(latestIdsByType([])).toEqual([]);
  });

  it('groups by type with the newest file first and the most recently used type first', () => {
    const groups = groupQuotationDocuments([
      row('old-a', 'a', '2026-01-01T00:00:00.000Z', 'Drawing'),
      row('new-b', 'b', '2026-03-01T00:00:00.000Z', 'Scope'),
      row('new-a', 'a', '2026-02-01T00:00:00.000Z', 'Drawing'),
    ]);
    expect(groups.map((group) => group.typeName)).toEqual(['Scope', 'Drawing']);
    expect(groups[1]?.files.map((file) => file.id)).toEqual(['new-a', 'old-a']);
  });
});
