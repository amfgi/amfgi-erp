const ACCELERATE_HOST = 'accelerate.prisma-data.net';

export function isAccelerateOrPrismaProxyUrl(url: string): boolean {
  return (
    url.startsWith('prisma+postgres://') ||
    url.startsWith('prisma://') ||
    url.includes(ACCELERATE_HOST)
  );
}

/** Normalizes `postgres://` to `postgresql://` for node-pg / PrismaPg. */
export function normalizePostgresUrl(url: string): string {
  if (url.startsWith('postgres://')) {
    return `postgresql://${url.slice('postgres://'.length)}`;
  }
  return url;
}

function readDirectUrl(): string | undefined {
  return process.env.DIRECT_DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || undefined;
}

/**
 * Direct TCP URL for migrations, seed, and other long-running DB scripts.
 * Prefer DIRECT_DATABASE_URL; never use Prisma Accelerate for these workloads.
 */
export function resolveDatabaseUrlForScripts(script: 'seed' | 'migrate'): string {
  const direct = readDirectUrl();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  const chosen = direct ?? databaseUrl;
  if (!chosen) {
    throw new Error('DATABASE_URL is not set.');
  }

  if (!direct && isAccelerateOrPrismaProxyUrl(chosen)) {
    throw new Error(
      `Cannot run ${script} through Prisma Accelerate (timeouts on bulk writes). ` +
        'Set DIRECT_DATABASE_URL to your direct PostgreSQL URL ' +
        '(Prisma Data Platform → Connect → Direct TCP, or local postgresql://…). ' +
        'Keep DATABASE_URL as the Accelerate URL for the Next.js app.',
    );
  }

  if (isAccelerateOrPrismaProxyUrl(chosen)) {
    throw new Error(
      'DIRECT_DATABASE_URL must be a direct postgresql:// or postgres:// URL, not Prisma Accelerate.',
    );
  }

  return normalizePostgresUrl(chosen);
}
