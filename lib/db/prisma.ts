/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reloads modules which would normally cause a new
 * PrismaClient to be instantiated on every save. We cache it on `globalThis`
 * to keep a single connection pool across HMR cycles.
 *
 * After `prisma generate`, a Proxy ensures stale cached clients (missing new
 * model delegates) are replaced on the next access.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/prisma';
 *   const materials = await prisma.material.findMany({ where: { companyId } });
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter, type PostgresPrismaAdapter } from './postgresAdapter';
import { chooseAppDatabaseUrl, databaseUrlHost } from './resolveDatabaseUrl';
import { defaultTransactionOptions, type PrismaTransactionOptions } from './transactionOptions';

declare global {
  var _prisma: PrismaClient | undefined;
  var _prismaAdapter: PostgresPrismaAdapter | undefined;
  var _prismaDatabaseUrl: string | undefined;
}

const prismaLog =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);

const DEV_ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env'] as const;

function readDatabaseUrlFromEnvFiles(): string | undefined {
  for (const name of DEV_ENV_FILES) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(process.cwd(), name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1 || trimmed.slice(0, eq).trim() !== 'DATABASE_URL') continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    }
  }
  return undefined;
}

let warnedAboutShellDatabaseUrl = false;

function getDatabaseUrl(): string {
  const fileUrl =
    process.env.NODE_ENV === 'development' ? readDatabaseUrlFromEnvFiles() : undefined;
  const chosen = chooseAppDatabaseUrl(process.env.DATABASE_URL, fileUrl, process.env.NODE_ENV);
  if (!warnedAboutShellDatabaseUrl && process.env.NODE_ENV === 'development') {
    const processHost = databaseUrlHost(process.env.DATABASE_URL);
    const chosenHost = databaseUrlHost(chosen);
    if (processHost && chosenHost && processHost !== chosenHost) {
      warnedAboutShellDatabaseUrl = true;
      console.warn(
        `[db] Development is using the local database from .env (${chosenHost}), not the shell DATABASE_URL (${processHost}).`,
      );
    }
  }
  return chosen;
}

/** Model delegates that must exist; extend when adding new Prisma models. */
const REQUIRED_PRISMA_DELEGATES = ['mediaAsset', 'globalSetting', 'payRun', 'payRunLine', 'quotationTermsTemplate', 'quotationCustomSection', 'quotationSectionPreset', 'salesWorkLog'] as const

function prismaClientHasExpectedModels(client: PrismaClient): boolean {
  return REQUIRED_PRISMA_DELEGATES.every(
    (modelName) => modelName in (client as PrismaClient & Record<string, unknown>)
  );
}

function resolvePrismaClient(): PrismaClient {
  const databaseUrl = getDatabaseUrl();
  const existing = global._prisma;
  if (
    existing &&
    global._prismaDatabaseUrl === databaseUrl &&
    prismaClientHasExpectedModels(existing)
  ) {
    return existing;
  }

  // Drop stale client only — do not $disconnect(); that would close the shared pg pool
  // while global._prismaAdapter is still cached, leaking slots on the next access.
  global._prisma = undefined;
  if (global._prismaDatabaseUrl !== databaseUrl) {
    global._prismaAdapter = undefined;
  }

  const adapter = global._prismaAdapter ?? createPostgresAdapter(databaseUrl);
  global._prismaDatabaseUrl = databaseUrl;
  const client = new PrismaClient({
    log: [...prismaLog],
    adapter,
  });

  // Always cache on globalThis. In dev this survives HMR; in production the Proxy
  // resolves the client on every property access, so without caching each access
  // would spawn a new pg pool and exhaust hosted DB connection limits.
  global._prisma = client;
  global._prismaAdapter = adapter;

  return client;
}

type TransactionArg = Parameters<PrismaClient['$transaction']>[0];
type TransactionOptionsArg = Parameters<PrismaClient['$transaction']>[1];

function runTransaction(
  client: PrismaClient,
  arg: TransactionArg,
  options?: TransactionOptionsArg
) {
  const merged: PrismaTransactionOptions = { ...defaultTransactionOptions, ...options };
  return client.$transaction(arg, merged);
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolvePrismaClient();
    if (prop === '$transaction') {
      return (arg: TransactionArg, options?: TransactionOptionsArg) =>
        runTransaction(client, arg, options);
    }
    const value = (client as PrismaClient & Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
