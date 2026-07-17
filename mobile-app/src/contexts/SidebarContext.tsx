import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { InfoScreenId } from '../content/infoContent';
import { dispatchWhenReady, goToMainTab } from '../navigation/nav';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Acciones del menu lateral. Contexto separado del estado de apertura para
 * que abrir/cerrar el drawer NO re-renderice a las pantallas que solo
 * necesitan el toggle (Home, Perfil): las acciones son estables.
 */
type SidebarActionsValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  onNavigateToMonedero: () => void;
  onNavigateToTuActividad: () => void;
  onNavigateToAjustes: () => void;
  onNavigateToClubReviews: () => void;
  onNavigateToInfo: (screenId: InfoScreenId) => void;
  onProfilePress: () => void;
};

const SidebarStateContext = createContext<{ isOpen: boolean } | null>(null);
const SidebarActionsContext = createContext<SidebarActionsValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = useMemo<SidebarActionsValue>(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      onNavigateToMonedero: () =>
        dispatchWhenReady(() => navigationRef.navigate('Monedero')),
      onNavigateToTuActividad: () =>
        dispatchWhenReady(() => navigationRef.navigate('TuActividad')),
      onNavigateToAjustes: () =>
        dispatchWhenReady(() => navigationRef.navigate('Ajustes')),
      onNavigateToClubReviews: () =>
        dispatchWhenReady(() => navigationRef.navigate('ClubReviews')),
      onNavigateToInfo: (screenId) =>
        dispatchWhenReady(() => navigationRef.navigate('Info', { screenId })),
      onProfilePress: () => goToMainTab('perfil'),
    }),
    [],
  );

  const state = useMemo(() => ({ isOpen }), [isOpen]);

  return (
    <SidebarStateContext.Provider value={state}>
      <SidebarActionsContext.Provider value={actions}>
        {children}
      </SidebarActionsContext.Provider>
    </SidebarStateContext.Provider>
  );
}

/** Estado de apertura: solo lo consume el host del drawer. */
export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    throw new Error('useSidebarState must be used within SidebarProvider');
  }
  return ctx;
}

/** Acciones estables (abrir/cerrar + destinos del menu). */
export function useSidebarActions(): SidebarActionsValue {
  const ctx = useContext(SidebarActionsContext);
  if (!ctx) {
    throw new Error('useSidebarActions must be used within SidebarProvider');
  }
  return ctx;
}

/** Compat con SidebarContent (misma API de acciones que el contexto antiguo). */
export function useSidebarContext() {
  return useContext(SidebarActionsContext);
}
