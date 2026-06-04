import type { NextAuthConfig } from 'next-auth';

/** Stable secret for JWT/session cookies. Required in production. */
export function resolveAuthSecret(): string | undefined {
  const fromEnv =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'development') {
    return 'amfgi-dev-auth-secret-set-AUTH_SECRET-in-env';
  }

  return undefined;
}

/** Public site URL used for Auth.js callbacks and secure-cookie detection. */
export function resolveAuthUrl(): string | undefined {
  const raw =
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return raw?.replace(/\/$/, '');
}

/**
 * Secure session cookies (`__Secure-` / `__Host-` prefixes) for HTTPS deployments.
 * Set AUTH_COOKIE_SECURE=false only when the site is served over plain HTTP.
 */
export function shouldUseSecureAuthCookies(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'true') return true;
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;

  const authUrl = resolveAuthUrl();
  if (authUrl) return authUrl.startsWith('https://');

  return process.env.NODE_ENV === 'production';
}

export function buildAuthCookieOptions(): NonNullable<NextAuthConfig['cookies']> {
  const secure = shouldUseSecureAuthCookies();
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
    ...(domain ? { domain } : {}),
  };

  return {
    sessionToken: {
      name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: { ...base },
    },
    callbackUrl: {
      name: secure ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: { ...base, httpOnly: false },
    },
    csrfToken: {
      name: secure ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: { ...base },
    },
  };
}

export function warnIfAuthMisconfigured(): void {
  const secretFromEnv =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();

  if (!secretFromEnv) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[auth] AUTH_SECRET is missing. Generate one: openssl rand -base64 32',
      );
    } else {
      console.warn(
        '[auth] AUTH_SECRET is not set — using a built-in dev fallback. ' +
          'Old session cookies may log JWTSessionError until you clear site cookies or set a fixed AUTH_SECRET in .env.',
      );
    }
  } else if (process.env.NODE_ENV === 'production' && secretFromEnv.includes('REPLACE_WITH')) {
    console.warn(
      '[auth] AUTH_SECRET is still a placeholder. Generate one: openssl rand -base64 32',
    );
  }

  if (process.env.NODE_ENV !== 'production') return;

  const authUrl = resolveAuthUrl();
  if (!authUrl) {
    console.warn(
      '[auth] AUTH_URL is not set in production. Set AUTH_URL=https://your-domain.com on cPanel/custom hosts.',
    );
    return;
  }

  if (/localhost|127\.0\.0\.1/i.test(authUrl)) {
    console.warn(
      `[auth] AUTH_URL is "${authUrl}" but NODE_ENV=production. Sessions will fail on a real domain — use your public https URL.`,
    );
  }

}
