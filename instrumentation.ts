export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { runVisaExpiryNotices } = await import('@/lib/mail/notifyVisaExpiry');
  void runVisaExpiryNotices().catch((err) => {
    console.error('[visa-expiry] startup check failed:', err);
  });
}
