import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateResetToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  return {
    raw,
    hash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  };
}

export async function createPasswordResetForUser(db: PrismaClient, userId: string) {
  await db.passwordResetToken.deleteMany({ where: { userId } });
  const { raw, hash, expiresAt } = generateResetToken();
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hash, expiresAt },
  });
  return { raw, expiresAt };
}

export async function resetPasswordWithToken(
  db: PrismaClient,
  rawToken: string,
  newPassword: string,
): Promise<'ok' | 'invalid' | 'expired'> {
  const tokenHash = hashResetToken(rawToken.trim());
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, isActive: true } } },
  });

  if (!row || !row.user.isActive) return 'invalid';
  if (row.expiresAt.getTime() < Date.now()) {
    await db.passwordResetToken.delete({ where: { id: row.id } });
    return 'expired';
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { password: passwordHash },
    }),
    db.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  return 'ok';
}

export function passwordMeetsPolicy(password: string, minLength = 8): boolean {
  return password.length >= minLength;
}
