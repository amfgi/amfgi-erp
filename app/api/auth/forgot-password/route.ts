import { prisma } from '@/lib/db/prisma';
import { createPasswordResetForUser } from '@/lib/auth/passwordReset';
import { buildPasswordResetUrl, sendPasswordResetEmail } from '@/lib/auth/sendPasswordResetEmail';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ForgotSchema = z.object({
  email: z.string().email(),
});

const GENERIC_MESSAGE =
  'If an account exists for that email, we sent password reset instructions. Check your inbox.';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ForgotSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const email = parsed.data.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isActive: true, password: true },
  });

  if (user?.isActive && user.password) {
    const { raw } = await createPasswordResetForUser(prisma, user.id);
    const resetUrl = buildPasswordResetUrl(raw);
    await sendPasswordResetEmail({
      to: email,
      resetUrl,
      userName: user.name,
    });
  }

  return successResponse({ message: GENERIC_MESSAGE });
}
