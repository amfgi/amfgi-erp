import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx-js-style';

export type ItemwiseStocklistWarehouse = { id: string; name: string };

export type ItemwiseStocklistRow = {
  materialName: string;
  unit: string;
  unitCost: number;
  lastPurchasePrice: number | null;
  qtyByWarehouseId: Record<string, number>;
};

type MatrixLine = {
  item: string;
  unit: string;
  qtys: number[];
  total: number;
  lastPurchasePrice: number | null;
  value: number;
};

function roundQty(value: number) {
  return Number(value.toFixed(3));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildMatrix(warehouses: ItemwiseStocklistWarehouse[], rows: ItemwiseStocklistRow[]) {
  const lines: MatrixLine[] = [];
  for (const row of rows) {
    const qtys = warehouses.map((warehouse) => roundQty(row.qtyByWarehouseId[warehouse.id] ?? 0));
    if (qtys.every((qty) => qty === 0)) continue;
    const total = roundQty(qtys.reduce((sum, qty) => sum + qty, 0));
    lines.push({
      item: row.materialName,
      unit: row.unit,
      qtys,
      total,
      lastPurchasePrice: row.lastPurchasePrice == null ? null : roundMoney(row.lastPurchasePrice),
      value: roundMoney(total * row.unitCost),
    });
  }
  const grandTotal = roundMoney(lines.reduce((sum, line) => sum + line.value, 0));
  return { lines, grandTotal };
}

const gridBorder = {
  top: { style: 'thin', color: { rgb: 'A0A0A0' } },
  bottom: { style: 'thin', color: { rgb: 'A0A0A0' } },
  left: { style: 'thin', color: { rgb: 'A0A0A0' } },
  right: { style: 'thin', color: { rgb: 'A0A0A0' } },
};

const excelStyles = {
  title: {
    font: { name: 'Calibri', bold: true, sz: 14, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  meta: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '475569' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  header: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: gridBorder,
  },
  headerNumber: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: gridBorder,
  },
  text: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: gridBorder,
  },
  qty: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: gridBorder,
    numFmt: '#,##0.###',
  },
  money: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: gridBorder,
    numFmt: '#,##0.00',
  },
  totalLabel: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: gridBorder,
  },
  totalEmpty: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: gridBorder,
  },
  totalMoney: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: gridBorder,
    numFmt: '#,##0.00',
  },
};

function putCell(sheet: XLSX.WorkSheet, row: number, col: number, value: string | number, style: object) {
  sheet[XLSX.utils.encode_cell({ r: row, c: col })] = {
    t: typeof value === 'number' ? 'n' : 's',
    v: value,
    s: style,
  };
}

function paintRow(sheet: XLSX.WorkSheet, row: number, values: Array<string | number>, styles: object[]) {
  values.forEach((value, col) => putCell(sheet, row, col, value, styles[col]));
}

function columnWidth(name: string) {
  return Math.min(22, Math.max(12, name.length + 1));
}

function freezePanes(bytes: Uint8Array, xSplit: number, ySplit: number) {
  const files = unzipSync(bytes);
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) return bytes;
  const topLeft = XLSX.utils.encode_cell({ r: ySplit, c: xSplit });
  const pane = `<pane xSplit="${xSplit}" ySplit="${ySplit}" topLeftCell="${topLeft}" activePane="bottomRight" state="frozen"/>`;
  const xml = strFromU8(files[sheetName]).replace(/<sheetView\b([^>]*)\/>/, `<sheetView$1>${pane}</sheetView>`);
  files[sheetName] = strToU8(xml);
  return zipSync(files);
}

function downloadBytes(fileName: string, bytes: Uint8Array, mime: string) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadItemwiseStocklistExcel(args: {
  currencyCode: string;
  warehouses: ItemwiseStocklistWarehouse[];
  rows: ItemwiseStocklistRow[];
  fileName: string;
}) {
  const { lines, grandTotal } = buildMatrix(args.warehouses, args.rows);
  const lastCol = args.warehouses.length + 4;
  const headers = ['Item', 'Unit', ...args.warehouses.map((warehouse) => warehouse.name), 'Total', 'Last purchase price', `Value (${args.currencyCode})`];
  const sheet: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let row = 0;

  const mergeTitle = (at: number, style: object) => {
    merges.push({ s: { r: at, c: 0 }, e: { r: at, c: lastCol } });
    for (let col = 1; col <= lastCol; col += 1) putCell(sheet, at, col, '', style);
  };

  putCell(sheet, row, 0, 'Itemwise stocklist', excelStyles.title);
  mergeTitle(row, excelStyles.title);
  row += 1;
  putCell(sheet, row, 0, `Currency: ${args.currencyCode} · ${localDateStamp()}`, excelStyles.meta);
  mergeTitle(row, excelStyles.meta);
  row += 2;

  paintRow(
    sheet,
    row,
    headers,
    headers.map((_, index) => (index < 2 ? excelStyles.header : excelStyles.headerNumber)),
  );
  const headerRow = row;
  row += 1;

  for (const line of lines) {
    paintRow(
      sheet,
      row,
      [line.item, line.unit, ...line.qtys, line.total, line.lastPurchasePrice ?? '', line.value],
      [excelStyles.text, excelStyles.text, ...line.qtys.map(() => excelStyles.qty), excelStyles.qty, line.lastPurchasePrice == null ? excelStyles.text : excelStyles.money, excelStyles.money],
    );
    row += 1;
  }

  const footer: Array<string | number> = ['Total value', '', ...args.warehouses.map(() => ''), '', '', grandTotal];
  const footerStyles = [
    excelStyles.totalLabel,
    excelStyles.totalEmpty,
    ...args.warehouses.map(() => excelStyles.totalEmpty),
    excelStyles.totalEmpty,
    excelStyles.totalEmpty,
    excelStyles.totalMoney,
  ];
  paintRow(sheet, row, footer, footerStyles);

  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: lastCol } });
  sheet['!merges'] = merges;
  sheet['!cols'] = [
    { wch: 36 },
    { wch: 14 },
    ...args.warehouses.map((warehouse) => ({ wch: columnWidth(warehouse.name) })),
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
  ];
  sheet['!rows'] = [];
  sheet['!rows'][headerRow] = { hpt: args.warehouses.some((warehouse) => warehouse.name.length > 14) ? 32 : 18 };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Itemwise stocklist');
  const raw = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const frozen = freezePanes(new Uint8Array(raw), 2, headerRow + 1);
  downloadBytes(
    args.fileName,
    frozen,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

type PdfDoc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addPage: () => void;
  setDrawColor: (v: number) => void;
  setLineWidth: (v: number) => void;
  setFont: (font: string, style: string) => void;
  setFontSize: (size: number) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }) => void;
  splitTextToSize: (text: string, size: number) => string[];
  getTextWidth: (text: string) => number;
  save: (name: string) => void;
};

function clipToWidth(pdf: PdfDoc, value: string, width: number) {
  const max = Math.max(4, width - 1.6);
  if (pdf.getTextWidth(value) <= max) return value;
  let clipped = value;
  while (clipped.length > 0 && pdf.getTextWidth(`${clipped}...`) > max) clipped = clipped.slice(0, -1);
  return clipped ? `${clipped}...` : '...';
}

function fitTwoLines(pdf: PdfDoc, value: string, width: number) {
  const max = Math.max(4, width - 1.6);
  const lines = pdf.splitTextToSize(value, max);
  if (lines.length <= 2) return lines;
  let second = lines[1];
  while (second.length > 0 && pdf.getTextWidth(`${second}...`) > max) second = second.slice(0, -1);
  return [lines[0], second ? `${second}...` : '...'];
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3, useGrouping: false }).format(value);
}

export async function downloadItemwiseStocklistPdf(args: {
  currencyCode: string;
  warehouses: ItemwiseStocklistWarehouse[];
  rows: ItemwiseStocklistRow[];
  fileName: string;
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as unknown as PdfDoc;
  const margin = 8;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const tableW = pageWidth - margin * 2;
  const itemW = 42;
  const unitW = 14;
  const totalW = 16;
  const priceW = 22;
  const valueW = 22;
  const fixed = itemW + unitW + totalW + priceW + valueW;
  const warehouseW = args.warehouses.length > 0 ? (tableW - fixed) / args.warehouses.length : 0;
  const widths = [
    args.warehouses.length > 0 ? itemW : tableW - unitW - totalW - priceW - valueW,
    unitW,
    ...args.warehouses.map(() => warehouseW),
    totalW,
    priceW,
    valueW,
  ];
  const headers = ['Item', 'Unit', ...args.warehouses.map((warehouse) => warehouse.name), 'Total', 'Last purchase price', `Value (${args.currencyCode})`];
  const { lines, grandTotal } = buildMatrix(args.warehouses, args.rows);
  const rowH = 6;
  const headerH = 10;
  let y = margin;

  const newPage = () => {
    pdf.addPage();
    y = margin;
  };

  const drawHeader = () => {
    pdf.setDrawColor(160);
    pdf.setLineWidth(0.2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.rect(margin, y, tableW, headerH);
    let x = margin;
    headers.forEach((header, index) => {
      const linesForHeader = fitTwoLines(pdf, header, widths[index]);
      const block = linesForHeader.length * 3.1;
      const textY = y + (headerH - block) / 2 + 2.6;
      linesForHeader.forEach((line, lineIndex) => {
        const align = index < 2 ? 'left' : 'center';
        const textX = index < 2 ? x + 1 : x + widths[index] / 2;
        pdf.text(line, textX, textY + lineIndex * 3.1, { align });
      });
      if (index < headers.length - 1) pdf.line(x + widths[index], y, x + widths[index], y + headerH);
      x += widths[index];
    });
    y += headerH;
  };

  const drawRow = (cells: string[], bold = false) => {
    pdf.setDrawColor(160);
    pdf.setLineWidth(0.2);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(7);
    pdf.rect(margin, y, tableW, rowH);
    let x = margin;
    cells.forEach((cell, index) => {
      const shown = index < 2 ? clipToWidth(pdf, cell, widths[index]) : cell;
      if (index >= 2) pdf.text(shown, x + widths[index] - 1, y + 4, { align: 'right' });
      else pdf.text(shown, x + 1, y + 4);
      if (index < cells.length - 1) pdf.line(x + widths[index], y, x + widths[index], y + rowH);
      x += widths[index];
    });
    y += rowH;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Itemwise stocklist', margin, y + 5);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Currency: ${args.currencyCode} · ${localDateStamp()}`, margin, y + 4);
  y += 7;
  drawHeader();

  for (const line of lines) {
    if (y + rowH > pageHeight - margin) {
      newPage();
      drawHeader();
    }
    drawRow([
      line.item,
      line.unit,
      ...line.qtys.map(formatQty),
      formatQty(line.total),
      line.lastPurchasePrice == null ? '' : line.lastPurchasePrice.toFixed(2),
      line.value.toFixed(2),
    ]);
  }

  if (y + rowH > pageHeight - margin) {
    newPage();
    drawHeader();
  }
  drawRow(['Total value', '', ...args.warehouses.map(() => ''), '', '', grandTotal.toFixed(2)], true);
  pdf.save(args.fileName);
}
