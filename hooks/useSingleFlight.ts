'use client';

import { useCallback, useRef, useState } from 'react';

function waitForPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

/** Runs one async or sync action at a time. A second click is ignored until the first finishes. */
export function useSingleFlight() {
  const lockRef = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async (task: () => Promise<unknown> | unknown) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setPending(true);
    await waitForPaint();
    try {
      await task();
    } finally {
      lockRef.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
