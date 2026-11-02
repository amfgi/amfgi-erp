import type { PrismaClient } from '@prisma/client';
import {
  resolveEmailSettings,
  type EmailSettingsRecord,
} from '@/lib/mail/emailSettings';

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

type SendAttempt = { ok: boolean; error?: string };

function clipError(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function sendResend(config: { apiKey: string; from: string }, input: SendMailInput): Promise<SendAttempt> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[mail] Resend error:', res.status, text);
    return { ok: false, error: clipError(`Resend ${res.status}: ${text || 'request failed'}`) };
  }
  return { ok: true };
}

async function sendSmtp(
  config: NonNullable<EmailSettingsRecord['smtp']>,
  input: SendMailInput,
): Promise<SendAttempt> {
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
    try {
      await transport.sendMail({
        from: config.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return { ok: true };
    } finally {
      transport.close();
    }
  } catch (err) {
    console.error('[mail] SMTP send failed:', err);
    const message = err instanceof Error ? err.message : 'SMTP send failed';
    return { ok: false, error: clipError(message) };
  }
}

async function sendWebhook(
  config: NonNullable<EmailSettingsRecord['webhook']>,
  input: SendMailInput,
): Promise<SendAttempt> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers ?? {}),
  };
  if (config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  const res = await fetch(config.url, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers,
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.subject,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[mail] Webhook error:', res.status, text);
    return { ok: false, error: clipError(`Webhook ${res.status}: ${text || 'request failed'}`) };
  }
  return { ok: true };
}

const NOT_CONFIGURED = 'Mail provider is not configured';

export async function sendMail(
  db: PrismaClient,
  input: SendMailInput,
): Promise<{ sent: boolean; devLogged: boolean; provider: string; error?: string }> {
  const settings = await resolveEmailSettings(db);
  let sent = false;
  let error: string | undefined = NOT_CONFIGURED;

  if (settings.provider === 'resend' && settings.resend) {
    const attempt = await sendResend(settings.resend, input);
    sent = attempt.ok;
    error = attempt.error;
  } else if (settings.provider === 'smtp' && settings.smtp) {
    const attempt = await sendSmtp(settings.smtp, input);
    sent = attempt.ok;
    error = attempt.error;
  } else if (settings.provider === 'webhook' && settings.webhook) {
    const attempt = await sendWebhook(settings.webhook, input);
    sent = attempt.ok;
    error = attempt.error;
  } else if (settings.resend) {
    const attempt = await sendResend(settings.resend, input);
    sent = attempt.ok;
    error = attempt.error;
  }

  let devLogged = false;
  if (!sent && process.env.NODE_ENV !== 'production') {
    console.info('[mail] Not sent (check Settings → Email). Would send to:', input.to, 'subject:', input.subject);
    devLogged = true;
  }

  return { sent, devLogged, provider: settings.provider, error: sent ? undefined : error };
}

export async function isMailConfigured(db: PrismaClient): Promise<boolean> {
  const settings = await resolveEmailSettings(db);
  if (settings.provider === 'resend' && settings.resend?.apiKey && settings.resend.from) return true;
  if (settings.provider === 'smtp' && settings.smtp?.host && settings.smtp.from) return true;
  if (settings.provider === 'webhook' && settings.webhook?.url) return true;
  if (settings.resend?.apiKey && settings.resend.from) return true;
  return false;
}
