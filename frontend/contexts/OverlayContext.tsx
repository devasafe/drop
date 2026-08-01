import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type OverlayId = 'account' | 'panelSidebar' | 'panelDrawer' | 'chat';

interface OverlayContextType {
  active: OverlayId | null;
  open: (id: OverlayId) => void;
  close: (id?: OverlayId) => void;
  toggle: (id: OverlayId) => void;
  isOpen: (id: OverlayId) => boolean;
}

const OverlayContext = createContext<OverlayContextType | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<OverlayId | null>(null);

  const open = useCallback((id: OverlayId) => setActive(id), []);
  const close = useCallback(
    (id?: OverlayId) => setActive((cur) => (id == null || cur === id ? null : cur)),
    [],
  );
  const toggle = useCallback((id: OverlayId) => setActive((cur) => (cur === id ? null : id)), []);
  const isOpen = useCallback((id: OverlayId) => active === id, [active]);

  const value = useMemo(
    () => ({ active, open, close, toggle, isOpen }),
    [active, open, close, toggle, isOpen],
  );
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextType {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider');
  return ctx;
}

export default OverlayContext;
