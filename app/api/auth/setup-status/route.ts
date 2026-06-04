import { prisma } from '@/lib/db/prisma';
import { successResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const userCount = await prisma.user.count();
  const googleSignInEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  return successResponse({ needsSetup: userCount === 0, googleSignInEnabled });
}
