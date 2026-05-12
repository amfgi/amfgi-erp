import { auth } from '@/auth';
import { exchangeGoogleDriveAuthorizationCode, explainGoogleDriveError } from '@/lib/utils/googleDrive';
import { setGlobalGoogleDriveConfig } from '@/lib/utils/globalSettings';
import { cookies } from 'next/headers';

function redirectToSettings(request: Request, status: string, message?: string) {
  const url = new URL('/settings', request.url);
  url.searchParams.set('tab', 'drive');
  url.searchParams.set('driveConnected', status);
  if (message) url.searchParams.set('driveMessage', message);
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return redirectToSettings(request, 'error', 'Unauthorized');

  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim();
  const oauthError = url.searchParams.get('error')?.trim();
  if (oauthError) {
    return redirectToSettings(request, 'error', oauthError);
  }
  if (!code || !state) {
    return redirectToSettings(request, 'error', 'Missing OAuth response data');
  }

  const cookieStore = await cookies();
  const rawState = cookieStore.get('google_drive_oauth_state')?.value;
  cookieStore.delete('google_drive_oauth_state');

  let expectedState = '';
  try {
    const parsed = rawState ? (JSON.parse(rawState) as { state?: string }) : null;
    expectedState = parsed?.state?.trim() ?? '';
  } catch {
    expectedState = '';
  }

  if (!expectedState || expectedState !== state) {
    return redirectToSettings(request, 'error', 'Google Drive authorization state mismatch');
  }

  try {
    const { refreshToken, connectedEmail } = await exchangeGoogleDriveAuthorizationCode({
      code,
      origin: url.origin,
    });

    await setGlobalGoogleDriveConfig({
      refreshToken,
      connectedAt: new Date().toISOString(),
      connectedEmail: connectedEmail ?? null,
    });

    return redirectToSettings(request, 'connected', connectedEmail ?? 'Connected');
  } catch (error) {
    return redirectToSettings(request, 'error', explainGoogleDriveError(error));
  }
}
