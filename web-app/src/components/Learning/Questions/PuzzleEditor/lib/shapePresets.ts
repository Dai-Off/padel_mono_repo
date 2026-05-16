// Sistema de presets visuales para shapes en el editor web.
// Espejo del archivo en mobile-app/.../puzzle/lib/shapePresets.ts.

import type { PuzzleShape, ShapePreset } from '../../../../../types/learningContent';

export interface PresetVisual {
  stroke: string;
  fill?: string;
  fillOpacity?: number;
  dashArray?: number[]; // metros, se convierten a px en el renderer
  strokeWidthM?: number;
  glow?: { color: string; widthM: number; opacity: number };
  marching?: boolean;
  pulsing?: boolean;
  uppercase?: boolean;
}

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

export function resolvePreset(shape: PuzzleShape): ShapePreset {
  if (shape.style) return shape.style;
  switch (shape.type) {
    case 'circle':
      return 'highlight';
    case 'arrow':
      return 'trajectory';
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
    case 'speechbubble':
      return 'tactical';
    default:
      return 'highlight';
  }
}
