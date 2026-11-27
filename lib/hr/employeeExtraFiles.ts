const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
]);

export const EXTRA_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const EXTRA_FILE_MAX_COUNT = 10;

export function extraFileBaseName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() ?? '';
  return base.slice(0, 180);
}

export function extraFileExtension(fileName: string): string {
  const base = extraFileBaseName(fileName);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function isAllowedExtraFile(fileName: string): boolean {
  return ALLOWED_EXTENSIONS.has(extraFileExtension(fileName));
}

export function extraFileStorageName(fileName: string, uniqueKey: string): string {
  const extension = extraFileExtension(fileName);
  const base = extraFileBaseName(fileName);
  const stem = base.slice(0, base.length - extension.length - 1);
  const safeStem = stem.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
  return `${safeStem}-${uniqueKey}.${extension}`;
}

export function formatExtraFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
