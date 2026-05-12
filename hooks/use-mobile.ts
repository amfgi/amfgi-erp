'use client';

import * as React from 'react';

/** Matches app shell breakpoints (`lg:`) — treat viewports below `lg` as mobile drawer territory. */
const LG = 1024;

export function useIsMobile() {
  const [mobile, setMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width:${LG - 1}px)`);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return mobile === true;
}
