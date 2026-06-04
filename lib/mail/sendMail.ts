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

async function sendResend(config: { apiKey: string; from: string }, input: SendMailInput): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
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
  }
  return res.ok;
}

async function sendSmtp(
  config: NonNullable<EmailSettingsRecord['smtp']>,
  input: SendMailInput,
): Promise<boolean> {
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
    await transport.sendMail({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return true;
  } catch (err) {
    console.error('[mail] SMTP send failed:', err);
    return false;
  }
}

async function sendWebhook(
  config: NonNullable<EmailSettingsRecord['webhook']>,
  input: SendMailInput,
): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers ?? {}),
  };
  if (config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  const res = await fetch(config.url, {
    method: 'POST',
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
  }
  return res.ok;
}

export async function sendMail(
  db: PrismaClient,
  input: SendMailInput,
): Promise<{ sent: boolean; devLogged: boolean; provider: string }> {
  const settings = await resolveEmailSettings(db);
  let sent = false;

  if (settings.provider === 'resend' && settings.resend) {
    sent = await sendResend(settings.resend, input);
  } else if (settings.provider === 'smtp' && settings.smtp) {
    sent = await sendSmtp(settings.smtp, input);
  } else if (settings.provider === 'webhook' && settings.webhook) {
    sent = await sendWebhook(settings.webhook, input);
  } else if (settings.resend) {
    sent = await sendResend(settings.resend, input);
  }

  let devLogged = false;
  if (!sent && process.env.NODE_ENV !== 'production') {
    console.info('[mail] Not sent (check Settings → Email). Would send to:', input.to, 'subject:', input.subject);
    devLogged = true;
  }

  return { sent, devLogged, provider: settings.provider };
}

export async function isMailConfigured(db: PrismaClient): Promise<boolean> {
  const settings = await resolveEmailSettings(db);
  if (settings.provider === 'resend' && settings.resend?.apiKey && settings.resend.from) return true;
  if (settings.provider === 'smtp' && settings.smtp?.host && settings.smtp.from) return true;
  if (settings.provider === 'webhook' && settings.webhook?.url) return true;
  if (settings.resend?.apiKey && settings.resend.from) return true;
  return false;
}
