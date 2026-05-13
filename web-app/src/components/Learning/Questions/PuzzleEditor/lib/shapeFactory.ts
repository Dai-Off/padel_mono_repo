// Factory de shapes nuevas para el editor. Asigna un id corto (8 chars) y
// defaults sensatos para que la shape sea visible nada más crearla.

import type { PuzzleShape } from '../../../../../types/learningContent';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function genShapeId(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export type ShapeType = PuzzleShape['type'];

/**
 * Crea una shape nueva centrada aproximadamente en el centro de la pista
 * (5, 10) con dimensiones por defecto.
 */
export function createShape(type: ShapeType): PuzzleShape {
  const id = genShapeId();
  switch (type) {
    case 'circle':
      return { id, type, x: 5, y: 10, radius: 0.5, color: 'yellow', dashed: true };
    case 'arrow':
      return {
        id,
        type,
        startPoint: { x: 4, y: 12 },
        endPoint: { x: 6, y: 8 },
        color: 'yellow',
        dashed: true,
      };
    case 'rect':
      return {
        id,
        type,
        x: 4,
        y: 9,
        width: 2,
        height: 1,
        color: '#ff9182',
        fillColor: '#ff9182',
        fillOpacity: 0.7,
        visible_only_after_confirmation: true,
      };
    case 'line':
      return { id, type, points: [4, 10, 5, 10.2, 6, 10], color: 'red', strokeWidth: 0.12 };
    case 'text':
      return { id, type, x: 5, y: 10, text: 'texto', fontSize: 14, color: 'red' };
    case 'triangle':
      return {
        id,
        type,
        points: [5, 8, 4, 11, 6, 11],
        color: 'yellow',
        fillColor: 'yellow',
        fillOpacity: 0.5,
      };
  }
}
