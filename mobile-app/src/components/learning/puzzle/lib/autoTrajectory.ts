// Espejo de web-app/.../lib/autoTrajectory.ts.
// Genera shapes auto (trajectory + 2 highlights) desde la pelota del frame
// anterior hasta la actual. On-render, no se persisten.

import type { PuzzleFrame, PuzzleShape } from '../../../../types/puzzle';

const AUTO_PREFIX = 'auto-';

export function isAutoShape(shape: PuzzleShape): boolean {
  return shape.id.startsWith(AUTO_PREFIX);
}

export function generateAutoShapes(prevFrame: PuzzleFrame | null, currentFrame: PuzzleFrame): PuzzleShape[] {
  if (currentFrame.auto_trajectory === false) return [];
  const cx = currentFrame.ball.x;
  const cy = currentFrame.ball.y;
  const result: PuzzleShape[] = [];

  // Sin frame anterior (initial_frame): solo highlight en la posición actual.
  if (!prevFrame) {
    result.push({
      id: `${AUTO_PREFIX}dest`,
      type: 'circle',
      style: 'highlight',
      x: cx,
      y: cy,
      radius: 0.5,
    });
    return result;
  }

  const px = prevFrame.ball.x;
  const py = prevFrame.ball.y;
  // Si la pelota no se ha movido, solo highlight actual.
  if (Math.hypot(cx - px, cy - py) < 0.1) {
    result.push({
      id: `${AUTO_PREFIX}dest`,
      type: 'circle',
      style: 'highlight',
      x: cx,
      y: cy,
      radius: 0.5,
    });
    return result;
  }

  // Acortamos la flecha por el radio del highlight para que no se vea "tapada"
  // por la pelota (punta al centro) ni cubra el highlight de origen.
  const dx = cx - px;
  const dy = cy - py;
  const dist = Math.hypot(dx, dy);
  const HL_R = 0.5;
  const ux = dx / dist;
  const uy = dy / dist;
  const inset = Math.min(HL_R, dist * 0.4); // si los highlights se tocan, recortamos menos
  const sX = px + ux * inset;
  const sY = py + uy * inset;
  const eX = cx - ux * inset;
  const eY = cy - uy * inset;

  result.push({
    id: `${AUTO_PREFIX}orig`,
    type: 'circle',
    style: 'highlight',
    x: px,
    y: py,
    radius: HL_R,
  });
  result.push({
    id: `${AUTO_PREFIX}dest`,
    type: 'circle',
    style: 'highlight',
    x: cx,
    y: cy,
    radius: HL_R,
  });
  result.push({
    id: `${AUTO_PREFIX}traj`,
    type: 'arrow',
    style: 'trajectory',
    startPoint: { x: sX, y: sY },
    endPoint: { x: eX, y: eY },
  });
  return result;
}
