import { randomUUID } from 'crypto';
import { Prisma, type AccountNormalSide, type FinancialStatementSection } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { filsToDecimalString, isContraType, parseMoney } from '@/lib/accounting/rules';
import { prepareJournalLines, type JournalLineInput } from '@/lib/accounting/posting';
import { nextSerialFromHighest, normalizeDocumentSerialSettings } from '@/lib/sales/documentSerialSettings';
import { highestIssuedJournalNumber } from '@/lib/sales/nextDocumentSerial';

type Tx = Prisma.TransactionClient;

export class AccountingError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertSide(value: string): AccountNormalSide {
  if (value !== 'DEBIT' && value !== 'CREDIT') throw new AccountingError('Choose Debit or Credit.');
  return value;
}

function assertReportsOn(value: string): FinancialStatementSection {
  if (value !== 'BALANCE_SHEET' && value !== 'PROFIT_AND_LOSS') {
    throw new AccountingError('Choose balance sheet or profit and loss.');
  }
  return value;
}

async function assertGroupNameAvailable(companyId: string, name: string, exceptId?: string) {
  const existing = await prisma.ledgerStatementGroup.findFirst({
    where: {
      companyId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new AccountingError('A statement group with this name already exists.');
}

export async function listStatementGroups(companyId: string) {
  return prisma.ledgerStatementGroup.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { accountTypes: true } } },
  });
}

export async function createStatementGroup(input: {
  companyId: string;
  name: string;
  normalSide: string;
  reportsOn: string;
}) {
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter a statement group name.');
  const normalSide = assertSide(input.normalSide);
  const reportsOn = assertReportsOn(input.reportsOn);
  await assertGroupNameAvailable(input.companyId, name);
  const last = await prisma.ledgerStatementGroup.findFirst({
    where: { companyId: input.companyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return prisma.ledgerStatementGroup.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      name,
      normalSide,
      reportsOn,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
  });
}

export async function updateStatementGroup(input: {
  companyId: string;
  id: string;
  name: string;
  normalSide: string;
  reportsOn: string;
  confirmReportsOn?: boolean;
  confirmNormalSide?: boolean;
}) {
  const current = await prisma.ledgerStatementGroup.findFirst({
    where: { id: input.id, companyId: input.companyId },
  });
  if (!current) throw new AccountingError('Statement group not found.', 404);
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter a statement group name.');
  const normalSide = assertSide(input.normalSide);
  const reportsOn = assertReportsOn(input.reportsOn);
  if (reportsOn !== current.reportsOn && !input.confirmReportsOn) {
    throw new AccountingError(
      'Changing where this group reports moves its account types between the balance sheet and profit and loss.',
      409,
      'REPORTS_ON_CONFIRM',
    );
  }
  if (normalSide !== current.normalSide && !input.confirmNormalSide) {
    throw new AccountingError(
      'Changing the normal side does not rewrite saved journals. Account types that no longer match become contra accounts.',
      409,
      'NORMAL_SIDE_CONFIRM',
    );
  }
  await assertGroupNameAvailable(input.companyId, name, current.id);
  return prisma.ledgerStatementGroup.update({
    where: { id: current.id },
    data: { name, normalSide, reportsOn },
  });
}

export async function deleteStatementGroup(companyId: string, id: string) {
  const current = await prisma.ledgerStatementGroup.findFirst({
    where: { id, companyId },
    include: { _count: { select: { accountTypes: true } } },
  });
  if (!current) throw new AccountingError('Statement group not found.', 404);
  if (current._count.accountTypes > 0) {
    throw new AccountingError('This group still has account types. Move those types first.');
  }
  await prisma.ledgerStatementGroup.delete({ where: { id: current.id } });
}

async function assertTypeNameAvailable(companyId: string, name: string, exceptId?: string) {
  const existing = await prisma.ledgerAccountType.findFirst({
    where: {
      companyId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new AccountingError('An account type with this name already exists.');
}

const typeInclude = { statementGroup: true } as const;

export async function listAccountTypes(companyId: string) {
  return prisma.ledgerAccountType.findMany({
    where: { companyId },
    include: typeInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

async function requireStatementGroup(companyId: string, id: string) {
  const group = await prisma.ledgerStatementGroup.findFirst({
    where: { id, companyId },
  });
  if (!group) throw new AccountingError('Choose a statement group.');
  return group;
}

export async function createAccountType(input: {
  companyId: string;
  name: string;
  statementGroupId: string;
  increaseSide: string;
  confirmContra?: boolean;
}) {
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter an account type name.');
  const statementGroup = await requireStatementGroup(input.companyId, input.statementGroupId);
  const increaseSide = assertSide(input.increaseSide);
  if (isContraType(statementGroup.normalSide, increaseSide) && !input.confirmContra) {
    throw new AccountingError(
      'This increase side does not match the statement group. Confirm to save it as a contra account.',
      409,
      'CONTRA_CONFIRM',
    );
  }
  await assertTypeNameAvailable(input.companyId, name);
  const last = await prisma.ledgerAccountType.findFirst({
    where: { companyId: input.companyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return prisma.ledgerAccountType.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      name,
      statementGroupId: statementGroup.id,
      increaseSide,
      sortOrder: (last?.sortOrder ?? 0) + 10,
    },
    include: typeInclude,
  });
}

export async function updateAccountType(input: {
  companyId: string;
  id: string;
  name: string;
  statementGroupId: string;
  increaseSide: string;
  isActive?: boolean;
  confirmContra?: boolean;
  confirmStatementGroup?: boolean;
}) {
  const current = await prisma.ledgerAccountType.findFirst({
    where: { id: input.id, companyId: input.companyId },
    include: typeInclude,
  });
  if (!current) throw new AccountingError('Account type not found.', 404);
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter an account type name.');
  const statementGroup = await requireStatementGroup(input.companyId, input.statementGroupId);
  const increaseSide = assertSide(input.increaseSide);
  if (statementGroup.reportsOn !== current.statementGroup.reportsOn && !input.confirmStatementGroup) {
    throw new AccountingError(
      'Changing the statement group moves this type between the balance sheet and profit and loss.',
      409,
      'STATEMENT_GROUP_CONFIRM',
    );
  }
  if (isContraType(statementGroup.normalSide, increaseSide) && !input.confirmContra) {
    throw new AccountingError(
      'This increase side does not match the statement group. Confirm to save it as a contra account.',
      409,
      'CONTRA_CONFIRM',
    );
  }
  await assertTypeNameAvailable(input.companyId, name, current.id);
  return prisma.ledgerAccountType.update({
    where: { id: current.id },
    data: {
      name,
      statementGroupId: statementGroup.id,
      increaseSide,
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
    },
    include: typeInclude,
  });
}

export async function deleteAccountType(companyId: string, id: string) {
  const current = await prisma.ledgerAccountType.findFirst({
    where: { id, companyId },
    include: { _count: { select: { accounts: true } } },
  });
  if (!current) throw new AccountingError('Account type not found.', 404);
  if (current._count.accounts > 0) {
    throw new AccountingError('This type still has accounts. Move or delete those accounts first.');
  }
  await prisma.ledgerAccountType.delete({ where: { id: current.id } });
}

async function parentCreatesCycle(companyId: string, accountId: string, parentId: string) {
  let current: string | null = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === accountId || seen.has(current)) return true;
    seen.add(current);
    const row: { parentId: string | null } | null = await prisma.ledgerAccount.findFirst({
      where: { id: current, companyId },
      select: { parentId: true },
    });
    current = row?.parentId ?? null;
  }
  return false;
}

async function assertAccountName(companyId: string, name: string, parentId: string | null, exceptId?: string) {
  const existing = await prisma.ledgerAccount.findFirst({
    where: {
      companyId,
      parentId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new AccountingError('An account with this name already exists under that parent.');
}

async function assertAccountCode(companyId: string, code: string | null, exceptId?: string) {
  if (!code) return;
  const existing = await prisma.ledgerAccount.findFirst({
    where: {
      companyId,
      code: { equals: code, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new AccountingError('This account number is already used.');
}

function netFils(debit: Prisma.Decimal | null | undefined, credit: Prisma.Decimal | null | undefined) {
  const debitFils = (debit ?? new Prisma.Decimal(0)).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  const creditFils = (credit ?? new Prisma.Decimal(0)).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
  return debitFils - creditFils;
}

export async function listAccounts(companyId: string) {
  const [accounts, grouped] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { companyId },
      include: {
        accountType: true,
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, journalLines: true } },
      },
      orderBy: [{ name: 'asc' }],
    }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { companyId, journalEntry: { status: 'SAVED' } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const balanceByAccount = new Map(grouped.map((row) => [row.accountId, netFils(row._sum.debit, row._sum.credit)]));
  return accounts.map((account) => ({
    ...account,
    balanceFils: balanceByAccount.get(account.id) ?? 0,
  }));
}

function decimalFils(value: Prisma.Decimal | null | undefined) {
  return (value ?? new Prisma.Decimal(0)).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Saved journal lines for one account, in the QuickReport column shape. */
export async function accountQuickReport(companyId: string, accountId: string, from: string, to: string) {
  const account = await prisma.ledgerAccount.findFirst({
    where: { id: accountId, companyId },
    include: { accountType: { select: { name: true, increaseSide: true } } },
  });
  if (!account) throw new AccountingError('Account not found.', 404);
  const start = parseEntryDate(from);
  const end = parseEntryDate(to);
  if (end < start) throw new AccountingError('The end date is before the start date.');
  const lines = await prisma.journalLine.findMany({
    where: {
      companyId,
      accountId,
      journalEntry: { status: 'SAVED', entryDate: { gte: start, lte: end } },
    },
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: [{ journalEntry: { entryDate: 'asc' } }, { journalEntry: { entryNumber: 'asc' } }, { sortOrder: 'asc' }],
  });
  const rows = lines.map((line) => {
    const debitFils = decimalFils(line.debit);
    const creditFils = decimalFils(line.credit);
    const amountFils = account.accountType.increaseSide === 'CREDIT' ? creditFils - debitFils : debitFils - creditFils;
    const others = [...new Set(
      line.journalEntry.lines
        .filter((other) => other.accountId !== accountId)
        .map((other) => other.account.name)
        .filter(Boolean),
    )];
    return {
      id: line.id,
      type: 'Journal',
      date: line.journalEntry.entryDate.toISOString().slice(0, 10),
      num: line.journalEntry.entryNumber,
      name: line.partyName ?? '',
      memo: line.memo ?? '',
      split: others.length === 0 ? '' : others.length === 1 ? others[0] : '-SPLIT-',
      amountFils,
    };
  });
  return {
    accountName: account.name,
    typeName: account.accountType.name,
    from,
    to,
    rows,
    totalFils: rows.reduce((sum, row) => sum + row.amountFils, 0),
  };
}

export async function createAccount(input: {
  companyId: string;
  name: string;
  accountTypeId: string;
  parentId?: string | null;
  code?: string | null;
  description?: string | null;
  note?: string | null;
  isActive?: boolean;
}) {
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter an account name.');
  const accountType = await prisma.ledgerAccountType.findFirst({
    where: { id: input.accountTypeId, companyId: input.companyId },
  });
  if (!accountType) throw new AccountingError('Choose an account type.');
  const parentId = input.parentId?.trim() || null;
  if (parentId) {
    const parent = await prisma.ledgerAccount.findFirst({
      where: { id: parentId, companyId: input.companyId },
    });
    if (!parent) throw new AccountingError('Parent account not found.', 404);
    if (parent.accountTypeId !== accountType.id) {
      throw new AccountingError('A subaccount must use the same account type as its parent.');
    }
  }
  const code = input.code?.trim() || null;
  await assertAccountName(input.companyId, name, parentId);
  await assertAccountCode(input.companyId, code);
  return prisma.ledgerAccount.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      accountTypeId: accountType.id,
      parentId,
      name,
      code,
      description: input.description?.trim() || null,
      note: input.note?.trim() || null,
      isActive: input.isActive !== false,
    },
  });
}

export async function updateAccount(input: {
  companyId: string;
  id: string;
  name: string;
  accountTypeId: string;
  parentId?: string | null;
  code?: string | null;
  description?: string | null;
  note?: string | null;
  isActive?: boolean;
  applyToChildren?: boolean;
}) {
  const current = await prisma.ledgerAccount.findFirst({
    where: { id: input.id, companyId: input.companyId },
    include: { children: { select: { id: true } } },
  });
  if (!current) throw new AccountingError('Account not found.', 404);
  const name = input.name.trim();
  if (!name) throw new AccountingError('Enter an account name.');
  const accountType = await prisma.ledgerAccountType.findFirst({
    where: { id: input.accountTypeId, companyId: input.companyId },
  });
  if (!accountType) throw new AccountingError('Choose an account type.');
  let parentId = input.parentId?.trim() || null;
  if (parentId === current.id) throw new AccountingError('An account cannot be its own parent.');
  if (parentId && await parentCreatesCycle(input.companyId, current.id, parentId)) {
    throw new AccountingError('That parent would make a loop in the chart.');
  }
  if (parentId) {
    const parent = await prisma.ledgerAccount.findFirst({
      where: { id: parentId, companyId: input.companyId },
    });
    if (!parent) throw new AccountingError('Parent account not found.', 404);
    if (parent.accountTypeId !== accountType.id) parentId = null;
  }
  const typeChanged = accountType.id !== current.accountTypeId;
  if (typeChanged && current.children.length > 0 && !input.applyToChildren) {
    throw new AccountingError(
      'This account has subaccounts. Apply the same type to them, or cancel.',
      409,
      'CHILDREN_TYPE',
    );
  }
  const code = input.code?.trim() || null;
  await assertAccountName(input.companyId, name, parentId, current.id);
  await assertAccountCode(input.companyId, code, current.id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ledgerAccount.update({
      where: { id: current.id },
      data: {
        name,
        accountTypeId: accountType.id,
        parentId,
        code,
        description: input.description?.trim() || null,
        note: input.note?.trim() || null,
        ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      },
    });
    if (typeChanged && input.applyToChildren) {
      const descendantIds = await collectDescendantIds(tx, input.companyId, current.id);
      if (descendantIds.length > 0) {
        await tx.ledgerAccount.updateMany({
          where: { companyId: input.companyId, id: { in: descendantIds } },
          data: { accountTypeId: accountType.id },
        });
      }
    }
    return updated;
  });
}

async function collectDescendantIds(tx: Tx, companyId: string, rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await tx.ledgerAccount.findMany({
      where: { companyId, parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((row) => row.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

export async function deleteAccount(companyId: string, id: string) {
  const current = await prisma.ledgerAccount.findFirst({
    where: { id, companyId },
    include: { _count: { select: { children: true, journalLines: true } } },
  });
  if (!current) throw new AccountingError('Account not found.', 404);
  if (current._count.children > 0) {
    throw new AccountingError('This account has subaccounts. Move or delete them first.');
  }
  if (current._count.journalLines > 0) {
    throw new AccountingError('This account is used on a journal. Deactivate it instead of deleting it.');
  }
  await prisma.ledgerAccount.delete({ where: { id: current.id } });
}

function todayDateUtc(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseEntryDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccountingError('Enter a valid date.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AccountingError('Enter a valid date.');
  }
  return date;
}

async function journalStartFrom(tx: Tx, companyId: string): Promise<number> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { documentSerialSettings: true },
  });
  return normalizeDocumentSerialSettings(company?.documentSerialSettings).journal;
}

async function allocateEntryNumber(tx: Tx, companyId: string): Promise<number> {
  const startFrom = await journalStartFrom(tx, companyId);
  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    WITH bounds AS (
      SELECT GREATEST(
        ${startFrom}::int,
        COALESCE((SELECT MAX("entryNumber") + 1 FROM "JournalEntry" WHERE "companyId" = ${companyId}), 1)
      ) AS first_number
    )
    INSERT INTO "JournalCounter" ("companyId", "lastNumber")
    SELECT ${companyId}, first_number FROM bounds
    ON CONFLICT ("companyId")
    DO UPDATE SET "lastNumber" = GREATEST("JournalCounter"."lastNumber" + 1, EXCLUDED."lastNumber")
    RETURNING "lastNumber"
  `;
  const next = rows[0]?.lastNumber;
  if (!next) throw new AccountingError('Could not assign an entry number.', 500);
  return next;
}

async function assertPostableAccounts(tx: Tx, companyId: string, accountIds: string[]) {
  const unique = [...new Set(accountIds)];
  const accounts = await tx.ledgerAccount.findMany({
    where: { companyId, id: { in: unique } },
    include: { _count: { select: { children: true } } },
  });
  if (accounts.length !== unique.length) throw new AccountingError('One of the accounts was not found.');
  for (const account of accounts) {
    if (!account.isActive) throw new AccountingError(`${account.name} is inactive. Choose another account.`);
    if (account._count.children > 0) {
      throw new AccountingError(`${account.name} has subaccounts. Post to a subaccount.`);
    }
  }
}

function lineCreateData(companyId: string, journalEntryId: string, lines: ReturnType<typeof prepareJournalLines> & { ok: true }) {
  return lines.lines.map((line, index) => ({
    id: randomUUID(),
    companyId,
    journalEntryId,
    accountId: line.accountId,
    sortOrder: index,
    debit: filsToDecimalString(line.debitFils),
    credit: filsToDecimalString(line.creditFils),
    memo: line.memo,
    partyName: line.partyName,
    vatItem: line.vatItem,
    billable: line.billable,
    jobLabel: line.jobLabel,
  }));
}

const entryInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const }, include: { account: { select: { id: true, name: true } } } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
};

function searchDate(value: string): Date | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const normalized = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : dmy
      ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
      : '';
  if (!normalized) return null;
  try {
    return parseEntryDate(normalized);
  } catch {
    return null;
  }
}

/** One box matches an entry number, date, account, memo, name, job, or amount. */
export async function listJournals(companyId: string, query: string) {
  const q = query.trim();
  if (!q) return [];
  const or: Prisma.JournalEntryWhereInput[] = [
    { lines: { some: { memo: { contains: q, mode: 'insensitive' } } } },
    { lines: { some: { partyName: { contains: q, mode: 'insensitive' } } } },
    { lines: { some: { jobLabel: { contains: q, mode: 'insensitive' } } } },
    { lines: { some: { account: { name: { contains: q, mode: 'insensitive' } } } } },
  ];
  if (/^\d+$/.test(q)) or.push({ entryNumber: Number(q) });
  const date = searchDate(q);
  if (date) or.push({ entryDate: date });
  const money = parseMoney(q);
  if (money.ok && money.fils > 0) {
    const decimal = filsToDecimalString(money.fils);
    or.push({ lines: { some: { OR: [{ debit: decimal }, { credit: decimal }] } } });
  }
  return prisma.journalEntry.findMany({
    where: { companyId, OR: or },
    include: entryInclude,
    orderBy: [{ entryNumber: 'desc' }],
    take: 20,
  });
}

export async function listAllJournals(companyId: string) {
  return prisma.journalEntry.findMany({
    where: { companyId },
    include: entryInclude,
    orderBy: [{ entryNumber: 'desc' }],
  });
}

export async function getJournal(companyId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId },
    include: entryInclude,
  });
  if (!entry) throw new AccountingError('Journal entry not found.', 404);
  return entry;
}

export async function peekNextEntryNumber(companyId: string): Promise<number> {
  const [highest, company] = await Promise.all([
    highestIssuedJournalNumber(prisma, companyId),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { documentSerialSettings: true },
    }),
  ]);
  const startFrom = normalizeDocumentSerialSettings(company?.documentSerialSettings).journal;
  return nextSerialFromHighest(highest, startFrom);
}

export async function recordJournal(input: {
  companyId: string;
  userId: string | null;
  entryDate: string;
  idempotencyKey: string;
  lines: JournalLineInput[];
}) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new AccountingError('Save needs an idempotency key.');
  const existingByKey = await prisma.journalEntry.findFirst({
    where: { companyId: input.companyId, idempotencyKey: key },
    include: entryInclude,
  });
  if (existingByKey) return existingByKey;

  const prepared = prepareJournalLines(input.lines);
  if (!prepared.ok) throw new AccountingError(prepared.error);
  const entryDate = parseEntryDate(input.entryDate);

  return prisma.$transaction(async (tx) => {
    const again = await tx.journalEntry.findFirst({
      where: { companyId: input.companyId, idempotencyKey: key },
      include: entryInclude,
    });
    if (again) return again;
    await assertPostableAccounts(tx, input.companyId, prepared.lines.map((line) => line.accountId));
    const entryNumber = await allocateEntryNumber(tx, input.companyId);
    const id = randomUUID();
    await tx.journalEntry.create({
      data: {
        id,
        companyId: input.companyId,
        entryNumber,
        entryDate,
        status: 'SAVED',
        idempotencyKey: key,
        savedAt: new Date(),
        createdById: input.userId,
      },
    });
    await tx.journalLine.createMany({ data: lineCreateData(input.companyId, id, prepared) });
    return tx.journalEntry.findUniqueOrThrow({ where: { id }, include: entryInclude });
  });
}

export async function saveJournal(input: {
  companyId: string;
  id: string;
  userId: string | null;
  entryDate: string;
  idempotencyKey: string;
  lines: JournalLineInput[];
}) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new AccountingError('Save needs an idempotency key.');
  const existingByKey = await prisma.journalEntry.findFirst({
    where: { companyId: input.companyId, idempotencyKey: key },
    include: entryInclude,
  });
  if (existingByKey) return existingByKey;

  const prepared = prepareJournalLines(input.lines);
  if (!prepared.ok) throw new AccountingError(prepared.error);
  const entryDate = parseEntryDate(input.entryDate);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({
      where: { id: input.id, companyId: input.companyId },
    });
    if (!entry) throw new AccountingError('Journal entry not found.', 404);
    if (entry.status === 'SAVED') {
      throw new AccountingError('This entry is saved. Reverse it instead of editing it.', 409);
    }
    await assertPostableAccounts(tx, input.companyId, prepared.lines.map((line) => line.accountId));
    await tx.journalLine.deleteMany({ where: { journalEntryId: entry.id } });
    await tx.journalLine.createMany({ data: lineCreateData(input.companyId, entry.id, prepared) });
    const saved = await tx.journalEntry.update({
      where: { id: entry.id },
      data: {
        status: 'SAVED',
        entryDate,
        idempotencyKey: key,
        savedAt: new Date(),
        createdById: entry.createdById ?? input.userId,
      },
      include: entryInclude,
    });
    if (entry.reversedFromId) {
      const original = await tx.journalEntry.findFirst({
        where: { id: entry.reversedFromId, companyId: input.companyId },
      });
      if (!original) throw new AccountingError('The original entry was not found.', 404);
      if (original.reversedById && original.reversedById !== entry.id) {
        throw new AccountingError('That entry has already been reversed.');
      }
      await tx.journalEntry.update({
        where: { id: original.id },
        data: { reversedById: entry.id },
      });
    }
    return saved;
  });
}

export async function updateDraftLines(input: {
  companyId: string;
  id: string;
  entryDate?: string;
  lines: JournalLineInput[];
}) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: input.id, companyId: input.companyId },
  });
  if (!entry) throw new AccountingError('Journal entry not found.', 404);
  if (entry.status === 'SAVED') {
    throw new AccountingError('This entry is saved. Reverse it instead of editing it.', 409);
  }
  const prepared = prepareJournalLines(input.lines);
  if (!prepared.ok) throw new AccountingError(prepared.error);
  return prisma.$transaction(async (tx) => {
    await assertPostableAccounts(tx, input.companyId, prepared.lines.map((line) => line.accountId));
    await tx.journalLine.deleteMany({ where: { journalEntryId: entry.id } });
    await tx.journalLine.createMany({ data: lineCreateData(input.companyId, entry.id, prepared) });
    return tx.journalEntry.update({
      where: { id: entry.id },
      data: input.entryDate ? { entryDate: parseEntryDate(input.entryDate) } : {},
      include: entryInclude,
    });
  });
}

export async function deleteDraft(companyId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId } });
  if (!entry) throw new AccountingError('Journal entry not found.', 404);
  if (entry.status !== 'DRAFT') {
    throw new AccountingError('A saved entry cannot be deleted. Reverse it.');
  }
  await prisma.journalEntry.delete({ where: { id: entry.id } });
}

async function cloneLinesAsDraft(input: {
  companyId: string;
  userId: string | null;
  sourceId: string;
  reverse: boolean;
}) {
  const source = await prisma.journalEntry.findFirst({
    where: { id: input.sourceId, companyId: input.companyId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!source) throw new AccountingError('Journal entry not found.', 404);
  if (source.status !== 'SAVED') throw new AccountingError('Save the entry before copying or reversing it.');
  if (input.reverse && source.reversedById) {
    throw new AccountingError('That entry has already been reversed.');
  }
  if (input.reverse) {
    const pending = await prisma.journalEntry.findFirst({
      where: { companyId: input.companyId, reversedFromId: source.id, status: 'DRAFT' },
      include: entryInclude,
    });
    if (pending) return pending;
  }
  return prisma.$transaction(async (tx) => {
    const entryNumber = await allocateEntryNumber(tx, input.companyId);
    const created = await tx.journalEntry.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        entryNumber,
        entryDate: todayDateUtc(),
        status: 'DRAFT',
        createdById: input.userId,
        reversedFromId: input.reverse ? source.id : null,
      },
    });
    if (source.lines.length > 0) {
      await tx.journalLine.createMany({
        data: source.lines.map((line) => ({
          id: randomUUID(),
          companyId: input.companyId,
          journalEntryId: created.id,
          accountId: line.accountId,
          sortOrder: line.sortOrder,
          debit: input.reverse ? line.credit : line.debit,
          credit: input.reverse ? line.debit : line.credit,
          memo: line.memo,
          partyName: line.partyName,
          vatItem: line.vatItem,
          billable: line.billable,
          jobLabel: line.jobLabel,
        })),
      });
    }
    return tx.journalEntry.findUniqueOrThrow({ where: { id: created.id }, include: entryInclude });
  });
}

export function copyJournal(companyId: string, userId: string | null, id: string) {
  return cloneLinesAsDraft({ companyId, userId, sourceId: id, reverse: false });
}

export function reverseJournal(companyId: string, userId: string | null, id: string) {
  return cloneLinesAsDraft({ companyId, userId, sourceId: id, reverse: true });
}

export async function memoriseJournal(companyId: string, id: string, lines?: JournalLineInput[]) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id, companyId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!entry) throw new AccountingError('Journal entry not found.', 404);
  const fromGrid = (lines ?? []).filter((line) => line.accountId?.trim());
  const stored = fromGrid.length > 0
    ? fromGrid.map((line) => ({
        accountId: line.accountId,
        debit: line.debit ?? '',
        credit: line.credit ?? '',
        memo: line.memo ?? null,
        partyName: line.partyName ?? null,
        vatItem: line.vatItem ?? null,
        billable: Boolean(line.billable),
        jobLabel: line.jobLabel ?? null,
      }))
    : entry.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
        memo: line.memo,
        partyName: line.partyName,
        vatItem: line.vatItem,
        billable: line.billable,
        jobLabel: line.jobLabel,
      }));
  if (stored.length === 0) throw new AccountingError('Add lines before memorising this entry.');
  return prisma.journalTemplate.create({
    data: {
      id: randomUUID(),
      companyId,
      name: `Entry ${entry.entryNumber}`,
      lines: stored,
    },
  });
}

export async function listTemplates(companyId: string) {
  return prisma.journalTemplate.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

export async function draftFromTemplate(companyId: string, userId: string | null, templateId: string) {
  const template = await prisma.journalTemplate.findFirst({
    where: { id: templateId, companyId },
  });
  if (!template) throw new AccountingError('Memorised entry not found.', 404);
  const lines = Array.isArray(template.lines) ? template.lines : [];
  return prisma.$transaction(async (tx) => {
    const entryNumber = await allocateEntryNumber(tx, companyId);
    const created = await tx.journalEntry.create({
      data: {
        id: randomUUID(),
        companyId,
        entryNumber,
        entryDate: todayDateUtc(),
        status: 'DRAFT',
        createdById: userId,
      },
    });
    const prepared = prepareJournalLines(lines as JournalLineInput[]);
    if (prepared.ok) {
      await assertPostableAccounts(tx, companyId, prepared.lines.map((line) => line.accountId));
      await tx.journalLine.createMany({ data: lineCreateData(companyId, created.id, prepared) });
    }
    return tx.journalEntry.findUniqueOrThrow({ where: { id: created.id }, include: entryInclude });
  });
}

export async function addAttachment(companyId: string, journalId: string, fileName: string) {
  const name = fileName.trim();
  if (!name) throw new AccountingError('Choose a file.');
  const entry = await prisma.journalEntry.findFirst({ where: { id: journalId, companyId }, select: { id: true } });
  if (!entry) throw new AccountingError('Journal entry not found.', 404);
  return prisma.journalAttachment.create({
    data: {
      id: randomUUID(),
      companyId,
      journalEntryId: entry.id,
      fileName: name.slice(0, 240),
    },
  });
}

export async function trialBalance(companyId: string) {
  const grouped = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { companyId, journalEntry: { status: 'SAVED' } },
    _sum: { debit: true, credit: true },
  });
  const accounts = await prisma.ledgerAccount.findMany({
    where: { companyId, id: { in: grouped.map((row) => row.accountId) } },
    include: { accountType: { include: { statementGroup: true } } },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const rows = grouped.flatMap((row) => {
    const account = byId.get(row.accountId);
    if (!account) return [];
    const debit = row._sum.debit ?? new Prisma.Decimal(0);
    const credit = row._sum.credit ?? new Prisma.Decimal(0);
    const debitFils = debit.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const creditFils = credit.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const net = debitFils - creditFils;
    if (net === 0) return [];
    return [{
      accountId: account.id,
      name: account.name,
      statementGroupName: account.accountType.statementGroup.name,
      typeName: account.accountType.name,
      debitFils: net > 0 ? net : 0,
      creditFils: net < 0 ? -net : 0,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  const debitFils = rows.reduce((sum, row) => sum + row.debitFils, 0);
  const creditFils = rows.reduce((sum, row) => sum + row.creditFils, 0);
  return { rows, debitFils, creditFils };
}
