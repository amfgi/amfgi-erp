/** Auth.js / NextAuth error query values → user-facing copy for the login screen. */
const LOGIN_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  NotRegistered: {
    title: 'Google account not registered',
    description:
      'This Google account is not linked to AMFGI ERP. Ask your administrator to create a user with this email, or sign in with email and password.',
  },
  GoogleNotRegistered: {
    title: 'Google account not registered',
    description:
      'This Google account is not linked to AMFGI ERP. Ask your administrator to create a user with this email, or sign in with email and password.',
  },
  AccountDisabled: {
    title: 'Account disabled',
    description: 'Your user account has been deactivated. Contact your administrator to restore access.',
  },
  CredentialsSignin: {
    title: 'Sign-in failed',
    description: 'The email or password you entered is incorrect. Check your details and try again.',
  },
  AccessDenied: {
    title: 'Access denied',
    description: 'You do not have permission to sign in with this method. Contact your administrator.',
  },
  Configuration: {
    title: 'Sign-in unavailable',
    description: 'Authentication is not configured correctly on the server. Contact your administrator.',
  },
  Verification: {
    title: 'Verification failed',
    description: 'The sign-in link is invalid or has expired. Request a new link and try again.',
  },
  OAuthSignin: {
    title: 'Google sign-in failed',
    description: 'Could not start Google sign-in. Try again or use email and password.',
  },
  OAuthCallback: {
    title: 'Google sign-in failed',
    description: 'Something went wrong after Google redirected back. Try again or use email and password.',
  },
  OAuthAccountNotLinked: {
    title: 'Account not linked',
    description:
      'This email is already registered with a different sign-in method. Use the method you originally signed up with.',
  },
  SessionRequired: {
    title: 'Session expired',
    description: 'Please sign in again to continue.',
  },
  Default: {
    title: 'Could not sign you in',
    description: 'Something went wrong during sign-in. Try again or contact your administrator.',
  },
};

export type LoginErrorMessage = { code: string; title: string; description: string };

export function resolveLoginErrorMessage(code: string | null | undefined): LoginErrorMessage | null {
  if (!code?.trim()) return null;
  const key = code.trim();
  const entry = LOGIN_ERROR_MESSAGES[key] ?? LOGIN_ERROR_MESSAGES.Default;
  return { code: key, title: entry.title, description: entry.description };
}
