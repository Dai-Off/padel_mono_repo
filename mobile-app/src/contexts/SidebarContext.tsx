import { createContext, useContext, type ReactNode } from 'react';

type SidebarContextValue = {
  close: () => void;
  onNavigateToTusPagos?: () => void;
  onProfilePress?: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  close,
  onNavigateToTusPagos,
  onProfilePress,
  children,
}: {
  close: () => void;
  onNavigateToTusPagos?: () => void;
  onProfilePress?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarContext.Provider value={{ close, onNavigateToTusPagos, onProfilePress }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
