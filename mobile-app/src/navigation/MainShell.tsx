import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobileSidebar } from '../components/layout/MobileSidebar';
import { SidebarContent } from '../components/layout/SidebarContent';
import { UnlockModalHost } from '../components/profile/UnlockModalHost';
import { UsernameSetupModal } from '../components/profile/UsernameSetupModal';
import { SeasonPassCelebrationHost } from '../components/seasonPass/SeasonPassCelebrationHost';
import { SeasonTransitionModal } from '../components/matchmaking/SeasonTransitionModal';
import { fetchSeasonTransition, type SeasonTransition } from '../api/matchmaking';
import { fetchMyPlayerProfile } from '../api/players';
import { useAuth } from '../contexts/AuthContext';
import { useAppSignals } from '../contexts/AppSignalsContext';
import { useHomeData } from '../contexts/HomeDataContext';
import {
  SidebarProvider,
  useSidebarActions,
  useSidebarState,
} from '../contexts/SidebarContext';
import { MainTabsNavigator } from './MainTabsNavigator';
import { useAppDeepLinks } from './useAppDeepLinks';
import { goToMainTab } from './nav';

const SEASON_TRANSITION_SEEN_KEY = 'season_transition_seen';
/** Dev: poner a `true` para forzar el modal de fin de temporada con datos de prueba. */
const SEASON_TRANSITION_PREVIEW = false;
const SEASON_TRANSITION_PREVIEW_DATA: SeasonTransition = {
  season_id: 'preview',
  previous_liga: 'oro',
  previous_season_name: 'Temporada 1',
  new_liga: 'plata',
  new_season_name: 'Temporada 2',
};

/** Host del drawer: unico consumidor del estado de apertura del sidebar. */
function SidebarHost() {
  const { isOpen } = useSidebarState();
  const { close } = useSidebarActions();
  return (
    <MobileSidebar visible={isOpen} onClose={close}>
      <SidebarContent />
    </MobileSidebar>
  );
}

/** Modal de fin de temporada: una vez al abrir la app, si hay transición sin ver. */
function SeasonTransitionHost() {
  const { session } = useAuth();
  const [seasonTransition, setSeasonTransition] = useState<SeasonTransition | null>(null);

  useEffect(() => {
    if (SEASON_TRANSITION_PREVIEW) {
      setSeasonTransition(SEASON_TRANSITION_PREVIEW_DATA);
      return;
    }
    const token = session?.access_token ?? null;
    if (!token) return;
    let cancelled = false;
    (async () => {
      const tr = await fetchSeasonTransition(token);
      if (cancelled || !tr) return;
      const seen = await AsyncStorage.getItem(SEASON_TRANSITION_SEEN_KEY);
      if (cancelled || seen === tr.season_id) return;
      setSeasonTransition(tr);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleClose = () => {
    setSeasonTransition((current) => {
      if (current && current.season_id !== 'preview') {
        void AsyncStorage.setItem(SEASON_TRANSITION_SEEN_KEY, current.season_id);
      }
      return null;
    });
  };

  return (
    <SeasonTransitionModal
      visible={!!seasonTransition}
      transition={seasonTransition}
      onClose={handleClose}
    />
  );
}

/** Fuerza la eleccion de username en el primer arranque tras registrarse. */
function UsernameSetupHost() {
  const { session } = useAuth();
  const { profileRefreshKey, bumpProfileRefresh } = useAppSignals();
  const { refreshProfile } = useHomeData();
  const [needsUsernameSetup, setNeedsUsernameSetup] = useState(false);
  const [usernameCheckDone, setUsernameCheckDone] = useState(false);

  useEffect(() => {
    if (!session?.access_token) {
      setNeedsUsernameSetup(false);
      setUsernameCheckDone(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const profile = await fetchMyPlayerProfile(session.access_token);
      if (cancelled) return;
      setNeedsUsernameSetup(Boolean(profile && !profile.username?.trim()));
      setUsernameCheckDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, profileRefreshKey]);

  if (!usernameCheckDone) return null;

  return (
    <UsernameSetupModal
      visible={needsUsernameSetup}
      onComplete={() => {
        setNeedsUsernameSetup(false);
        // El hero del perfil lee el username del cache global (HomeData); antes
        // lo recogía el remount de ProfileScreen, que ya no existe.
        void refreshProfile({ force: true });
        bumpProfileRefresh();
      }}
    />
  );
}

function UnlockHost() {
  const { bumpVitrinaScroll } = useAppSignals();
  return (
    <UnlockModalHost
      onGoToVitrina={() => {
        goToMainTab('perfil');
        bumpVitrinaScroll();
      }}
    />
  );
}

/**
 * Pantalla `Main` del stack raiz (sustituye al antiguo MainApp): tabs + menu
 * lateral + hosts globales (modales que flotan sobre cualquier ruta) + deep
 * links con sesion. Sin estado propio: todo vive en contextos, asi que las
 * interacciones no re-renderizan el arbol completo de tabs.
 */
export function MainShell() {
  useAppDeepLinks();

  return (
    <SidebarProvider>
      <View style={styles.container}>
        <View style={styles.mainColumn}>
          <MainTabsNavigator />
        </View>
        <SidebarHost />

        <SeasonTransitionHost />
        <UsernameSetupHost />
        {/* Modal global de desbloqueos: aparece esté donde esté el usuario. */}
        <UnlockHost />
        {/* Cola de celebraciones del pase: misiones completadas "fuera" de la app. */}
        <SeasonPassCelebrationHost />
      </View>
    </SidebarProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  /** Columna explícita del navigator de tabs (evita barra invisible en Android). */
  mainColumn: {
    flex: 1,
    minHeight: 0,
  },
});
