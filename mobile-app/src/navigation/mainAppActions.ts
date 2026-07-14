/**
 * Puente TEMPORAL de la migracion a React Navigation: permite a las rutas ya
 * migradas disparar estado que todavia vive en MainApp (nonces, tab activo).
 * Mismo patron registro/consumo que tenia overlayBackRef. Se elimina en la
 * ultima fase, cuando MainApp desaparezca.
 */

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
  /** Abre el cuestionario de nivelacion en el perfil, recordando el origen. */
  openOnboardingFromSection: (returnTo: PostOnboardingReturn) => void;
  /** Cambia al tab de perfil (sin onboarding automatico). */
  goToProfileTab: () => void;
};

let registered: MainAppActions | null = null;

export function registerMainAppActions(actions: MainAppActions | null) {
  registered = actions;
}

export const mainAppActions: MainAppActions = {
  profileSaved: () => registered?.profileSaved(),
  bumpPartidosRefresh: () => registered?.bumpPartidosRefresh(),
  bumpStreakRefresh: () => registered?.bumpStreakRefresh(),
  openOnboardingFromSection: (returnTo) => registered?.openOnboardingFromSection(returnTo),
  goToProfileTab: () => registered?.goToProfileTab(),
};
