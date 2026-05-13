// Helpers para gestión de frames del puzzle: clonado, lerp para preview,
// y selección del frame activo en edición.

import type { PuzzleBall, PuzzleFrame, PuzzlePlayer } from '../../../../../types/learningContent';

/**
 * Frame activo en el editor.
 *   - 'initial'                                  → initial_frame del puzzle
 *   - { optionId: 1|2|3, phase: 'select' }       → options[i].select_frame
 *   - { optionId: 1|2|3, phase: 'confirm' }      → options[i].confirmation_frame
 */
export type ActiveFrameKey =
  | 'initial'
  | { optionId: 1 | 2 | 3; phase: 'select' | 'confirm' };

export function isInitialFrame(key: ActiveFrameKey): key is 'initial' {
  return key === 'initial';
}

export function frameKeyEq(a: ActiveFrameKey, b: ActiveFrameKey): boolean {
  if (a === 'initial' || b === 'initial') return a === b;
  return a.optionId === b.optionId && a.phase === b.phase;
}

export function cloneFrame(f: PuzzleFrame): PuzzleFrame {
  return {
    players: f.players.map((p) => ({ ...p })),
    ball: { ...f.ball },
    shapes: f.shapes ? f.shapes.map((s) => ({ ...s })) : undefined,
    duration_ms: f.duration_ms,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Interpola entre dos frames en un instante t ∈ [0, 1].
 * Solo interpola posiciones; los players se emparejan por `id` (los que no aparecen
 * en el frame de destino se quedan estáticos en la posición del frame inicial).
 */
export function interpolateFrames(from: PuzzleFrame, to: PuzzleFrame, t: number): PuzzleFrame {
  const toPlayers = new Map(to.players.map((p) => [p.id, p]));
  const players: PuzzlePlayer[] = from.players.map((fp) => {
    const tp = toPlayers.get(fp.id);
    if (!tp) return fp;
    return {
      ...fp,
      x: lerp(fp.x, tp.x, t),
      y: lerp(fp.y, tp.y, t),
    };
  });

  const ball: PuzzleBall = {
    ...from.ball,
    x: lerp(from.ball.x, to.ball.x, t),
    y: lerp(from.ball.y, to.ball.y, t),
  };

  // Las shapes del frame `to` solo se muestran al final (no se interpolan).
  const shapes = t < 1 ? from.shapes : to.shapes;

  return { players, ball, shapes };
}
