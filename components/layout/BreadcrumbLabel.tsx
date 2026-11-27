'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type BreadcrumbLabelContextValue = {
  label: string | null;
  claim: (label: string) => number;
  release: (token: number) => void;
};

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue>({
  label: null,
  claim: () => 0,
  release: () => {},
});

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const claims = useRef(new Map<number, string>());
  const nextToken = useRef(1);

  const claim = useCallback((next: string) => {
    const token = nextToken.current++;
    claims.current.set(token, next);
    setLabel(next);
    return token;
  }, []);

  const release = useCallback((token: number) => {
    claims.current.delete(token);
    const remaining = [...claims.current.values()];
    setLabel(remaining.length > 0 ? remaining[remaining.length - 1] : null);
  }, []);

  const value = useMemo(() => ({ label, claim, release }), [claim, label, release]);
  return <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>;
}

export function useBreadcrumbOverride() {
  return useContext(BreadcrumbLabelContext).label;
}

export function useBreadcrumbLabel(label: string | null | undefined) {
  const { claim, release } = useContext(BreadcrumbLabelContext);
  useEffect(() => {
    const next = label?.trim() ? label.trim() : null;
    if (!next) return;
    const token = claim(next);
    return () => release(token);
  }, [claim, label, release]);
}

export function BreadcrumbLabel({ label }: { label?: string | null }) {
  useBreadcrumbLabel(label);
  return null;
}
