import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PartidoDetailScreen } from '../../screens/PartidoDetailScreen';
import { PublicProfileScreen } from '../../screens/PublicProfileScreen';
import { MessagesScreen } from '../../screens/MessagesScreen';
import { DirectMessageThreadScreen } from '../../screens/DirectMessageThreadScreen';
import { NotificationsScreen } from '../../screens/NotificationsScreen';
import { CommunityScreen } from '../../screens/CommunityScreen';
import { ClubDetailScreen } from '../../screens/ClubDetailScreen';
import { markAffinityModalPendingReopen } from '../../screens/HomeScreen';
import { useHomeData } from '../../contexts/HomeDataContext';
import { useMatchmaking } from '../../contexts/MatchmakingContext';
import { useAppSignals } from '../../contexts/AppSignalsContext';
import { useOpenMatchById, useOpenMatchFromInvite } from '../matchActions';
import { goToMainTab } from '../nav';
import { RouteShell } from '../RouteShell';
import type { RootStackParamList } from '../types';

export function PartidoDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PartidoDetail'>) {
  const { refreshMatches } = useHomeData();
  const { bumpMatchInvites } = useMatchmaking();
  const { bumpPartidosRefresh, openOnboardingFromSection } = useAppSignals();

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
        onMatchDataChanged={() => {
          bumpMatchInvites();
          bumpPartidosRefresh();
        }}
        onBack={() => navigation.goBack()}
        onGoHome={() => {
          navigation.popTo('Main');
          goToMainTab('inicio');
        }}
        onOpenPublicProfile={(pid) => navigation.push('PublicProfile', { playerId: pid })}
        onOpenProfileForOnboarding={() => {
          navigation.popTo('Main');
          openOnboardingFromSection('partido-detail');
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
  const { bumpAffinityReopen } = useAppSignals();

  // Perfil abierto desde el modal de IA Afinidad: HomeScreen ya marco el
  // pending reopen al abrirlo; al salir (por cualquier via) se dispara la
  // senal para que el modal se reabra en Inicio.
  useEffect(() => {
    if (origin !== 'affinity') return;
    return navigation.addListener('beforeRemove', () => {
      markAffinityModalPendingReopen();
      bumpAffinityReopen();
    });
  }, [navigation, origin, bumpAffinityReopen]);

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
  const openMatchFromInvite = useOpenMatchFromInvite();
  return (
    <RouteShell>
      <NotificationsScreen
        onBack={() => navigation.goBack()}
        onOpenMatch={(invite) => {
          navigation.goBack();
          void openMatchFromInvite(invite);
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
          goToMainTab(tab);
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
