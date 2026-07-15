import { useCallback } from 'react';
import { Alert } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { fetchMatchById } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import type { ReceivedMatchInvite } from '../api/matchInvites';
import { reloadMatchPartido } from '../lib/reloadMatchPartido';
import { isPlayerInPartido } from '../lib/partidoPlayerUtils';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import { useTranslation } from '../i18n';
import { navigationRef } from './navigationRef';

/** Carga un partido por id y abre su detalle (grafico de evolucion, etc.). */
export function useOpenMatchById() {
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

/** Carga el partido de una invitacion recibida y abre su detalle. */
export function useOpenMatchFromInvite() {
  const { session } = useAuth();
  const { profile, upsertMisPartido } = useHomeData();
  const { t } = useTranslation();
  return useCallback(
    async (invite: ReceivedMatchInvite) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      const viewerId = profile?.id ?? null;
      const loaded = await reloadMatchPartido(invite.match_id, accessToken, {
        viewerPlayerId: viewerId,
      });
      if (loaded) {
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
}
