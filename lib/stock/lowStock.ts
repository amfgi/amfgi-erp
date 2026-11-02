import { Prisma } from '@prisma/client';

export const LOW_STOCK_PREVIEW_LIMIT = 8;

/** Active materials whose company stock is at or below a set reorder level. */
export function lowStockMaterialsFromSql(companyId: string) {
  return Prisma.sql`
    FROM "Material"
    WHERE "companyId" = ${companyId}
      AND "isActive" = true
      AND "reorderLevel" IS NOT NULL
      AND "currentStock" <= "reorderLevel"
  `;
}
