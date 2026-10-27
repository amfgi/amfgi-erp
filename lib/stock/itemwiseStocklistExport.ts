import * as XLSX from 'xlsx-js-style';

export type ItemwiseStocklistWarehouse = { id: string; name: string };

export type ItemwiseStocklistRow = {
  materialName: string;
  unit: string;
  unitCost: number;
  qtyByWarehouseId: Record<string, number>;
};

type Line = { item: string; unit: string; qty: number; value: number };

type Section = { name: string; lines: Line[]; totalValue: number };

function roundQty(value: number) {
  return Number(value.toFixed(3));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function buildSections(warehouses: ItemwiseStocklistWarehouse[], rows: ItemwiseStocklistRow[]) {
  const sections: Section[] = warehouses.map((warehouse) => {
    const lines: Line[] = [];
    let totalValue = 0;
    for (const row of rows) {
      const qty = row.qtyByWarehouseId[warehouse.id] ?? 0;
      if (qty === 0) continue;
      const value = roundMoney(qty * row.unitCost);
      totalValue = roundMoney(totalValue + value);
      lines.push({ item: row.materialName, unit: row.unit, qty: roundQty(qty), value });
    }
    return { name: warehouse.name, lines, totalValue };
  });
  const grandTotal = roundMoney(sections.reduce((sum, section) => sum + section.totalValue, 0));
  return { sections, grandTotal };
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
  warehouse: {
    font: { name: 'Calibri', bold: true, sz: 12, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  header: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: gridBorder,
  },
  headerNumber: {
    font: { name: 'Calibri', bold: true, sz: 10, color: { rgb: '0F172A' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'right', vertical: 'center' },
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

export function downloadItemwiseStocklistExcel(args: {
  currencyCode: string;
  warehouses: ItemwiseStocklistWarehouse[];
  rows: ItemwiseStocklistRow[];
  fileName: string;
}) {
  const { sections, grandTotal } = buildSections(args.warehouses, args.rows);
  const sheet: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let row = 0;

  const span = (at: number) => {
    merges.push({ s: { r: at, c: 0 }, e: { r: at, c: 3 } });
    for (let col = 1; col <= 3; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: at, c: col });
      if (!sheet[ref]) putCell(sheet, at, col, '', excelStyles.warehouse);
    }
  };

  putCell(sheet, row, 0, 'Itemwise stocklist', excelStyles.title);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 3 } });
  row += 1;
  putCell(sheet, row, 0, `Currency: ${args.currencyCode}`, excelStyles.meta);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 3 } });
  row += 2;

  for (const section of sections) {
    putCell(sheet, row, 0, `Warehouse: ${section.name}`, excelStyles.warehouse);
    span(row);
    row += 1;
    paintRow(sheet, row, ['Item', 'Unit', 'Qty', 'Value'], [
      excelStyles.header,
      excelStyles.header,
      excelStyles.headerNumber,
      excelStyles.headerNumber,
    ]);
    row += 1;
    if (section.lines.length === 0) {
      paintRow(sheet, row, ['No stock', '', '', ''], [excelStyles.text, excelStyles.text, excelStyles.text, excelStyles.text]);
      row += 1;
    }
    for (const line of section.lines) {
      paintRow(sheet, row, [line.item, line.unit, line.qty, line.value], [
        excelStyles.text,
        excelStyles.text,
        excelStyles.qty,
        excelStyles.money,
      ]);
      row += 1;
    }
    paintRow(sheet, row, ['Warehouse total', '', '', section.totalValue], [
      excelStyles.totalLabel,
      excelStyles.totalLabel,
      excelStyles.totalLabel,
      excelStyles.totalMoney,
    ]);
    row += 2;
  }

  paintRow(sheet, row, ['Grand total', '', '', grandTotal], [
    excelStyles.totalLabel,
    excelStyles.totalLabel,
    excelStyles.totalLabel,
    excelStyles.totalMoney,
  ]);

  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 3 } });
  sheet['!merges'] = merges;
  sheet['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Itemwise stocklist');
  XLSX.writeFile(book, args.fileName);
}

export async function downloadItemwiseStocklistPdf(args: {
  currencyCode: string;
  warehouses: ItemwiseStocklistWarehouse[];
  rows: ItemwiseStocklistRow[];
  fileName: string;
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 10;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const tableW = pageWidth - margin * 2;
  const widths = [100, 22, 28, tableW - 150];
  const rowH = 6;
  const { sections, grandTotal } = buildSections(args.warehouses, args.rows);

  let y = margin;

  const newPage = () => {
    pdf.addPage();
    y = margin;
  };

  const ensure = (height: number) => {
    if (y + height > pageHeight - margin) newPage();
  };

  const clip = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;

  const drawRow = (cells: string[], bold = false) => {
    pdf.setDrawColor(160);
    pdf.setLineWidth(0.2);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(8);
    pdf.rect(margin, y, tableW, rowH);
    let x = margin;
    cells.forEach((cell, index) => {
      if (index >= 2) pdf.text(cell, x + widths[index] - 1.5, y + 4.1, { align: 'right' });
      else pdf.text(cell, x + 1.5, y + 4.1);
      if (index < cells.length - 1) pdf.line(x + widths[index], y, x + widths[index], y + rowH);
      x += widths[index];
    });
    y += rowH;
  };

  const drawHeader = () => drawRow(['Item', 'Unit', 'Qty', 'Value'], true);

  const drawWarehouseTitle = (name: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(`Warehouse: ${name}`, margin, y + 5);
    y += 7;
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Itemwise stocklist', margin, y + 5);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Currency: ${args.currencyCode}`, margin, y + 4);
  y += 8;

  for (const section of sections) {
    ensure(7 + rowH * 3);
    drawWarehouseTitle(section.name);
    drawHeader();
    if (section.lines.length === 0) drawRow(['No stock', '', '', '']);
    for (const line of section.lines) {
      if (y + rowH > pageHeight - margin) {
        newPage();
        drawWarehouseTitle(section.name);
        drawHeader();
      }
      drawRow([clip(line.item, 52), clip(line.unit, 12), String(line.qty), line.value.toFixed(2)]);
    }
    if (y + rowH > pageHeight - margin) {
      newPage();
      drawWarehouseTitle(section.name);
      drawHeader();
    }
    drawRow(['Warehouse total', '', '', section.totalValue.toFixed(2)], true);
    y += 6;
  }

  ensure(rowH);
  drawRow(['Grand total', '', '', grandTotal.toFixed(2)], true);
  pdf.save(args.fileName);
}
