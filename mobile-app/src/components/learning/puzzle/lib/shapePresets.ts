// Sistema de presets visuales para shapes.
// Cada preset define colores, animación, glow, etc. de forma centralizada.
// El JSON del catálogo (que viene con campos legacy color/dashed/fillColor)
// se mapea automáticamente al preset correspondiente al renderizar.

import type { PuzzleShape, ShapePreset } from '../../../../types/puzzle';

export interface PresetVisual {
  // Color principal del trazo / borde.
  stroke: string;
  // Color del fill (para rect, triangle); puede ser un gradient id o color.
  fill?: string;
  // Opacidad del fill.
  fillOpacity?: number;
  // Discontinuidad del trazo (array de números en metros, undefined = sólido).
  // react-native-svg espera array, NO string (causa crash si se pasa string en Android).
  dashArray?: number[];
  // Ancho del stroke en metros (escalado al viewBox).
  strokeWidthM?: number;
  // Si tiene fake glow (path duplicado debajo, más ancho y semitransparente).
  glow?: { color: string; widthM: number; opacity: number };
  // Si las dashes "marchan" (animan stroke-dashoffset).
  marching?: boolean;
  // Si el shape pulsa (escala + opacidad).
  pulsing?: boolean;
  // Texto en mayúsculas (para tactical).
  uppercase?: boolean;
}

// Tabla de presets → estilo visual.
export const PRESETS: Record<ShapePreset, PresetVisual> = {
  trajectory: {
    stroke: '#F18F34',
    dashArray: [0.3, 0.2],
    strokeWidthM: 0.18,
    marching: true,
  },
  movement: {
    stroke: '#60a5fa',
    dashArray: [0.2, 0.18],
    strokeWidthM: 0.12,
    marching: true,
  },
  highlight: {
    stroke: '#F18F34',
    strokeWidthM: 0.08,
    pulsing: true,
  },
  good_zone: {
    stroke: '#4ade80',
    fill: '#22c55e',
    fillOpacity: 0.35,
    strokeWidthM: 0.08,
  },
  bad_zone: {
    stroke: '#f87171',
    fill: '#ef4444',
    fillOpacity: 0.35,
    strokeWidthM: 0.08,
  },
  neutral_zone: {
    stroke: '#fbbf24',
    fill: '#fbbf24',
    fillOpacity: 0.25,
    strokeWidthM: 0.08,
  },
  measure: {
    // El render se hace como pill blanca, no como SVG estándar. Estos valores
    // son hint para el render.
    stroke: '#0f172a',
    fill: '#ffffff',
    fillOpacity: 1,
  },
  tactical: {
    stroke: '#ffffff',
    fill: '#F18F34',
    fillOpacity: 1,
    uppercase: true,
  },
};

/**
 * Devuelve el preset efectivo de una shape: explícito (campo style) o derivado
 * de campos legacy (color/dashed/fillColor).
 */
export function resolvePreset(shape: PuzzleShape): ShapePreset {
  if (shape.style) return shape.style;
  // Inferencia desde campos legacy.
  switch (shape.type) {
    case 'circle':
      return 'highlight';
    case 'arrow': {
      // arrow rojo/green con pointerAtBeginning → eran flechitas de medida en padelchess.
      // Las descartamos visualmente (preset 'measure' no aplica a arrow). Por defecto trayectoria.
      return 'trajectory';
    }
    case 'rect':
    case 'triangle': {
      const fill = (shape as { fillColor?: string }).fillColor?.toLowerCase() ?? '';
      if (fill.includes('68fec3') || fill.includes('22c55e') || fill === 'green') return 'good_zone';
      if (fill.includes('ff9182') || fill.includes('ef4444') || fill === 'red') return 'bad_zone';
      return 'neutral_zone';
    }
    case 'text':
      return 'measure';
    case 'line':
      return 'movement';
    default:
      return 'highlight';
  }
}
