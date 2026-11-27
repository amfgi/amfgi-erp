import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import {
  attendanceSheetAppendix,
  attendanceSummaryRows,
  historyAppendix,
  type AttendanceReportDraft,
} from '@/lib/hr/attendanceDeductionReport';
import type { EmployeeHistoryReport } from '@/lib/hr/employeeHistoryReport';
import { sectionSelected, type HistorySectionSelection } from '@/lib/hr/employeeHistorySections';

const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: line, bottom: line, left: line, right: line };
const tableBorders = { ...borders, insideHorizontal: line, insideVertical: line };

function prettyStatus(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function textRun(text: string, color: string, size: number) {
  return new TextRun({
    text: text || ' ',
    bold: true,
    size,
    color,
    font: 'Calibri',
  });
}

function paragraph(
  text: string,
  color: string,
  size: number,
  spaceAfter = 0,
  align?: (typeof AlignmentType)[keyof typeof AlignmentType],
) {
  return new Paragraph({
    alignment: align,
    spacing: { before: 0, after: spaceAfter },
    children: [textRun(text, color, size)],
  });
}

function cell(
  text: string,
  fill: string,
  color: string,
  size: number,
  width: number,
  span = 1,
  align?: (typeof AlignmentType)[keyof typeof AlignmentType],
) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.PERCENTAGE },
    ...(span > 1 ? { columnSpan: span } : {}),
    shading: { type: ShadingType.CLEAR, fill },
    margins: { top: 20, bottom: 20, left: 60, right: 60 },
    children: [paragraph(text, color, size, 0, align)],
  });
}

function pairTable(rows: Array<[string, string, string, string, string, string]>, labelWidth: number) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: rows.map(
      ([label, value, labelFill, valueFill, labelColor, valueColor]) =>
        new TableRow({
          children: [
            cell(label, labelFill, labelColor, 26, labelWidth),
            cell(value, valueFill, valueColor, 26, 100 - labelWidth),
          ],
        })
    ),
  });
}

function grid(headers: string[], rows: string[][], fills: string[], headerFill: string, widths: number[]) {
  const header = new TableRow({
    children: headers.map((headerText, index) => cell(headerText, headerFill, 'FFFFFF', 24, widths[index] ?? 25)),
  });
  const body = rows.map(
    (row) =>
      new TableRow({
        children: headers.map((_, index) => cell(row[index] ?? '', fills[index] ?? 'FFFFFF', fills[index] === 'FEE2E2' ? '1F2937' : '1F2937', 24, widths[index] ?? 25)),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [header, ...body],
  });
}

function summaryTable(draft: AttendanceReportDraft, report: EmployeeHistoryReport, sections: HistorySectionSelection) {
  const rows = attendanceSummaryRows(report, draft, sections);
  if (rows.length === 0) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [cell('Category', '1F2937', 'FFFFFF', 24, 50), cell('Count', '1F2937', 'FFFFFF', 24, 50)],
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: [
              cell(row.label, row.fine ? 'FEE2E2' : 'FFFFFF', '1F2937', 24, 50),
              cell(row.value, row.fine ? 'FEE2E2' : 'FFFFFF', row.fine ? '1F2937' : 'EE0000', 24, 50),
            ],
          })
      ),
    ],
  });
}

export async function attendanceReportDocxBlob(
  draft: AttendanceReportDraft,
  report: EmployeeHistoryReport,
  sections: HistorySectionSelection
): Promise<Blob> {
  const absentOn = sectionSelected(sections, 'absent');
  const visaOn = sectionSelected(sections, 'visa');
  const documentsOn = sectionSelected(sections, 'documents');
  const serviceRows: Array<[string, string, string, string, string, string]> = [
    ['First Join Date', draft.joinDate, 'F9FAFB', 'FFFFFF', '4B5563', '4B5563'],
    ['Service Duration', draft.service, 'DCFCE7', 'DCFCE7', '166534', '166534'],
    ...(sectionSelected(sections, 'salary')
      ? ([['Current Salary', draft.currentSalary, 'DCFCE7', 'DCFCE7', '166534', '166534']] as Array<[string, string, string, string, string, string]>)
      : []),
    ...(absentOn
      ? ([['Unauthorized Leave During Service Period', draft.unauthorizedLeave, 'F9FAFB', 'FFFFFF', '4B5563', 'EE0000']] as Array<[string, string, string, string, string, string]>)
      : []),
    ...(sectionSelected(sections, 'leave')
      ? ([['Total Leave in Service Period', draft.totalLeave, 'FEE2E2', 'FEE2E2', '991B1B', '991B1B']] as Array<[string, string, string, string, string, string]>)
      : []),
  ];

  const visaRows: Array<[string, string, string, string, string, string]> = [
    ...(documentsOn
      ? ([
          ['Eid Issue', draft.eidIssue, 'F9FAFB', 'FFFFFF', '4B5563', '4B5563'],
          ['Eid Will Expire', draft.eidExpiry, 'F9FAFB', 'FFFFFF', '4B5563', '4B5563'],
        ] as Array<[string, string, string, string, string, string]>)
      : []),
    ...(visaOn
      ? ([['Visa will expire within', draft.visaExpiresWithin, 'F9FAFB', 'FFFFFF', '4B5563', '4B5563']] as Array<[string, string, string, string, string, string]>)
      : []),
    ...(visaOn && absentOn
      ? ([['Unauthorized Absent Days (Current Visa)', draft.visaAbsentDays, 'C00000', 'C00000', 'FFFFFF', 'FFFFFF']] as Array<[string, string, string, string, string, string]>)
      : []),
  ];

  const summary = summaryTable(draft, report, sections);
  const children: Array<Paragraph | Table> = [
    paragraph(draft.company, '1F2937', 32, 80),
    new Paragraph({
      spacing: { before: 0, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'D1D5DB', space: 1 } },
      children: [textRun('Employee Attendance & Deduction Report', '4B5563', 26)],
    }),
    pairTable(
      [
        ['Employee', draft.employee, 'F3F4F6', 'FFFFFF', '4B5563', '4B5563'],
        ['Period', draft.period, 'F3F4F6', 'FFFFFF', '4B5563', '4B5563'],
        ['Report Generated', draft.generated, 'F3F4F6', 'FFFFFF', '4B5563', '4B5563'],
        ...draft.personal.map((row): [string, string, string, string, string, string] => [
          row.label,
          row.value,
          'F3F4F6',
          'FFFFFF',
          '4B5563',
          '4B5563',
        ]),
      ],
      28
    ),
    paragraph('', '1F2937', 20, 120),
    pairTable(serviceRows, 55),
  ];

  if (visaRows.length > 0) {
    const periods = sectionSelected(sections, 'visa') ? (report.visaPeriods ?? []) : [];
    const showPeriods = sectionSelected(sections, 'visa');
    children.push(paragraph('', '1F2937', 20, 120));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: [
          new TableRow({ children: [cell('Current Visa Info', '000000', 'FFFFFF', 26, 100, 4, AlignmentType.CENTER)] }),
          ...(showPeriods
            ? [
                new TableRow({
                  children: ['Label', 'Start', 'End', 'Status'].map((header) => cell(header, '4B5563', 'FFFFFF', 24, 25)),
                }),
                ...(periods.length === 0
                  ? [new TableRow({ children: [cell('No visa period.', 'FFFFFF', '1F2937', 24, 100, 4)] })]
                  : periods.map(
                      (row) =>
                        new TableRow({
                          children: [row.label, row.startDate, row.endDate, prettyStatus(row.status)].map((value) =>
                            cell(value, 'FFFFFF', '1F2937', 24, 25)
                          ),
                        })
                    )),
              ]
            : []),
          ...visaRows.map(
            ([label, value, labelFill, valueFill, labelColor, valueColor]) =>
              new TableRow({
                children: [
                  cell(label, labelFill, labelColor, 26, 55, 2),
                  cell(value, valueFill, valueColor, 26, 45, 2),
                ],
              })
          ),
        ],
      })
    );
  }

  if (summary) {
    children.push(paragraph('Summary', '1F2937', 24, 80));
    children.push(summary);
  }

  for (const block of historyAppendix(report, attendanceSheetAppendix(sections))) {
    children.push(paragraph(block.title, '1F2937', 24, 60));
    for (const note of block.notes) children.push(paragraph(note, '1F2937', 20, 40));
    if (block.headers.length > 0 && block.rows.length > 0) {
      const width = Math.floor(100 / block.headers.length);
      children.push(
        grid(
          block.headers,
          block.rows,
          block.headers.map(() => 'FFFFFF'),
          '4B5563',
          block.headers.map(() => width)
        )
      );
    } else if (block.empty) {
      children.push(paragraph(block.empty, '4B5563', 20, 40));
    }
  }

  const document = new Document({
    sections: [{ children }],
  });
  return Packer.toBlob(document);
}

export async function downloadAttendanceReportDocx(
  draft: AttendanceReportDraft,
  report: EmployeeHistoryReport,
  sections: HistorySectionSelection,
  fileName: string
) {
  const blob = await attendanceReportDocxBlob(draft, report, sections);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
