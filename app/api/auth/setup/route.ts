import { prisma } from '@/lib/db/prisma';
import { bootstrapFirstAdmin, slugifyCompanySlug } from '@/lib/auth/bootstrapCompany';
import { passwordMeetsPolicy } from '@/lib/auth/passwordReset';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const SetupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(12).max(128),
  companyName: z.string().min(1).max(120),
  companySlug: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return errorResponse('System is already set up. Sign in or contact an administrator.', 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  if (!passwordMeetsPolicy(parsed.data.password, 12)) {
    return errorResponse('Password must be at least 12 characters.', 422);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const slug = slugifyCompanySlug(
    parsed.data.companySlug?.trim() || parsed.data.companyName,
  );

  const slugTaken = await prisma.company.findFirst({ where: { slug } });
  if (slugTaken) {
    return errorResponse('Company URL slug is already in use. Choose another.', 409);
  }

  try {
    const result = await bootstrapFirstAdmin(prisma, {
      adminName: parsed.data.name,
      adminEmail: email,
      adminPassword: parsed.data.password,
      companyName: parsed.data.companyName,
      companySlug: slug,
    });

    return successResponse(
      {
        message: 'Administrator account created. You can sign in now.',
        company: { id: result.companyId, name: result.companyName, slug: result.companySlug },
        user: { id: result.userId, email: result.userEmail },
      },
      201,
    );
  } catch (err) {
    console.error('Setup bootstrap error:', err);
    return errorResponse('Failed to complete setup. Try again or use seed:production.', 500);
  }
}
