export type ImportFieldDef = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
};

export type MappedImportRow = {
  __rowIndex: number;
  __errors: string[];
  [key: string]: string | number | boolean | undefined | string[] | ImportFieldDef[] | number;
};

export type ImportPreviewRow<T extends MappedImportRow = MappedImportRow> = T & {
  __isDuplicate: boolean;
  __duplicateReason?: string;
  __action: 'update' | 'skip';
  __blocked?: boolean;
  __blockReason?: string;
};

export type InvalidImportRow<T extends MappedImportRow = MappedImportRow> = T & {
  __sourceValues: string[];
};

export type BulkImportResult = {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};
