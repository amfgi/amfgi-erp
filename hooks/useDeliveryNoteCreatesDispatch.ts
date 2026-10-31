'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { readCompanyOperationalSettings } from '@/lib/utils/companyOperationalSettings';

/** `null` while the active company setting is still loading. */
export function useDeliveryNoteCreatesDispatch(): boolean | null {
  const { data: session } = useSession();
  const companyId = session?.user?.activeCompanyId;
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!companyId) {
      setEnabled(false);
      return;
    }

    let cancelled = false;
    setEnabled(null);

    void fetch(`/api/companies/${companyId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ data?: { operationalSettings?: unknown } }>;
      })
      .then((body) => {
        if (cancelled) return;
        setEnabled(readCompanyOperationalSettings(body?.data?.operationalSettings).deliveryNoteCreatesDispatch);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return enabled;
}
