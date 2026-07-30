import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CartScreen } from '../../screens/CartScreen';
import { DailyLessonScreen } from '../../screens/DailyLessonScreen';
import { EducationalCourseDetailScreen } from '../../screens/EducationalCourseDetailScreen';
import { PublicCourseDetailScreen } from '../../screens/PublicCourseDetailScreen';
import { CourtReservationDetailScreen } from '../../screens/CourtReservationDetailScreen';
import { SeasonPassScreen } from '../../screens/SeasonPassScreen';
import { CrearPartidoLocationSheet } from '../../components/partido/CrearPartidoLocationSheet';
import { useMyProfile } from '../../queries/profile';
import { useHomeActions } from '../../queries/home';
import {
  useMisPartidosActions,
  useRefreshMatches,
  useSyncMisPartidoFromMatchId,
} from '../../queries/matches';
import { useBookingSuccess } from '../../contexts/BookingSuccessContext';
import { useAppSignals } from '../../contexts/AppSignalsContext';
import { goToMainTab } from '../nav';
import { RouteShell } from '../RouteShell';
import type { RootStackParamList } from '../types';

export function CartRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Cart'>) {
  return (
    <RouteShell>
      <CartScreen
        onBack={() => navigation.goBack()}
        onContinueShopping={() => navigation.goBack()}
      />
    </RouteShell>
  );
}

export function DailyLessonRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'DailyLesson'>) {
  const { bumpStreakRefresh, openOnboardingFromSection } = useAppSignals();
  return (
    <RouteShell>
      <DailyLessonScreen
        onBack={() => navigation.goBack()}
        onComplete={() => {
          bumpStreakRefresh();
          navigation.goBack();
        }}
        onOpenOnboarding={() => {
          navigation.popTo('Main');
          openOnboardingFromSection('daily-lesson');
        }}
        onOpenSeasonPass={() => {
          bumpStreakRefresh();
          // replace: hoy la leccion se cierra al abrir el pase (el back del
          // pase no vuelve a la leccion).
          navigation.replace('SeasonPass');
        }}
      />
    </RouteShell>
  );
}

export function EducationalCourseDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'EducationalCourseDetail'>) {
  const { openOnboardingFromSection } = useAppSignals();
  return (
    <RouteShell>
      <EducationalCourseDetailScreen
        course={route.params.course}
        onBack={() => navigation.goBack()}
        onOpenProfileForOnboarding={() => {
          navigation.popTo('Main');
          openOnboardingFromSection('cursos');
        }}
      />
    </RouteShell>
  );
}

export function PublicCourseDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PublicCourseDetail'>) {
  return (
    <RouteShell>
      <PublicCourseDetailScreen
        course={route.params.course}
        onBack={() => navigation.goBack()}
      />
    </RouteShell>
  );
}

export function CourtReservationDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CourtReservationDetail'>) {
  const { refreshCourtReservations } = useHomeActions();
  return (
    <RouteShell>
      <CourtReservationDetailScreen
        reservation={route.params.reservation}
        onBack={() => navigation.goBack()}
        onCancelled={() => {
          void refreshCourtReservations({ force: true });
          navigation.goBack();
        }}
      />
    </RouteShell>
  );
}

export function SeasonPassRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'SeasonPass'>) {
  return (
    <RouteShell>
      <SeasonPassScreen
        onBack={() => navigation.goBack()}
        onGoToProfile={() => {
          navigation.goBack();
          goToMainTab('perfil');
        }}
      />
    </RouteShell>
  );
}

export function CrearPartidoRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'CrearPartido'>) {
  const { organizerId, matchVisibility } = route.params;
  const profile = useMyProfile().data ?? null;
  const refreshMatches = useRefreshMatches();
  const { upsertMisPartido } = useMisPartidosActions();
  const syncMisPartidoFromMatchId = useSyncMisPartidoFromMatchId();
  const { show: showBookingSuccess } = useBookingSuccess();
  const { bumpPartidosRefresh } = useAppSignals();

  const closeFlow = () => {
    bumpPartidosRefresh();
    navigation.goBack();
  };

  return (
    <RouteShell>
      <CrearPartidoLocationSheet
        presentation="fullscreen"
        initialStep="clubs"
        initialMatchVisibility={matchVisibility}
        organizerPlayerId={organizerId}
        onClose={closeFlow}
        onSiguiente={closeFlow}
        onNavigateToCompleteOnboarding={() => {
          bumpPartidosRefresh();
          navigation.popTo('Main');
          goToMainTab('perfil');
        }}
        onPartidoCreado={(data) => {
          const resolvedOrganizerId = organizerId ?? profile?.id ?? null;
          bumpPartidosRefresh();
          // La confirmacion vive por encima del navigator: se muestra antes
          // del pop para cubrir la transicion de vuelta.
          showBookingSuccess(data);
          navigation.goBack();
          if (data.matchId) {
            upsertMisPartido({
              id: data.matchId,
              dateTime: data.dateTimeFormatted,
              visibility: data.matchVisibility,
              organizerPlayerId: resolvedOrganizerId,
              matchPhase: 'upcoming',
              mode: 'amistoso',
              typeLabel: 'Todos los jugadores',
              levelRange: 'Libre',
              players: [
                {
                  name: profile?.firstName ?? 'Tú',
                  level: '—',
                  isFree: false,
                  initial: profile?.firstName?.[0]?.toUpperCase() ?? 'T',
                  avatar: profile?.avatarUrl ?? undefined,
                },
                { name: '', level: '', isFree: true },
                { name: '', level: '', isFree: true },
                { name: '', level: '', isFree: true },
              ],
              playerIds: resolvedOrganizerId ? [resolvedOrganizerId] : [],
              playerIdsBySlot: [resolvedOrganizerId ?? null, null, null, null],
              venue: data.clubName,
              location: '—',
              price: data.courtPriceFormatted ?? data.priceFormatted,
              pricePerPlayer: data.priceFormatted,
              duration: data.duration,
              courtName: data.courtName,
              clubId: data.clubId,
              startAt: data.date,
            });
            void syncMisPartidoFromMatchId(data.matchId, {
              organizerPlayerId: resolvedOrganizerId,
              matchVisibility: data.matchVisibility,
            });
          } else {
            void refreshMatches({ force: true, scope: 'mine' });
          }
        }}
      />
    </RouteShell>
  );
}
