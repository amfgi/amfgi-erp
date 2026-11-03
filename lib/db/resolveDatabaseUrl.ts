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

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function databaseUrlHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isLoopbackDatabaseHost(host: string | null): boolean {
  return host != null && LOOPBACK_HOSTS.has(host);
}

/**
 * Next.js does not override a DATABASE_URL already set in the shell.
 * A remote URL left over from a migrate command would make `npm run dev`
 * talk to that server. In development, keep the local database from `.env`.
 */
export function chooseAppDatabaseUrl(
  processUrl: string | undefined,
  fileUrl: string | undefined,
  nodeEnv: string | undefined,
): string {
  const fromProcess = processUrl?.trim() || undefined;
  const fromFile = fileUrl?.trim() || undefined;

  if (nodeEnv === 'development' && fromFile && fromProcess) {
    const processHost = databaseUrlHost(fromProcess);
    const fileHost = databaseUrlHost(fromFile);
    if (isLoopbackDatabaseHost(fileHost) && processHost && !isLoopbackDatabaseHost(processHost)) {
      return normalizePostgresUrl(fromFile);
    }
  }

  const chosen = fromProcess ?? fromFile;
  if (!chosen) {
    throw new Error('DATABASE_URL is not set.');
  }
  return normalizePostgresUrl(chosen);
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
