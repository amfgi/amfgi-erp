import type { Prisma, PrismaClient } from '@prisma/client';

import {
  DOCUMENT_SERIAL_CONTROLS,
  nextSerialFromHighest,
  normalizeDocumentSerialSettings,
  startFromForKind,
  type DocumentSerialSettings,
} from './documentSerialSettings';
import {
  formatDocumentNumber,
  parseDocumentSerial,
  queryNumberKey,
  salesYearCode,
  type DocumentKind,
} from './format';

type Db = Prisma.TransactionClient | PrismaClient;

export type DocumentSerialView = {
  kind: DocumentKind;
  key: (typeof DOCUMENT_SERIAL_CONTROLS)[number]['key'];
  label: string;
  startFrom: number;
  latestSerial: number | null;
  latestNumber: string | null;
  nextNumber: string;
};

export async function readDocumentSerialSettings(db: Db, companyId: string): Promise<DocumentSerialSettings> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { documentSerialSettings: true },
  });
  return normalizeDocumentSerialSettings(company?.documentSerialSettings);
}

async function highestIssuedSerial(db: Db, companyId: string, kind: DocumentKind, year: string): Promise<number> {
  const prefix = `${kind}${year}-`;
  let values: string[] = [];
  if (kind === 'QR') {
    const rows = await db.salesQuery.findMany({
      where: { companyId, queryNumber: { startsWith: prefix, mode: 'insensitive' } },
      select: { queryNumber: true },
    });
    values = rows.map((row) => row.queryNumber);
  } else if (kind === 'Q') {
    const rows = await db.salesQuery.findMany({
      where: { companyId, quotationNumber: { startsWith: prefix, mode: 'insensitive' } },
      select: { quotationNumber: true },
    });
    values = rows.flatMap((row) => (row.quotationNumber ? [row.quotationNumber] : []));
  } else if (kind === 'PO') {
    const rows = await db.salesQuery.findMany({
      where: { companyId, poNumber: { startsWith: prefix, mode: 'insensitive' } },
      select: { poNumber: true },
    });
    values = rows.flatMap((row) => (row.poNumber ? [row.poNumber] : []));
  } else {
    const rows = await db.job.findMany({
      where: { companyId, jobNumber: { startsWith: prefix, mode: 'insensitive' } },
      select: { jobNumber: true },
    });
    values = rows.map((row) => row.jobNumber);
  }
  return values.reduce((max, value) => {
    const serial = parseDocumentSerial(kind, year, value);
    return serial && serial > max ? serial : max;
  }, 0);
}

async function documentNumberTaken(db: Db, companyId: string, kind: DocumentKind, number: string): Promise<boolean> {
  const key = queryNumberKey(number);
  if (kind === 'QR') {
    const row = await db.salesQuery.findFirst({ where: { companyId, queryNumberKey: key }, select: { id: true } });
    return Boolean(row);
  }
  if (kind === 'Q') {
    const row = await db.salesQuery.findFirst({
      where: { companyId, quotationNumberKey: key },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (kind === 'PO') {
    const row = await db.salesQuery.findFirst({ where: { companyId, poNumberKey: key }, select: { id: true } });
    return Boolean(row);
  }
  const row = await db.job.findFirst({ where: { companyId, jobNumber: number }, select: { id: true } });
  return Boolean(row);
}

export async function assignNextDocumentNumber(
  db: Db,
  companyId: string,
  kind: DocumentKind,
  year = salesYearCode(),
): Promise<string> {
  const settings = await readDocumentSerialSettings(db, companyId);
  const highest = await highestIssuedSerial(db, companyId, kind, year);
  let serial = nextSerialFromHighest(highest, startFromForKind(settings, kind));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = formatDocumentNumber(kind, year, serial);
    if (!(await documentNumberTaken(db, companyId, kind, candidate))) return candidate;
    serial += 1;
  }
  throw new Error('Could not assign the next number');
}

export async function describeDocumentSerials(db: Db, companyId: string, year = salesYearCode()) {
  const settings = await readDocumentSerialSettings(db, companyId);
  const items: DocumentSerialView[] = [];
  for (const control of DOCUMENT_SERIAL_CONTROLS) {
    const highest = await highestIssuedSerial(db, companyId, control.kind, year);
    const startFrom = settings[control.key];
    const nextSerial = nextSerialFromHighest(highest, startFrom);
    items.push({
      kind: control.kind,
      key: control.key,
      label: control.label,
      startFrom,
      latestSerial: highest > 0 ? highest : null,
      latestNumber: highest > 0 ? formatDocumentNumber(control.kind, year, highest) : null,
      nextNumber: formatDocumentNumber(control.kind, year, nextSerial),
    });
  }
  return { year, items };
}
