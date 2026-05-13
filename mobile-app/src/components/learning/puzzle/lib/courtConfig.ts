// Configuración visual de la pista para mobile.
// Igual que en el editor web (web-app/.../PuzzleEditor/lib/courtConfig.ts).
// Pista 10 m × 20 m con margen exterior 0.4 m (paredes/postes incluidos en court.svg).

export const courtConfig = {
  surface: { width: 10, height: 20 },
  outerMargin: 0.4,
  player: { radius: 0.6 },           // tamaño visual = 3.5 × radius
  ball:   { radius: 0.4 },
};

// Dimensiones totales del Stage en metros (pista + margen).
export const OUTER_W = courtConfig.surface.width + 2 * courtConfig.outerMargin;
export const OUTER_H = courtConfig.surface.height + 2 * courtConfig.outerMargin;
// Aspect ratio del Stage (ancho/alto) = 10.8 / 20.8 ≈ 0.519
export const STAGE_ASPECT = OUTER_W / OUTER_H;

/** Mete una coordenada en metros del modelo (0..10/20) en porcentaje del Stage exterior. */
export const m2pctX = (m: number) => ((m + courtConfig.outerMargin) / OUTER_W) * 100;
export const m2pctY = (m: number) => ((m + courtConfig.outerMargin) / OUTER_H) * 100;
