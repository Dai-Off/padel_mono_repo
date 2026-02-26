import { createContext, useContext, type ReactNode } from 'react';

type SidebarContextValue = { close: () => void };

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ close, children }: { close: () => void; children: ReactNode }) {
  return <SidebarContext.Provider value={{ close }}>{children}</SidebarContext.Provider>;
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
