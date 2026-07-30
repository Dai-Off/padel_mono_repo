import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackActions } from '@react-navigation/native';
import { acceptTournamentInvite } from '../api/tournamentInvites';
import { acceptMatchInviteByToken } from '../api/matchInvites';
import { parseTournamentInviteUrl } from '../lib/parseTournamentInviteUrl';
import { parseMatchDeepLink, type ParsedMatchDeepLink } from '../lib/parseMatchDeepLink';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { isPlayerInPartido } from '../lib/partidoPlayerUtils';
import { useAuth } from '../contexts/AuthContext';
import { useMyProfile } from '../queries/profile';
import { useMisPartidosActions } from '../queries/matches';
import { useAppSignals } from '../contexts/AppSignalsContext';
import { useTranslation } from '../i18n';
import { navigationRef } from './navigationRef';
import { goToMainTab } from './nav';

const PENDING_TOURNAMENT_INVITE_KEY = 'pending_tournament_invite';
const PENDING_MATCH_DEEPLINK_KEY = 'pending_match_deeplink';

/**
 * Deep links con sesion (antes en MainApp): consume las invitaciones que el
 * flujo de auth dejo en AsyncStorage y escucha los links en caliente.
 * Aceptar la invitacion es un side effect de API, por eso no encaja en la
 * config `linking` de React Navigation y se gestiona a mano.
 */
export function useAppDeepLinks() {
  const { session } = useAuth();
  const profile = useMyProfile().data ?? null;
  const { upsertMisPartido } = useMisPartidosActions();
  const { setPendingTournamentId } = useAppSignals();
  const { t } = useTranslation();

  const processTournamentInvite = useCallback(
    async (inviteToken: string, tournamentId: string) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      const result = await acceptTournamentInvite(accessToken, inviteToken, tournamentId);
      if (result.ok) {
        Alert.alert(t('alerts.tournamentInvite.accepted'), t('alerts.tournamentInvite.acceptedBody'));
        setPendingTournamentId(tournamentId);
        goToMainTab('torneos');
      } else {
        Alert.alert(t('alerts.tournamentInvite.title'), result.error);
      }
    },
    [session?.access_token, setPendingTournamentId, t],
  );

  const processMatchDeepLink = useCallback(
    async (link: ParsedMatchDeepLink) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;

      if (link.kind === 'invite') {
        const result = await acceptMatchInviteByToken(link.token, accessToken);
        if (result.ok) {
          if (!result.already_accepted) {
            Alert.alert(t('alerts.matchInvite.accepted'), t('alerts.matchInvite.acceptedBody'));
          }
        } else {
          Alert.alert(t('alerts.matchInvite.title'), result.error);
        }
      }

      const viewerId = profile?.id ?? null;
      const loaded = await reloadMatchPartido(link.matchId, accessToken, {
        viewerPlayerId: viewerId,
      });
      if (loaded) {
        goToMainTab('partidos');
        if (navigationRef.isReady()) {
          navigationRef.dispatch(StackActions.push('PartidoDetail', { partido: loaded }));
        }
        if (viewerId && isPlayerInPartido(loaded, viewerId)) {
          upsertMisPartido(loaded);
        }
      } else {
        Alert.alert(t('alerts.error.title'), t('partidos.matchInviteOpenFail'));
      }
    },
    [session?.access_token, profile?.id, upsertMisPartido, t],
  );

  const consumeInviteUrl = useCallback(
    async (url: string | null) => {
      if (!url) return;
      const matchParsed = parseMatchDeepLink(url);
      if (matchParsed) {
        await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
        await processMatchDeepLink(matchParsed);
        return;
      }
      const tournamentParsed = parseTournamentInviteUrl(url);
      if (tournamentParsed) {
        await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        await processTournamentInvite(tournamentParsed.token, tournamentParsed.tournamentId);
      }
    },
    [processMatchDeepLink, processTournamentInvite],
  );

  useEffect(() => {
    if (!session?.access_token) return;
    void (async () => {
      const rawTournament = await AsyncStorage.getItem(PENDING_TOURNAMENT_INVITE_KEY);
      if (rawTournament) {
        try {
          const parsed = JSON.parse(rawTournament) as { token: string; tournamentId: string };
          if (parsed.token && parsed.tournamentId) {
            await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
            await processTournamentInvite(parsed.token, parsed.tournamentId);
            return;
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_TOURNAMENT_INVITE_KEY);
        }
      }
      const rawMatch = await AsyncStorage.getItem(PENDING_MATCH_DEEPLINK_KEY);
      if (rawMatch) {
        try {
          const parsed = JSON.parse(rawMatch) as ParsedMatchDeepLink;
          if (parsed.matchId) {
            await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
            await processMatchDeepLink(parsed);
            return;
          }
        } catch {
          await AsyncStorage.removeItem(PENDING_MATCH_DEEPLINK_KEY);
        }
      }
      const initial = await Linking.getInitialURL();
      if (initial) await consumeInviteUrl(initial);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      void consumeInviteUrl(url);
    });
    return () => sub.remove();
  }, [session?.access_token, consumeInviteUrl, processTournamentInvite, processMatchDeepLink]);
}
