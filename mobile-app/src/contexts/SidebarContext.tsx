import { createContext, useContext, type ReactNode } from 'react';
import type { InfoScreenId } from '../content/infoContent';

type SidebarContextValue = {
  close: () => void;
  onNavigateToTusPagos?: () => void;
  onNavigateToMonedero?: () => void;
  onNavigateToTuActividad?: () => void;
  onNavigateToAjustes?: () => void;
  onNavigateToEditProfile?: () => void;
  onNavigateToInfo?: (screenId: InfoScreenId) => void;
  onProfilePress?: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  close,
  onNavigateToTusPagos,
  onNavigateToMonedero,
  onNavigateToTuActividad,
  onNavigateToAjustes,
  onNavigateToEditProfile,
  onNavigateToInfo,
  onProfilePress,
  children,
}: {
  close: () => void;
  onNavigateToTusPagos?: () => void;
  onNavigateToMonedero?: () => void;
  onNavigateToTuActividad?: () => void;
  onNavigateToAjustes?: () => void;
  onNavigateToEditProfile?: () => void;
  onNavigateToInfo?: (screenId: InfoScreenId) => void;
  onProfilePress?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarContext.Provider
      value={{
        close,
        onNavigateToTusPagos,
        onNavigateToMonedero,
        onNavigateToTuActividad,
        onNavigateToAjustes,
        onNavigateToEditProfile,
        onNavigateToInfo,
        onProfilePress,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarContext() {
  return useContext(SidebarContext);
}
