import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompetitiveLeagueScreen } from '../../screens/CompetitiveLeagueScreen';
import { useMatchmaking } from '../../contexts/MatchmakingContext';
import { RouteShell } from '../RouteShell';
import { ScreenFadeIn } from '../../components/ui/ScreenFadeIn';
import type { RootStackParamList } from '../types';

export function CompetitiveLeagueRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CompetitiveLeague'>) {
  const {
    bannerState,
    setBannerState,
    queueElapsedSec,
    setQueueElapsedSec,
    queueStartedAtMs,
    setQueueStartedAtMs,
  } = useMatchmaking();

  return (
    <RouteShell>
      <ScreenFadeIn>
        <CompetitiveLeagueScreen
          onBack={() => navigation.goBack()}
          entryIntent={route.params?.entryIntent ?? 'default'}
          queueElapsedSec={queueElapsedSec}
          setQueueElapsedSec={setQueueElapsedSec}
          queueStartedAtMs={queueStartedAtMs}
          setQueueStartedAtMs={setQueueStartedAtMs}
          matchmakingBannerState={bannerState}
          onMatchmakingBannerStateChange={setBannerState}
          pendingPartnerInvite={route.params?.partnerInvite ?? null}
          onPartnerApplied={() => navigation.setParams({ partnerInvite: undefined })}
          // replace: hoy la liga se cierra al abrir el partido (su back no
          // vuelve a la liga).
          onPartidoPress={(p) => navigation.replace('PartidoDetail', { partido: p })}
          onOpenPlayer={(pid) => navigation.push('PublicProfile', { playerId: pid })}
        />
      </ScreenFadeIn>
    </RouteShell>
  );
}
