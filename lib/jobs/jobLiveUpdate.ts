'use client';

import { useEffect } from 'react';

export const JOB_LIVE_UPDATE_EVENT = 'amfgi:jobs-changed';

export type JobLiveUpdateDetail = {
  action?: string;
  at?: string;
};

export function notifyJobLiveUpdate(detail?: JobLiveUpdateDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(JOB_LIVE_UPDATE_EVENT, { detail }));
}

export function useJobLiveUpdate(onUpdate: () => void) {
  useEffect(() => {
    const handler = () => onUpdate();
    window.addEventListener(JOB_LIVE_UPDATE_EVENT, handler);
    return () => window.removeEventListener(JOB_LIVE_UPDATE_EVENT, handler);
  }, [onUpdate]);
}
