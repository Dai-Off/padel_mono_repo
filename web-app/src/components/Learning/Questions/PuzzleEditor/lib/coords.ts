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
 * Calcula el tamaño en píxeles del Stage (incluye margen exterior con paredes).
 * El court.svg ocupa todo el Stage; los actores se desplazan por outerMargin
 * para que sus coordenadas en metros sigan siendo desde 0 (esquina interior).
 */
export function computeScale(viewport: ViewportSize): ScaleInfo {
  const outer = OUTER_DIMENSIONS;
  const aspect = outer.height / outer.width; // 20.8 / 10.8
  const candidateHeight = viewport.widthPx * aspect;
  if (candidateHeight <= viewport.heightPx) {
    return {
      pixelsPerMeter: viewport.widthPx / outer.width,
      widthPx: viewport.widthPx,
      heightPx: candidateHeight,
    };
  }
  return {
    pixelsPerMeter: viewport.heightPx / outer.height,
    widthPx: viewport.heightPx / aspect,
    heightPx: viewport.heightPx,
  };
}

// Tamaño total del Stage en metros (pista + margen exterior).
export const OUTER_DIMENSIONS = {
  width: courtConfig.surface.width + 2 * courtConfig.outerMargin,
  height: courtConfig.surface.height + 2 * courtConfig.outerMargin,
};

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
