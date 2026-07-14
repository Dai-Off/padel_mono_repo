import { useCallback, useEffect } from 'react';
import { StackActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PartidoDetailScreen } from '../../screens/PartidoDetailScreen';
import { PublicProfileScreen } from '../../screens/PublicProfileScreen';
import { MessagesScreen } from '../../screens/MessagesScreen';
import { DirectMessageThreadScreen } from '../../screens/DirectMessageThreadScreen';
import { NotificationsScreen } from '../../screens/NotificationsScreen';
import { CommunityScreen } from '../../screens/CommunityScreen';
import { ClubDetailScreen } from '../../screens/ClubDetailScreen';
import { markAffinityModalPendingReopen } from '../../screens/HomeScreen';
import { fetchMatchById } from '../../api/matches';
import { mapMatchToPartido } from '../../api/mapMatchToPartido';
import { useAuth } from '../../contexts/AuthContext';
import { useHomeData } from '../../contexts/HomeDataContext';
import { mainAppActions } from '../mainAppActions';
import { navigationRef } from '../navigationRef';
import { RouteShell } from '../RouteShell';
import type { RootStackParamList } from '../types';

/** Carga un partido por id y abre su detalle (antes openMatchById en MainApp). */
function useOpenMatchById() {
  const { session } = useAuth();
  const { profile } = useHomeData();
  return useCallback(
    async (matchId: string) => {
      const m = await fetchMatchById(matchId, session?.access_token ?? null);
      if (!m) return;
      const item = mapMatchToPartido(m, { viewerPlayerId: profile?.id ?? null });
      if (item && navigationRef.isReady()) {
        navigationRef.dispatch(StackActions.push('PartidoDetail', { partido: item }));
      }
    },
    [session?.access_token, profile?.id],
  );
}

export function PartidoDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PartidoDetail'>) {
  const { refreshMatches } = useHomeData();

  // Al salir por cualquier via (boton, back hardware, swipe iOS, popTo):
  // refresca "mis partidos" como hacia el onBack original.
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      void refreshMatches({ scope: 'mine' });
    });
  }, [navigation, refreshMatches]);

  return (
    <RouteShell>
      <PartidoDetailScreen
        partido={route.params.partido}
        onMatchDataChanged={() => mainAppActions.matchDataChanged()}
        onBack={() => navigation.goBack()}
        onGoHome={() => {
          navigation.popTo('Main');
          mainAppActions.goHome();
        }}
        onOpenPublicProfile={(pid) => navigation.push('PublicProfile', { playerId: pid })}
        onOpenProfileForOnboarding={() => {
          navigation.popTo('Main');
          mainAppActions.openOnboardingFromSection('partido-detail');
        }}
      />
    </RouteShell>
  );
}

export function PublicProfileRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PublicProfile'>) {
  const { playerId, origin } = route.params;
  const openMatchById = useOpenMatchById();

  // Perfil abierto desde el modal de IA Afinidad: HomeScreen ya marco el
  // pending reopen al abrirlo; al salir (por cualquier via) se dispara la
  // senal para que el modal se reabra en Inicio.
  useEffect(() => {
    if (origin !== 'affinity') return;
    return navigation.addListener('beforeRemove', () => {
      markAffinityModalPendingReopen();
      mainAppActions.affinityProfileClosed();
    });
  }, [navigation, origin]);

  return (
    <RouteShell>
      <PublicProfileScreen
        playerId={playerId}
        onBack={() => navigation.goBack()}
        onChatPress={(chatPid, name) => {
          // El chat se abre encima del perfil; al volver se regresa a el.
          navigation.push('DirectMessageThread', {
            peer: { id: chatPid, displayName: name, avatarUrl: null },
          });
        }}
        onOpenMatch={(matchId) => {
          void openMatchById(matchId);
        }}
        // replace: hoy abrir otro jugador sustituye el perfil actual (el back
        // no vuelve al perfil anterior).
        onOpenPlayer={(pid) => navigation.replace('PublicProfile', { playerId: pid })}
      />
    </RouteShell>
  );
}

export function MessagesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Messages'>) {
  return (
    <RouteShell backgroundColor="#0A0A0A">
      <MessagesScreen
        onBack={() => navigation.goBack()}
        onSelectPeer={(peer) => navigation.push('DirectMessageThread', { peer })}
      />
    </RouteShell>
  );
}

export function DirectMessageThreadRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'DirectMessageThread'>) {
  return (
    <RouteShell backgroundColor="#0A0A0A">
      <DirectMessageThreadScreen
        peer={route.params.peer}
        onBack={() => navigation.goBack()}
      />
    </RouteShell>
  );
}

export function NotificationsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Notifications'>) {
  return (
    <RouteShell>
      <NotificationsScreen
        onBack={() => navigation.goBack()}
        onOpenMatch={(invite) => {
          navigation.goBack();
          mainAppActions.openMatchFromInvite(invite);
        }}
      />
    </RouteShell>
  );
}

export function CommunityRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Community'>) {
  const { profile } = useHomeData();
  return (
    <RouteShell>
      <CommunityScreen
        onBack={() => navigation.goBack()}
        // replace: hoy Mensajes sustituye a Comunidad (su back no vuelve aqui).
        onMessagesPress={() => navigation.replace('Messages')}
        onOpenPlayer={(pid) => navigation.push('PublicProfile', { playerId: pid })}
        myPlayerId={profile?.id}
        onNavigateToTab={(tab) => {
          navigation.popTo('Main');
          mainAppActions.goToTab(tab);
        }}
      />
    </RouteShell>
  );
}

export function ClubDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ClubDetail'>) {
  return (
    <RouteShell>
      <ClubDetailScreen
        court={route.params.court}
        onClose={() => navigation.goBack()}
        onPartidoPress={(p) => navigation.push('PartidoDetail', { partido: p })}
      />
    </RouteShell>
  );
}
