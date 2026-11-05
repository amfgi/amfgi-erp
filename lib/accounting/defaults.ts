import type { AccountNormalSide, FinancialStatementSection, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_STATEMENT_GROUPS: Array<{
  name: string;
  normalSide: AccountNormalSide;
  reportsOn: FinancialStatementSection;
  sortOrder: number;
}> = [
  { name: 'Asset', normalSide: 'DEBIT', reportsOn: 'BALANCE_SHEET', sortOrder: 10 },
  { name: 'Liability', normalSide: 'CREDIT', reportsOn: 'BALANCE_SHEET', sortOrder: 20 },
  { name: 'Equity', normalSide: 'CREDIT', reportsOn: 'BALANCE_SHEET', sortOrder: 30 },
  { name: 'Income', normalSide: 'CREDIT', reportsOn: 'PROFIT_AND_LOSS', sortOrder: 40 },
  { name: 'Cost of Goods Sold', normalSide: 'DEBIT', reportsOn: 'PROFIT_AND_LOSS', sortOrder: 50 },
  { name: 'Expense', normalSide: 'DEBIT', reportsOn: 'PROFIT_AND_LOSS', sortOrder: 60 },
];

export const DEFAULT_ACCOUNT_TYPES: Array<{
  name: string;
  statementGroupName: string;
  increaseSide: AccountNormalSide;
  sortOrder: number;
}> = [
  { name: 'Bank', statementGroupName: 'Asset', increaseSide: 'DEBIT', sortOrder: 10 },
  { name: 'Accounts Receivable', statementGroupName: 'Asset', increaseSide: 'DEBIT', sortOrder: 20 },
  { name: 'Other Current Asset', statementGroupName: 'Asset', increaseSide: 'DEBIT', sortOrder: 30 },
  { name: 'Fixed Asset', statementGroupName: 'Asset', increaseSide: 'DEBIT', sortOrder: 40 },
  { name: 'Other Asset', statementGroupName: 'Asset', increaseSide: 'DEBIT', sortOrder: 50 },
  { name: 'Accounts Payable', statementGroupName: 'Liability', increaseSide: 'CREDIT', sortOrder: 60 },
  { name: 'Credit Card', statementGroupName: 'Liability', increaseSide: 'CREDIT', sortOrder: 70 },
  { name: 'Other Current Liability', statementGroupName: 'Liability', increaseSide: 'CREDIT', sortOrder: 80 },
  { name: 'Long Term Liability', statementGroupName: 'Liability', increaseSide: 'CREDIT', sortOrder: 90 },
  { name: 'Loan', statementGroupName: 'Liability', increaseSide: 'CREDIT', sortOrder: 100 },
  { name: 'Equity', statementGroupName: 'Equity', increaseSide: 'CREDIT', sortOrder: 110 },
  { name: 'Income', statementGroupName: 'Income', increaseSide: 'CREDIT', sortOrder: 120 },
  { name: 'Other Income', statementGroupName: 'Income', increaseSide: 'CREDIT', sortOrder: 130 },
  { name: 'Cost of Goods Sold', statementGroupName: 'Cost of Goods Sold', increaseSide: 'DEBIT', sortOrder: 140 },
  { name: 'Expense', statementGroupName: 'Expense', increaseSide: 'DEBIT', sortOrder: 150 },
  { name: 'Other Expense', statementGroupName: 'Expense', increaseSide: 'DEBIT', sortOrder: 160 },
];

const STARTER_ACCOUNTS: Array<{ typeName: string; accountName: string }> = [
  { typeName: 'Bank', accountName: 'Bank' },
  { typeName: 'Accounts Receivable', accountName: 'Accounts Receivable' },
  { typeName: 'Accounts Payable', accountName: 'Accounts Payable' },
  { typeName: 'Other Current Liability', accountName: 'VAT' },
  { typeName: 'Equity', accountName: "Owner's capital" },
  { typeName: 'Income', accountName: 'Sales' },
  { typeName: 'Cost of Goods Sold', accountName: 'Cost of Goods Sold' },
  { typeName: 'Expense', accountName: 'Salaries' },
];

/** Inserts editable starter groups, types, and chart only when that company list is still empty. */
export async function ensureAccountingDefaults(db: Db, companyId: string): Promise<void> {
  const groupCount = await db.ledgerStatementGroup.count({ where: { companyId } });
  if (groupCount === 0) {
    await db.ledgerStatementGroup.createMany({
      data: DEFAULT_STATEMENT_GROUPS.map((row) => ({
        id: randomUUID(),
        companyId,
        name: row.name,
        normalSide: row.normalSide,
        reportsOn: row.reportsOn,
        sortOrder: row.sortOrder,
      })),
    });
  }

  const typeCount = await db.ledgerAccountType.count({ where: { companyId } });
  if (typeCount > 0) return;

  const groups = await db.ledgerStatementGroup.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const groupIdByName = new Map(groups.map((row) => [row.name, row.id]));

  await db.ledgerAccountType.createMany({
    data: DEFAULT_ACCOUNT_TYPES.flatMap((row) => {
      const statementGroupId = groupIdByName.get(row.statementGroupName);
      if (!statementGroupId) return [];
      return [{
        id: randomUUID(),
        companyId,
        statementGroupId,
        name: row.name,
        increaseSide: row.increaseSide,
        sortOrder: row.sortOrder,
        isActive: true,
      }];
    }),
  });

  const types = await db.ledgerAccountType.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const typeIdByName = new Map(types.map((row) => [row.name, row.id]));

  await db.ledgerAccount.createMany({
    data: STARTER_ACCOUNTS.flatMap((row) => {
      const accountTypeId = typeIdByName.get(row.typeName);
      if (!accountTypeId) return [];
      return [{
        id: randomUUID(),
        companyId,
        accountTypeId,
        name: row.accountName,
        isActive: true,
      }];
    }),
  });
}
