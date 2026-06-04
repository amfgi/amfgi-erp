/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reloads modules which would normally cause a new
 * PrismaClient to be instantiated on every save. We cache it on `globalThis`
 * to keep a single connection pool across HMR cycles.
 *
 * In production, this module is imported once and `prisma` is created once.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/prisma';
 *   const materials = await prisma.material.findMany({ where: { companyId } });
 *
 * Transactions:
 *   await prisma.$transaction(async (tx) => {
 *     await tx.material.update(...);
 *     await tx.transaction.create(...);
 *   });
 *   // Throws inside the callback → automatic rollback.
 */
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter, type PostgresPrismaAdapter } from './postgresAdapter';

declare global {
  var _prisma: PrismaClient | undefined;
  var _prismaAdapter: PostgresPrismaAdapter | undefined;
}

const prismaLog =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

function prismaClientHasExpectedModels(client: PrismaClient): boolean {
  return ['mediaAsset', 'globalSetting'].every(
    (modelName) => modelName in (client as PrismaClient & Record<string, unknown>)
  );
}

// After `prisma generate`, Next dev can still hold a pre-generate client on `global._prisma`.
const existingPrisma: PrismaClient | undefined = global._prisma;
if (
  process.env.NODE_ENV !== 'production' &&
  existingPrisma &&
  !prismaClientHasExpectedModels(existingPrisma)
) {
  void existingPrisma.$disconnect();
  global._prisma = undefined;
  global._prismaAdapter = undefined;
}

// HMR reloads this module but must not create a new pg pool each time (exhausts Aiven slots).
const prismaAdapter =
  global._prismaAdapter ?? createPostgresAdapter(databaseUrl);

export const prisma =
  global._prisma ??
  new PrismaClient({
    log: [...prismaLog],
    adapter: prismaAdapter,
  });

if (process.env.NODE_ENV !== 'production') {
  global._prisma = prisma;
  global._prismaAdapter = prismaAdapter;
}
