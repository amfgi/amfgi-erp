import { driveStoredUrlToOpenUrl } from '@/lib/utils/googleDriveUrl';
import type { QuotationDocumentFile } from '@/store/api/endpoints/sales';

export default function QuotationDocumentLinks({
  files,
  emptyLabel = 'No quotation documents.',
}: {
  files: Array<Pick<QuotationDocumentFile, 'id' | 'typeName' | 'fileName' | 'viewerUrl' | 'note'>>;
  emptyLabel?: string;
}) {
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <div key={file.id} className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{file.typeName}</p>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">{file.fileName}</p>
              {file.note ? <p className="mt-1 text-sm text-muted-foreground">{file.note}</p> : null}
            </div>
            <div className="flex shrink-0 gap-3 text-sm">
              <a href={driveStoredUrlToOpenUrl(file.viewerUrl) ?? file.viewerUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                View
              </a>
              <a href={`/api/sales/documents/${file.id}/download`} className="font-medium text-foreground underline-offset-2 hover:underline">
                Download
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
