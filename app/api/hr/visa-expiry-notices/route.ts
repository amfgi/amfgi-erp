import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { runVisaExpiryNotices } from '@/lib/mail/notifyVisaExpiry';

function providedSecret(request: Request): string {
  const header = request.headers.get('x-cron-secret')?.trim();
  if (header) return header;
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? '';
}

function secretMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const expected = process.env.CRON_SECRET?.trim() ?? '';
  if (!expected || !secretMatches(providedSecret(request), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runVisaExpiryNotices();
  return NextResponse.json({ ok: true, ...result });
}
