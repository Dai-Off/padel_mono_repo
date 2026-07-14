/**
 * Puente TEMPORAL de la migracion a React Navigation: permite a las rutas ya
 * migradas disparar estado que todavia vive en MainApp (nonces, tab activo).
 * Mismo patron registro/consumo que tenia overlayBackRef. Se elimina en la
 * ultima fase, cuando MainApp desaparezca.
 */
import type { MainTabId } from '../components/layout/BottomNavbar';
import type { ReceivedMatchInvite } from '../api/matchInvites';

/** Secciones de origen del cuestionario de nivelacion (retorno post-onboarding). */
export type PostOnboardingReturn =
  | 'home'
  | 'daily-lesson'
  | 'ia-afinidad'
  | 'matchmaking'
  | 'partido-detail'
  | 'torneos'
  | 'cursos';

export type MainAppActions = {
  /** Tras guardar el perfil: remonta ProfileScreen y refresca listas de partidos. */
  profileSaved: () => void;
  /** Fuerza el refresco de las listas de partidos (partidosRefreshNonce). */
  bumpPartidosRefresh: () => void;
  /** Fuerza otro fetch de racha en Inicio (streakRefreshKey). */
  bumpStreakRefresh: () => void;
  /** Tras cambios en un partido: refresca invitaciones y listas. */
  matchDataChanged: () => void;
  /** Abre el cuestionario de nivelacion en el perfil, recordando el origen. */
  openOnboardingFromSection: (returnTo: PostOnboardingReturn) => void;
  /** Cambia al tab de perfil (sin onboarding automatico). */
  goToProfileTab: () => void;
  /** Cambia de tab cerrando los overlays que siguen siendo flags. */
  goToTab: (tab: MainTabId) => void;
  /** "Ir a inicio" desde el detalle de partido: tab inicio + cierra flags. */
  goHome: () => void;
  /** Al cerrarse el perfil abierto desde IA Afinidad: reabre el modal en Home. */
  affinityProfileClosed: () => void;
  /** Acepta/carga la invitacion a partido y abre su detalle (logica en MainApp). */
  openMatchFromInvite: (invite: ReceivedMatchInvite) => void;
};

let registered: MainAppActions | null = null;

export function registerMainAppActions(actions: MainAppActions | null) {
  registered = actions;
}

export const mainAppActions: MainAppActions = {
  profileSaved: () => registered?.profileSaved(),
  bumpPartidosRefresh: () => registered?.bumpPartidosRefresh(),
  bumpStreakRefresh: () => registered?.bumpStreakRefresh(),
  matchDataChanged: () => registered?.matchDataChanged(),
  openOnboardingFromSection: (returnTo) => registered?.openOnboardingFromSection(returnTo),
  goToProfileTab: () => registered?.goToProfileTab(),
  goToTab: (tab) => registered?.goToTab(tab),
  goHome: () => registered?.goHome(),
  affinityProfileClosed: () => registered?.affinityProfileClosed(),
  openMatchFromInvite: (invite) => registered?.openMatchFromInvite(invite),
};
