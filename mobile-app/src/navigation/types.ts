import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RecoveryPayload } from '../screens/ResetPasswordScreen';
import type { InfoScreenId } from '../content/infoContent';
import type { EducationalCourse } from '../api/dailyLessons';
import type { PublicCourse } from '../api/schoolCourses';
import type { SearchCourtResult } from '../api/search';
import type { CourtReservation } from '../api/bookings';
import type { PartidoItem } from '../screens/PartidosScreen';
import type { MessagePeerNav } from '../screens/MessagesScreen';
import type { PairInvite } from '../api/matchmaking';

/** Secciones internas de Ajustes (antes un switcher de estado local). */
export type AjustesSectionId = 'seguridad' | 'notificaciones' | 'privacidad' | 'privacy-policy';

export type MainTabsParamList = {
  InicioTab: undefined;
  PartidosTab: undefined;
  PistasTab: undefined;
  TiendaTab: undefined;
  CursosTab: { initialTab?: 'apuntate' | 'cursos' | 'tusclases' } | undefined;
  /** Sin boton en la barra; se llega por deep link de torneo. */
  TorneosTab: { openTournamentId?: string } | undefined;
  /** Sin boton en la barra; se llega por header/sidebar. */
  PerfilTab:
    | { autoOpenOnboarding?: boolean; refreshNonce?: number; vitrinaNonce?: number }
    | undefined;
};

export type TuActividadStackParamList = {
  TuActividadMenu: undefined;
  MisPartidosActividad: undefined;
  MisClasesActividad: undefined;
  MisCompeticionesActividad: undefined;
  MisClubesFavoritosActividad: undefined;
};

/**
 * Rutas del stack raiz. Se declaran todas desde el principio (la migracion
 * las va registrando por fases); los params con objetos (PartidoItem, etc.)
 * son deliberados en v1 — el follow-up es id + refetch.
 */
export type RootStackParamList = {
  // Grupo auth (solo montado sin sesion)
  Login: { initialEmail?: string } | undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { recovery: RecoveryPayload };

  // Grupo app
  Main: NavigatorScreenParams<MainTabsParamList> | undefined;

  // Cluster ajustes / sidebar
  Monedero: undefined;
  Transacciones: undefined;
  PagosPendientes: undefined;
  MovimientosMonedero: undefined;
  Ajustes: undefined;
  AjustesSection: { section: AjustesSectionId };
  Info: { screenId: InfoScreenId };
  ClubReviews: undefined;
  Preferences: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;

  // Cluster comercio / reservas / cursos
  Cart: undefined;
  DailyLesson: undefined;
  EducationalCourseDetail: { course: EducationalCourse };
  PublicCourseDetail: { course: PublicCourse; isReserved: boolean };
  CrearPartido: { organizerId: string | null; matchVisibility: 'public' | 'private' };
  ClubDetail: { court: SearchCourtResult };
  CourtReservationDetail: { reservation: CourtReservation };
  SeasonPass: undefined;

  // Grafo social / partidos
  PartidoDetail: { partido: PartidoItem };
  PublicProfile: { playerId: string; origin?: 'affinity' };
  Messages: undefined;
  DirectMessageThread: { peer: MessagePeerNav };
  Notifications: undefined;
  Community: undefined;

  // Matchmaking / actividad
  CompetitiveLeague:
    | { entryIntent?: 'default' | 'queue' | 'prefs'; partnerInvite?: PairInvite }
    | undefined;
  TuActividad: NavigatorScreenParams<TuActividadStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
