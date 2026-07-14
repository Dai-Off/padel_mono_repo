/**
 * Puente TEMPORAL de la migracion a React Navigation: permite a las rutas ya
 * migradas disparar estado que todavia vive en MainApp (nonces, tab activo).
 * Mismo patron registro/consumo que tenia overlayBackRef. Se elimina en la
 * ultima fase, cuando MainApp desaparezca.
 */
export type MainAppActions = {
  /** Tras guardar el perfil: remonta ProfileScreen y refresca listas de partidos. */
  profileSaved: () => void;
};

let registered: MainAppActions | null = null;

export function registerMainAppActions(actions: MainAppActions | null) {
  registered = actions;
}

export const mainAppActions: MainAppActions = {
  profileSaved: () => registered?.profileSaved(),
};
