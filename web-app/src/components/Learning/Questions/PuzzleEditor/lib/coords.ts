// Conversión entre coordenadas en metros (modelo) y píxeles (canvas).
// El editor renderiza la pista a un tamaño fijo de viewport y todas las posiciones
// se transforman en runtime. La pista mide 10 m × 20 m.

import { courtConfig } from './courtConfig';

export interface ViewportSize {
  widthPx: number;
  heightPx: number;
}

export interface ScaleInfo {
  pixelsPerMeter: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Calcula el tamaño en píxeles de la pista para que quepa entera en el viewport
 * manteniendo el aspect ratio 1:2 (vertical).
 */
export function computeScale(viewport: ViewportSize): ScaleInfo {
  const { width: surfaceW, height: surfaceH } = courtConfig.surface;
  const aspect = surfaceH / surfaceW; // 2
  const candidateHeight = viewport.widthPx * aspect;
  if (candidateHeight <= viewport.heightPx) {
    return {
      pixelsPerMeter: viewport.widthPx / surfaceW,
      widthPx: viewport.widthPx,
      heightPx: candidateHeight,
    };
  }
  return {
    pixelsPerMeter: viewport.heightPx / surfaceH,
    widthPx: viewport.heightPx / aspect,
    heightPx: viewport.heightPx,
  };
}

export const m2px = (meters: number, scale: ScaleInfo) => meters * scale.pixelsPerMeter;
export const px2m = (pixels: number, scale: ScaleInfo) => pixels / scale.pixelsPerMeter;

/** Snap a una grid de N metros (default 0.25 m). */
export function snap(meters: number, gridSize = 0.25): number {
  return Math.round(meters / gridSize) * gridSize;
}

/** Restringe una coordenada al interior de la pista. */
export function clampX(x: number): number {
  return Math.max(0, Math.min(courtConfig.surface.width, x));
}
export function clampY(y: number): number {
  return Math.max(0, Math.min(courtConfig.surface.height, y));
}
