import type { Prisma, PrismaClient } from '@prisma/client';

export type EmailProvider = 'env' | 'resend' | 'smtp' | 'webhook';

export type ResendEmailConfig = {
  apiKey: string;
  from: string;
};

export type SmtpEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export type WebhookEmailConfig = {
  url: string;
  bearerToken?: string;
  headers?: Record<string, string>;
};

export type EmailSettingsRecord = {
  provider: EmailProvider;
  resend?: ResendEmailConfig;
  smtp?: SmtpEmailConfig;
  webhook?: WebhookEmailConfig;
};

const GLOBAL_ID = 'global';
const SECRET_PLACEHOLDER = '__UNCHANGED__';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseProvider(v: unknown): EmailProvider {
  if (v === 'resend' || v === 'smtp' || v === 'webhook' || v === 'env') return v;
  return 'env';
}

export function parseEmailConfigJson(raw: unknown): EmailSettingsRecord {
  const base: EmailSettingsRecord = { provider: 'env' };
  if (!isRecord(raw)) return base;

  const provider = parseProvider(raw.provider);
  base.provider = provider;

  if (isRecord(raw.resend)) {
    const apiKey = String(raw.resend.apiKey ?? '').trim();
    const from = String(raw.resend.from ?? '').trim();
    if (apiKey && from) base.resend = { apiKey, from };
  }

  if (isRecord(raw.smtp)) {
    const host = String(raw.smtp.host ?? '').trim();
    const from = String(raw.smtp.from ?? '').trim();
    const port = Number(raw.smtp.port ?? 587);
    if (host && from) {
      base.smtp = {
        host,
        port: Number.isFinite(port) ? port : 587,
        secure: raw.smtp.secure === true,
        user: String(raw.smtp.user ?? '').trim() || undefined,
        password: String(raw.smtp.password ?? '').trim() || undefined,
        from,
      };
    }
  }

  if (isRecord(raw.webhook)) {
    const url = String(raw.webhook.url ?? '').trim();
    if (url) {
      const headers: Record<string, string> = {};
      if (isRecord(raw.webhook.headers)) {
        for (const [k, v] of Object.entries(raw.webhook.headers)) {
          if (typeof v === 'string' && k.trim()) headers[k.trim()] = v;
        }
      }
      base.webhook = {
        url,
        bearerToken: String(raw.webhook.bearerToken ?? '').trim() || undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      };
    }
  }

  return base;
}

export async function loadStoredEmailSettings(db: PrismaClient): Promise<EmailSettingsRecord | null> {
  const row = await db.systemEmailSettings.findUnique({ where: { id: GLOBAL_ID } });
  if (!row) return null;
  return parseEmailConfigJson({ provider: row.provider, ...((row.config as object) ?? {}) });
}

export function envFallbackEmailSettings(): EmailSettingsRecord {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (apiKey && from) {
    return { provider: 'env', resend: { apiKey, from } };
  }
  return { provider: 'env' };
}

/** Active settings: DB row when provider !== env, else env vars. */
export async function resolveEmailSettings(db: PrismaClient): Promise<EmailSettingsRecord> {
  const stored = await loadStoredEmailSettings(db);
  if (stored && stored.provider !== 'env') return stored;
  return envFallbackEmailSettings();
}

export function maskSecret(value: string | undefined): { configured: boolean; last4: string | null } {
  if (!value?.trim()) return { configured: false, last4: null };
  const v = value.trim();
  return { configured: true, last4: v.length >= 4 ? v.slice(-4) : '****' };
}

export function maskEmailSettingsForClient(settings: EmailSettingsRecord) {
  return {
    provider: settings.provider,
    resend: settings.resend
      ? {
          from: settings.resend.from,
          apiKey: maskSecret(settings.resend.apiKey),
        }
      : undefined,
    smtp: settings.smtp
      ? {
          host: settings.smtp.host,
          port: settings.smtp.port,
          secure: settings.smtp.secure,
          user: settings.smtp.user ?? '',
          from: settings.smtp.from,
          password: maskSecret(settings.smtp.password),
        }
      : undefined,
    webhook: settings.webhook
      ? {
          url: settings.webhook.url,
          bearerToken: maskSecret(settings.webhook.bearerToken),
          headers: settings.webhook.headers ?? {},
        }
      : undefined,
    envConfigured: Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim()),
  };
}

export function mergeEmailSettingsPatch(
  existing: EmailSettingsRecord | null,
  body: unknown,
): EmailSettingsRecord {
  const incoming = parseEmailConfigJson(body);
  const prev = existing ?? { provider: 'env' as const };

  const mergeSecret = (next?: string, prevSecret?: string) => {
    if (!next || next === SECRET_PLACEHOLDER) return prevSecret;
    return next;
  };

  if (incoming.provider === 'env') {
    return { provider: 'env' };
  }

  if (incoming.provider === 'resend') {
    return {
      provider: 'resend',
      resend: {
        from: incoming.resend?.from ?? prev.resend?.from ?? '',
        apiKey: mergeSecret(incoming.resend?.apiKey, prev.resend?.apiKey) ?? '',
      },
    };
  }

  if (incoming.provider === 'smtp') {
    return {
      provider: 'smtp',
      smtp: {
        host: incoming.smtp?.host ?? prev.smtp?.host ?? '',
        port: incoming.smtp?.port ?? prev.smtp?.port ?? 587,
        secure: incoming.smtp?.secure ?? prev.smtp?.secure ?? false,
        user: incoming.smtp?.user ?? prev.smtp?.user,
        from: incoming.smtp?.from ?? prev.smtp?.from ?? '',
        password: mergeSecret(incoming.smtp?.password, prev.smtp?.password),
      },
    };
  }

  return {
    provider: 'webhook',
    webhook: {
      url: incoming.webhook?.url ?? prev.webhook?.url ?? '',
      bearerToken: mergeSecret(incoming.webhook?.bearerToken, prev.webhook?.bearerToken),
      headers: incoming.webhook?.headers ?? prev.webhook?.headers,
    },
  };
}

export async function saveEmailSettings(
  db: PrismaClient,
  settings: EmailSettingsRecord,
  updatedById: string,
) {
  const { provider, ...rest } = settings;
  await db.systemEmailSettings.upsert({
    where: { id: GLOBAL_ID },
    create: {
      id: GLOBAL_ID,
      provider,
      config: rest as Prisma.InputJsonValue,
      updatedById,
    },
    update: {
      provider,
      config: rest as Prisma.InputJsonValue,
      updatedById,
    },
  });
}

export { SECRET_PLACEHOLDER };

export function validateEmailSettings(settings: EmailSettingsRecord): string | null {
  if (settings.provider === 'env') return null;
  if (settings.provider === 'resend') {
    if (!settings.resend?.from) return 'Resend "From" address is required';
    if (!settings.resend?.apiKey) return 'Resend API key is required';
    return null;
  }
  if (settings.provider === 'smtp') {
    if (!settings.smtp?.host) return 'SMTP host is required';
    if (!settings.smtp?.from) return 'SMTP from address is required';
    return null;
  }
  if (settings.provider === 'webhook') {
    if (!settings.webhook?.url) return 'Webhook URL is required';
    try {
      const u = new URL(settings.webhook.url);
      if (u.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        return 'Webhook URL must use HTTPS in production';
      }
    } catch {
      return 'Webhook URL is invalid';
    }
    return null;
  }
  return null;
}
