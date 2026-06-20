'use client';

import { useEffect } from 'react';

export const HR_LIVE_UPDATE_EVENT = 'amfgi:hr-changed';

export type HrLiveUpdateDetail = {
  entity?: 'employee' | string;
  action?: string;
  at?: string;
};

export function notifyHrLiveUpdate(detail?: HrLiveUpdateDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HR_LIVE_UPDATE_EVENT, { detail }));
}

export function useHrLiveUpdate(onUpdate: () => void) {
  useEffect(() => {
    const handler = () => onUpdate();
    window.addEventListener(HR_LIVE_UPDATE_EVENT, handler);
    return () => window.removeEventListener(HR_LIVE_UPDATE_EVENT, handler);
  }, [onUpdate]);
}
