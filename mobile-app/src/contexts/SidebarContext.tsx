import { createContext, useContext, type ReactNode } from 'react';
import type { InfoScreenId } from '../content/infoContent';

type SidebarContextValue = {
  close: () => void;
  onNavigateToMonedero?: () => void;
  onNavigateToTuActividad?: () => void;
  onNavigateToAjustes?: () => void;
  onNavigateToClubReviews?: () => void;
  onNavigateToInfo?: (screenId: InfoScreenId) => void;
  onProfilePress?: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  close,
  onNavigateToMonedero,
  onNavigateToTuActividad,
  onNavigateToAjustes,
  onNavigateToClubReviews,
  onNavigateToInfo,
  onProfilePress,
  children,
}: {
  close: () => void;
  onNavigateToMonedero?: () => void;
  onNavigateToTuActividad?: () => void;
  onNavigateToAjustes?: () => void;
  onNavigateToClubReviews?: () => void;
  onNavigateToInfo?: (screenId: InfoScreenId) => void;
  onProfilePress?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarContext.Provider
      value={{
        close,
        onNavigateToMonedero,
        onNavigateToTuActividad,
        onNavigateToAjustes,
        onNavigateToClubReviews,
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
