import { prisma } from '@/lib/db/prisma';
import { sendMail } from '@/lib/mail/sendMail';

function appBaseUrl(): string {
  const base =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (!base) return 'http://localhost:3000';
  if (base.startsWith('http')) return base.replace(/\/$/, '');
  return `https://${base.replace(/\/$/, '')}`;
}

export function buildPasswordResetUrl(rawToken: string): string {
  const url = new URL('/login', appBaseUrl());
  url.searchParams.set('reset', rawToken);
  return url.toString();
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  userName?: string | null;
}): Promise<{ sent: boolean; devLogged: boolean }> {
  const subject = 'Reset your AMFGI ERP password';
  const greeting = params.userName?.trim() ? `Hi ${params.userName.trim()},` : 'Hi,';
  const html = `
    <p>${greeting}</p>
    <p>We received a request to reset your password. This link expires in one hour.</p>
    <p><a href="${params.resetUrl}">Reset password</a></p>
    <p>If you did not request this, you can ignore this email.</p>
    <p style="color:#64748b;font-size:12px;">AMFGI ERP — Almuraqib Fiber Glass Industry</p>
  `.trim();

  const result = await sendMail(prisma, {
    to: params.to,
    subject,
    html,
  });

  let devLogged = result.devLogged;
  if (!result.sent && process.env.NODE_ENV !== 'production') {
    console.info('[password-reset] Reset link:\n', params.resetUrl);
    devLogged = true;
  }

  return { sent: result.sent, devLogged };
}

export async function isPasswordResetMailConfigured(): Promise<boolean> {
  const { isMailConfigured } = await import('@/lib/mail/sendMail');
  return isMailConfigured(prisma);
}
