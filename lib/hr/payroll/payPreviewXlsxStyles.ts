import type * as XLSXNS from 'xlsx-js-style';

type ExcelStyle = NonNullable<XLSXNS.CellObject['s']>;

const FONT = 'Calibri';
const BORDER_COLOR = 'CBD5E1';
const TEXT = '0F172A';
const MUTED = '475569';
const WHITE = 'FFFFFF';
const NAVY = '1E3A5F';
const SLATE = '334155';
const SECTION = 'E2E8F0';
const ZEBRA = 'F8FAFC';
const PENDING = 'FEF3C7';
const TOTALS = 'FEF3C7';
const LINK = '1D4ED8';
const OK = '166534';
const WARN = 'B45309';

const thinBorder = {
  top: { style: 'thin' as const, color: { rgb: BORDER_COLOR } },
  bottom: { style: 'thin' as const, color: { rgb: BORDER_COLOR } },
  left: { style: 'thin' as const, color: { rgb: BORDER_COLOR } },
  right: { style: 'thin' as const, color: { rgb: BORDER_COLOR } },
};

export const PAY_PREVIEW_XLSX_STYLES = {
  title: {
    font: { name: FONT, bold: true, sz: 14, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  titleValue: {
    font: { name: FONT, bold: true, sz: 12, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  metaLabel: {
    font: { name: FONT, bold: true, sz: 11, color: { rgb: NAVY } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  metaValue: {
    font: { name: FONT, sz: 11, color: { rgb: TEXT } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  metaMoney: {
    font: { name: FONT, bold: true, sz: 11, color: { rgb: TEXT } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  tableHeader: {
    font: { name: FONT, bold: true, sz: 11, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: SLATE } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: thinBorder,
  } satisfies ExcelStyle,
  data: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  dataAlt: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: ZEBRA } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  dataPending: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: PENDING } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  dataNumber: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  dataNumberAlt: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: ZEBRA } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  dataNumberPending: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: PENDING } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  section: {
    font: { name: FONT, bold: true, sz: 11, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: SECTION } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  kvLabel: {
    font: { name: FONT, bold: true, sz: 10, color: { rgb: MUTED } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  kvValue: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  kvMoney: {
    font: { name: FONT, sz: 10, color: { rgb: TEXT } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  totals: {
    font: { name: FONT, bold: true, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: TOTALS } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  totalsNumber: {
    font: { name: FONT, bold: true, sz: 10, color: { rgb: TEXT } },
    fill: { patternType: 'solid', fgColor: { rgb: TOTALS } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
    numFmt: '#,##0.00',
  } satisfies ExcelStyle,
  link: {
    font: { name: FONT, sz: 10, color: { rgb: LINK }, underline: true },
    alignment: { horizontal: 'left', vertical: 'center' },
  } satisfies ExcelStyle,
  healthOk: {
    font: { name: FONT, bold: true, sz: 10, color: { rgb: OK } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  healthWarn: {
    font: { name: FONT, bold: true, sz: 10, color: { rgb: WARN } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  } satisfies ExcelStyle,
  note: {
    font: { name: FONT, italic: true, sz: 9, color: { rgb: MUTED } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  } satisfies ExcelStyle,
} as const;

export type PayPreviewRowStyleHint =
  | { kind: 'title'; cols: number }
  | { kind: 'meta'; moneyCols?: number[] }
  | { kind: 'tableHeader'; cols: number }
  | { kind: 'data'; cols: number; variant: 'normal' | 'alt' | 'pending'; numberCols?: number[]; healthCol?: number }
  | { kind: 'section'; cols?: number }
  | { kind: 'kv'; moneyCols?: number[] }
  | { kind: 'totalsStripHeader'; cols: number }
  | { kind: 'totalsStripValues'; cols: number; numberCols?: number[] }
  | { kind: 'totals'; cols: number; numberCols?: number[] }
  | { kind: 'note' }
  | { kind: 'blank' };

export type PayPreviewSheetModel = {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
  hints: PayPreviewRowStyleHint[];
  freezeRow?: number;
  colWidths?: number[];
};

function styleForDataCell(variant: 'normal' | 'alt' | 'pending', numeric: boolean): ExcelStyle {
  if (variant === 'pending') {
    return numeric ? PAY_PREVIEW_XLSX_STYLES.dataNumberPending : PAY_PREVIEW_XLSX_STYLES.dataPending;
  }
  if (variant === 'alt') {
    return numeric ? PAY_PREVIEW_XLSX_STYLES.dataNumberAlt : PAY_PREVIEW_XLSX_STYLES.dataAlt;
  }
  return numeric ? PAY_PREVIEW_XLSX_STYLES.dataNumber : PAY_PREVIEW_XLSX_STYLES.data;
}

function applyStyle(cell: XLSXNS.CellObject | undefined, style: ExcelStyle) {
  if (!cell) return;
  cell.s = { ...(cell.s ?? {}), ...style };
}

export function applyPayPreviewWorksheetStyles(
  XLSX: typeof XLSXNS,
  worksheet: XLSXNS.WorkSheet,
  model: PayPreviewSheetModel
) {
  const maxCols = Math.max(
    1,
    ...model.rows.map((row) => row.length),
    ...(model.colWidths?.length ? [model.colWidths.length] : [])
  );

  model.hints.forEach((hint, rowIndex) => {
    const row = model.rows[rowIndex] ?? [];
    const cols = Math.max(row.length, 'cols' in hint && typeof hint.cols === 'number' ? hint.cols : 0, 1);

    switch (hint.kind) {
      case 'title': {
        for (let c = 0; c < Math.max(cols, 2); c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          applyStyle(worksheet[ref], c === 0 ? PAY_PREVIEW_XLSX_STYLES.title : PAY_PREVIEW_XLSX_STYLES.titleValue);
        }
        break;
      }
      case 'meta': {
        applyStyle(worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })], PAY_PREVIEW_XLSX_STYLES.metaLabel);
        applyStyle(
          worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })],
          hint.moneyCols?.includes(1) ? PAY_PREVIEW_XLSX_STYLES.metaMoney : PAY_PREVIEW_XLSX_STYLES.metaValue
        );
        break;
      }
      case 'tableHeader': {
        for (let c = 0; c < cols; c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          applyStyle(worksheet[ref], PAY_PREVIEW_XLSX_STYLES.tableHeader);
        }
        break;
      }
      case 'data': {
        for (let c = 0; c < cols; c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          if (hint.healthCol === c) {
            const value = String(worksheet[ref]?.v ?? '');
            applyStyle(
              worksheet[ref],
              value === 'OK'
                ? PAY_PREVIEW_XLSX_STYLES.healthOk
                : value === 'Check' || value === 'Pending'
                  ? PAY_PREVIEW_XLSX_STYLES.healthWarn
                  : styleForDataCell(hint.variant, false)
            );
          } else {
            applyStyle(worksheet[ref], styleForDataCell(hint.variant, hint.numberCols?.includes(c) ?? false));
          }
        }
        break;
      }
      case 'section': {
        for (let c = 0; c < Math.max(cols, Math.min(maxCols, 8)); c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          applyStyle(worksheet[ref], PAY_PREVIEW_XLSX_STYLES.section);
        }
        break;
      }
      case 'kv': {
        applyStyle(worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })], PAY_PREVIEW_XLSX_STYLES.kvLabel);
        applyStyle(
          worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 1 })],
          hint.moneyCols?.includes(1) ? PAY_PREVIEW_XLSX_STYLES.kvMoney : PAY_PREVIEW_XLSX_STYLES.kvValue
        );
        break;
      }
      case 'totalsStripHeader': {
        for (let c = 0; c < cols; c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          applyStyle(worksheet[ref], PAY_PREVIEW_XLSX_STYLES.tableHeader);
        }
        break;
      }
      case 'totalsStripValues':
      case 'totals': {
        for (let c = 0; c < cols; c += 1) {
          const ref = XLSX.utils.encode_cell({ r: rowIndex, c });
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          applyStyle(
            worksheet[ref],
            hint.numberCols?.includes(c) ? PAY_PREVIEW_XLSX_STYLES.totalsNumber : PAY_PREVIEW_XLSX_STYLES.totals
          );
        }
        break;
      }
      case 'note': {
        applyStyle(worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })], PAY_PREVIEW_XLSX_STYLES.note);
        break;
      }
      case 'blank':
      default:
        break;
    }
  });

  worksheet['!cols'] = (model.colWidths ?? Array.from({ length: maxCols }, () => 14)).map((wch) => ({ wch }));
  worksheet['!rows'] = model.rows.map((_, index) => ({
    hpt: index === 0 ? 24 : model.hints[index]?.kind === 'tableHeader' ? 22 : 18,
  }));

  if (model.freezeRow != null && model.freezeRow > 0) {
    worksheet['!views'] = [
      {
        state: 'frozen',
        ySplit: model.freezeRow,
        topLeftCell: `A${model.freezeRow + 1}`,
        activePane: 'bottomLeft',
      },
    ];
  }
}

export function stylePayPreviewHyperlink(
  XLSX: typeof XLSXNS,
  worksheet: XLSXNS.WorkSheet,
  row: number,
  col: number
) {
  const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return;
  const base = (cell.s ?? {}) as ExcelStyle;
  const baseFont = (base.font ?? {}) as { bold?: boolean; sz?: number; name?: string };
  cell.s = {
    ...base,
    font: {
      ...baseFont,
      name: FONT,
      color: { rgb: LINK },
      underline: true,
      bold: Boolean(baseFont.bold),
      sz: baseFont.sz ?? 10,
    },
  };
}
