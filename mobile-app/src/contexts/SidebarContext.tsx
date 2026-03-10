import { createContext, useContext, type ReactNode } from 'react';

type SidebarContextValue = {
  close: () => void;
  onNavigateToTusPagos?: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  close,
  onNavigateToTusPagos,
  children,
}: {
  close: () => void;
  onNavigateToTusPagos?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarContext.Provider value={{ close, onNavigateToTusPagos }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
