import { Prisma } from '@prisma/client';

export function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

export function decimalToNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (isPrismaDecimal(value)) return value.toNumber();
  return undefined;
}

export function nullableDecimalToNumber(value: unknown): number | null {
  const parsed = decimalToNumber(value);
  return parsed === undefined ? null : parsed;
}

export function decimalToNumberOrZero(value: unknown): number {
  return decimalToNumber(value) ?? 0;
}

/** Stock qty columns use `@db.Decimal(18, 3)`. Normalize before gte/decrement so JS floats like 95.4 are not sent as 95.400000000000005684. */
export const STOCK_QTY_DECIMAL_PLACES = 3;

export function toStockQtyDecimal(value: unknown): Prisma.Decimal {
  const numeric = decimalToNumberOrZero(value);
  return new Prisma.Decimal(numeric).toDecimalPlaces(
    STOCK_QTY_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP
  );
}

export function roundStockQty(value: unknown): number {
  return toStockQtyDecimal(value).toNumber();
}

export function decimalEqualsNullable(
  left: Prisma.Decimal | number | string | null | undefined,
  right: Prisma.Decimal | number | string | null | undefined
): boolean {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing || rightMissing) return leftMissing === rightMissing;

  const leftDecimal = isPrismaDecimal(left) ? left : new Prisma.Decimal(left);
  const rightDecimal = isPrismaDecimal(right) ? right : new Prisma.Decimal(right);
  return leftDecimal.equals(rightDecimal);
}

export function serializePrismaDecimals<T>(value: T): T {
  if (isPrismaDecimal(value)) {
    return value.toNumber() as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializePrismaDecimals(entry)) as T;
  }
  if (value instanceof Date || value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      serializePrismaDecimals(entry),
    ]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}
