// Factory de shapes nuevas para el editor. Asigna un id corto (8 chars) y
// defaults sensatos + preset visual coherente con el tipo.

import type { PuzzleShape, ShapePreset } from '../../../../../types/learningContent';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function genShapeId(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export type ShapeType = PuzzleShape['type'];

// Preset por defecto al crear una shape de cada tipo.
const DEFAULT_PRESET: Record<ShapeType, ShapePreset> = {
  arrow: 'trajectory',
  circle: 'highlight',
  rect: 'good_zone',
  triangle: 'good_zone',
  line: 'movement',
  text: 'measure',
  speechbubble: 'tactical', // el preset no se usa visualmente (el bocadillo siempre es blanco)
};

/**
 * Crea una shape nueva centrada aproximadamente en el centro de la pista
 * (5, 10) con dimensiones por defecto + preset visual del tipo.
 */
export function createShape(type: ShapeType): PuzzleShape {
  const id = genShapeId();
  const style = DEFAULT_PRESET[type];
  switch (type) {
    case 'circle':
      return { id, type, style, x: 5, y: 10, radius: 0.5 };
    case 'arrow':
      return {
        id,
        type,
        style,
        startPoint: { x: 4, y: 12 },
        endPoint: { x: 6, y: 8 },
      };
    case 'rect':
      return { id, type, style, x: 4, y: 9, width: 2, height: 1 };
    case 'line':
      return { id, type, style, points: [4, 10, 5, 10.2, 6, 10] };
    case 'text':
      return { id, type, style, x: 5, y: 10, text: 'texto', fontSize: 14 };
    case 'triangle':
      return { id, type, style, points: [5, 8, 4, 11, 6, 11] };
    case 'speechbubble':
      return { id, type, style, x: 5, y: 10, text: 'Mine!', fontSize: 16 };
  }
}

/**
 * Crea una shape a partir del rectángulo definido por el drag (start, end).
 * Para shapes con dimensiones (rect, circle, triangle) el rectángulo de drag
 * define el bounding box. Para arrow es de start a end. Para text/speechbubble
 * se planta en el centro del drag con su tamaño por defecto.
 */
export function createShapeFromDrag(
  type: ShapeType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): PuzzleShape {
  const id = genShapeId();
  const style = DEFAULT_PRESET[type];
  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const maxX = Math.max(startX, endX);
  const maxY = Math.max(startY, endY);
  const w = Math.max(0.1, maxX - minX);
  const h = Math.max(0.1, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  switch (type) {
    case 'circle': {
      // Radius = mitad del lado mayor del bounding box.
      const r = Math.max(0.1, Math.max(w, h) / 2);
      return { id, type, style, x: cx, y: cy, radius: r };
    }
    case 'arrow':
      return { id, type, style, startPoint: { x: startX, y: startY }, endPoint: { x: endX, y: endY } };
    case 'rect':
      return { id, type, style, x: minX, y: minY, width: w, height: h };
    case 'line':
      return { id, type, style, points: [startX, startY, endX, endY] };
    case 'triangle':
      // Triángulo isósceles dentro del bounding box, apuntando hacia arriba.
      return {
        id,
        type,
        style,
        points: [cx, minY, minX, maxY, maxX, maxY],
      };
    case 'text':
      return { id, type, style, x: cx, y: cy, text: 'texto', fontSize: 14 };
    case 'speechbubble':
      return { id, type, style, x: cx, y: cy, text: 'Mine!', fontSize: 16 };
  }
}

