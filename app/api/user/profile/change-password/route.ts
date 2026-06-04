import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { passwordMeetsPolicy } from '@/lib/auth/passwordReset';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  if (!passwordMeetsPolicy(parsed.data.newPassword, 8)) {
    return errorResponse('Password must be at least 8 characters.', 422);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, isActive: true },
  });

  if (!user || !user.isActive) return errorResponse('User not found', 404);

  if (user.password) {
    const current = parsed.data.currentPassword ?? '';
    if (!current) {
      return errorResponse('Current password is required', 422);
    }
    const valid = await bcrypt.compare(current, user.password);
    if (!valid) return errorResponse('Current password is incorrect', 400);
  }

  const sameAsCurrent =
    user.password && (await bcrypt.compare(parsed.data.newPassword, user.password));
  if (sameAsCurrent) {
    return errorResponse('New password must be different from the current password', 422);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  return successResponse({ message: 'Password updated successfully' });
}
