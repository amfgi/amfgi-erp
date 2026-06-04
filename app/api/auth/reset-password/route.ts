import { prisma } from '@/lib/db/prisma';
import { passwordMeetsPolicy, resetPasswordWithToken } from '@/lib/auth/passwordReset';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ResetSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ResetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  if (!passwordMeetsPolicy(parsed.data.password, 8)) {
    return errorResponse('Password must be at least 8 characters.', 422);
  }

  const result = await resetPasswordWithToken(prisma, parsed.data.token, parsed.data.password);

  if (result === 'expired') {
    return errorResponse('This reset link has expired. Request a new one.', 410);
  }
  if (result === 'invalid') {
    return errorResponse('Invalid or already used reset link.', 400);
  }

  return successResponse({ message: 'Password updated. You can sign in with your new password.' });
}
