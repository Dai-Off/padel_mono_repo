// Render Konva de los presets visuales v2.
// Animaciones: marching dashes (dashOffset) + halo pulse (escala).
// Puntas de flecha: base perpendicular al final de la línea, no superpuestas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Line, Rect, Text, Transformer } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { m2px, px2m, snap, type ScaleInfo } from '../lib/coords';
import { PRESETS, resolvePreset, type PresetVisual } from '../lib/shapePresets';
import type { PuzzleShape } from '../../../../../types/learningContent';

// Aplica un transform afín dado por la función `xf` a cada punto del shape.
// El strokeWidth NO se escala (las shapes lo renderizan en metros con strokeWidthM
// del preset).
function applyTransformWithFn(
  shape: PuzzleShape,
  xf: (x: number, y: number) => { x: number; y: number },
  avgScale: number,
): PuzzleShape {
  switch (shape.type) {
    case 'circle': {
      const c = xf(shape.x, shape.y);
      return { ...shape, x: c.x, y: c.y, radius: Math.max(0.05, shape.radius * avgScale) };
    }
    case 'text':
    case 'speechbubble': {
      const c = xf(shape.x, shape.y);
      return { ...shape, x: c.x, y: c.y, fontSize: Math.max(4, Math.round((shape.fontSize ?? 14) * avgScale)) };
    }
    case 'rect': {
      // Para rect: transformar las 4 esquinas y sacar bbox alineado.
      const corners = [
        xf(shape.x, shape.y),
        xf(shape.x + shape.width, shape.y),
        xf(shape.x + shape.width, shape.y + shape.height),
        xf(shape.x, shape.y + shape.height),
      ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return { ...shape, x: minX, y: minY, width: Math.max(0.05, maxX - minX), height: Math.max(0.05, maxY - minY) };
    }
    case 'arrow': {
      const sp = xf(shape.startPoint.x, shape.startPoint.y);
      const ep = xf(shape.endPoint.x, shape.endPoint.y);
      const cp = shape.controlPoint ? xf(shape.controlPoint.x, shape.controlPoint.y) : undefined;
      return {
        ...shape,
        startPoint: sp,
        endPoint: ep,
        ...(cp ? { controlPoint: cp } : {}),
      };
    }
    case 'line':
    case 'triangle': {
      const pts: number[] = [];
      for (let i = 0; i < shape.points.length; i += 2) {
        const p = xf(shape.points[i], shape.points[i + 1]);
        pts.push(p.x, p.y);
      }
      return { ...shape, points: pts };
    }
  }
}

interface Props {
  shape: PuzzleShape;
  scale: ScaleInfo;
  selected?: boolean;
  onSelect?: () => void;
  onChange?: (next: PuzzleShape) => void;
  draggable?: boolean;
  // shot_type del ball del frame, para auto-curvar la trayectoria cuando no
  // hay controlPoint explícito. lob = curvatura pronunciada, chiquita = leve.
  ballShotType?: 'lob' | 'chiquita';
  // Progress 0..1 para sincronizar la trayectoria con la pelota durante
  // animaciones (preview, play). Default 1 = línea completa.
  trajectoryProgress?: number;
}

// Desplaza todas las coordenadas relevantes de una shape por (dxM, dyM) metros.
// Devuelve una nueva shape con las coords ajustadas. Usado en drag.
function translateShape(shape: PuzzleShape, dxM: number, dyM: number): PuzzleShape {
  switch (shape.type) {
    case 'circle':
    case 'rect':
    case 'text':
    case 'speechbubble':
      return { ...shape, x: shape.x + dxM, y: shape.y + dyM };
    case 'arrow': {
      const cp = shape.controlPoint
        ? { x: shape.controlPoint.x + dxM, y: shape.controlPoint.y + dyM }
        : undefined;
      return {
        ...shape,
        startPoint: { x: shape.startPoint.x + dxM, y: shape.startPoint.y + dyM },
        endPoint: { x: shape.endPoint.x + dxM, y: shape.endPoint.y + dyM },
        ...(cp ? { controlPoint: cp } : {}),
      };
    }
    case 'line':
    case 'triangle': {
      const pts = shape.points.map((v, i) => (i % 2 === 0 ? v + dxM : v + dyM));
      return { ...shape, points: pts };
    }
  }
}

// Calcula los 3 puntos de la punta de flecha (perpendicular al final).
function arrowHead(tipX: number, tipY: number, dx: number, dy: number, headLen: number, halfBase: number) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const cutX = tipX - ux * headLen;
  const cutY = tipY - uy * headLen;
  const px = -uy;
  const py = ux;
  return {
    tipX,
    tipY,
    b1x: cutX + px * halfBase,
    b1y: cutY + py * halfBase,
    b2x: cutX - px * halfBase,
    b2y: cutY - py * halfBase,
    cutX,
    cutY,
  };
}

// Hook para marching dashes: anima dashOffset.
function useMarching(active: boolean, durationMs: number, distanceM: number, scale: ScaleInfo) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) % durationMs) / durationMs;
      setOffset(-t * m2px(distanceM, scale));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs, distanceM, scale]);
  return offset;
}

// Hook para halo pulsante: anima scale entre 1 y 1.18.
function useHaloPulse(active: boolean) {
  const [s, setS] = useState(1);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) % 1600) / 1600;
      // Curva sinusoidal entre 1 y 1.18
      const eased = 1 + 0.18 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI));
      setS(eased);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return s;
}

// ───── Renderers por preset ─────

// Aprox longitud de una curva Bézier cuadrática (o línea recta) por sampling.
function approxLenPx(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null) {
  if (!cp) return Math.hypot(ex - sx, ey - sy);
  let len = 0;
  let prevX = sx;
  let prevY = sy;
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const u = 1 - t;
    const x = u * u * sx + 2 * u * t * cp.x + t * t * ex;
    const y = u * u * sy + 2 * u * t * cp.y + t * t * ey;
    len += Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return len;
}

function lengthAtTPx(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, target: number) {
  if (target <= 0) return 0;
  const t1 = Math.min(1, target);
  if (!cp) return Math.hypot(ex - sx, ey - sy) * t1;
  const samples = Math.max(2, Math.ceil(20 * t1));
  let len = 0;
  let prevX = sx;
  let prevY = sy;
  for (let i = 1; i <= samples; i++) {
    const tt = (i / samples) * t1;
    const u = 1 - tt;
    const x = u * u * sx + 2 * u * tt * cp.x + tt * tt * ex;
    const y = u * u * sy + 2 * u * tt * cp.y + tt * tt * ey;
    len += Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return len;
}

function tAtLengthPx(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, targetLen: number) {
  if (targetLen <= 0) return 0;
  const total = approxLenPx(sx, sy, ex, ey, cp);
  if (targetLen >= total) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const len = lengthAtTPx(sx, sy, ex, ey, cp, mid);
    if (len < targetLen) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function pointAtT(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, t: number) {
  if (!cp) return { x: sx + (ex - sx) * t, y: sy + (ey - sy) * t, dx: ex - sx, dy: ey - sy };
  const u = 1 - t;
  const x = u * u * sx + 2 * u * t * cp.x + t * t * ex;
  const y = u * u * sy + 2 * u * t * cp.y + t * t * ey;
  const dx = 2 * u * (cp.x - sx) + 2 * t * (ex - cp.x);
  const dy = 2 * u * (cp.y - sy) + 2 * t * (ey - cp.y);
  return { x, y, dx, dy };
}

function TrajectoryRender({ shape, visual, scale, ballShotType, progress = 1 }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
  ballShotType?: 'lob' | 'chiquita';
  progress?: number;
}) {
  const sx = m2px(shape.startPoint.x, scale);
  const sy = m2px(shape.startPoint.y, scale);
  const ex = m2px(shape.endPoint.x, scale);
  const ey = m2px(shape.endPoint.y, scale);
  // Curvatura automática si no hay controlPoint pero la pelota es lob/chiquita.
  // Se memoriza para que NO se recalcule en cada frame del progress: si lo
  // recalculamos, mínimas diferencias de redondeo en distToBorder(candA/B)
  // pueden hacer que el lado elegido se invierta a mitad de animación.
  const explicitCpX = shape.controlPoint?.x;
  const explicitCpY = shape.controlPoint?.y;
  const cp = useMemo<{ x: number; y: number } | null>(() => {
    if (explicitCpX !== undefined && explicitCpY !== undefined) {
      return { x: m2px(explicitCpX, scale), y: m2px(explicitCpY, scale) };
    }
    if (!ballShotType) return null;
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy);
    if (len <= 0.001) return null;
    const px = -dy / len;
    const py = dx / len;
    const factor = ballShotType === 'lob' ? 0.25 : 0.12;
    const offset = len * factor;
    const candA = { x: midX + px * offset, y: midY + py * offset };
    const candB = { x: midX - px * offset, y: midY - py * offset };
    const stageW = scale.widthPx;
    const stageH = scale.heightPx;
    const distToBorder = (p: { x: number; y: number }) =>
      Math.min(p.x, stageW - p.x, p.y, stageH - p.y);
    return distToBorder(candA) >= distToBorder(candB) ? candA : candB;
  }, [sx, sy, ex, ey, explicitCpX, explicitCpY, ballShotType, scale]);
  // Path acortado: termina justo en la base de la cabeza final.
  const tangentEndX = cp ? ex - cp.x : ex - sx;
  const tangentEndY = cp ? ey - cp.y : ey - sy;
  const headLenPx = m2px(0.5, scale);
  const halfBasePx = m2px(0.22, scale);
  const finalHead = arrowHead(ex, ey, tangentEndX, tangentEndY, headLenPx, halfBasePx);
  const endX = finalHead?.cutX ?? ex;
  const endY = finalHead?.cutY ?? ey;
  // Las longitudes parciales se calculan por dash via lengthAtTPx (que usa
  // approxLenPx internamente).

  // Patrón de dashes del preset (convertido a px).
  const dashArr = visual.dashArray ?? [0.3, 0.2];
  const dashSizePx = m2px(dashArr[0], scale);
  const gapSizePx = m2px(dashArr[1] ?? 0.2, scale);
  const cyclePx = dashSizePx + gapSizePx;

  // Longitud arc visible en este frame.
  const visibleLenPx = lengthAtTPx(sx, sy, endX, endY, cp, progress);

  // Marching offset (en px, mismo loop continuo cuando progress=1).
  const rawMarch = useMarching(!!visual.marching, 1200, 1, scale);
  const marchOffsetPx = ((-rawMarch) % cyclePx + cyclePx) % cyclePx;

  // Punta dinámica: tip = HEADLEN adelante del punto en t=progress del path acortado.
  const strokeWPx = m2px(visual.strokeWidthM ?? 0.12, scale);
  let dynamicHead = finalHead;
  const isDrawing = progress < 1;
  if (isDrawing) {
    const pt = pointAtT(sx, sy, endX, endY, cp, progress);
    const tlen = Math.hypot(pt.dx, pt.dy) || 1;
    const ux = pt.dx / tlen;
    const uy = pt.dy / tlen;
    dynamicHead = arrowHead(pt.x + ux * headLenPx, pt.y + uy * headLenPx, pt.dx, pt.dy, headLenPx, halfBasePx);
  }

  // Enumerar dashes en [0, visibleLen - swHalf]. Cada dash es una Line con
  // strokeLinecap=round (extremos redondos, sin cortes).
  const swHalfPx = strokeWPx / 2;
  const dashesEnd = Math.max(0, visibleLenPx - swHalfPx);
  const dashes: { points: number[] }[] = [];
  const startIdx = Math.floor(-marchOffsetPx / cyclePx) - 1;
  const endIdx = Math.ceil((dashesEnd - marchOffsetPx) / cyclePx) + 1;
  const minLenPx = m2px(0.005, scale);
  const samplesPerDash = cp ? 4 : 2;

  for (let i = startIdx; i <= endIdx; i++) {
    const startArc = marchOffsetPx + i * cyclePx;
    const endArc = startArc + dashSizePx;
    const a = Math.max(0, startArc);
    const b = Math.min(dashesEnd, endArc);
    if (b - a < minLenPx) continue;
    const tA = tAtLengthPx(sx, sy, endX, endY, cp, a);
    const tB = tAtLengthPx(sx, sy, endX, endY, cp, b);
    const pts: number[] = [];
    for (let k = 0; k <= samplesPerDash; k++) {
      const t = tA + (tB - tA) * (k / samplesPerDash);
      const u = 1 - t;
      let x: number;
      let y: number;
      if (cp) {
        x = u * u * sx + 2 * u * t * cp.x + t * t * endX;
        y = u * u * sy + 2 * u * t * cp.y + t * t * endY;
      } else {
        x = sx + (endX - sx) * t;
        y = sy + (endY - sy) * t;
      }
      pts.push(x, y);
    }
    dashes.push({ points: pts });
  }

  return (
    <Group>
      {dashes.map((d, i) => (
        <Line
          key={i}
          points={d.points}
          stroke={visual.stroke}
          strokeWidth={strokeWPx}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {dynamicHead && (
        <Line
          points={[dynamicHead.tipX, dynamicHead.tipY, dynamicHead.b1x, dynamicHead.b1y, dynamicHead.b2x, dynamicHead.b2y]}
          closed
          fill={visual.stroke}
        />
      )}
    </Group>
  );
}

function MovementRender({ shape, visual, scale, progress = 1 }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
  progress?: number;
}) {
  // Línea recta sin controlPoint. Mismo algoritmo de dashes-como-Lines que
  // TrajectoryRender para soportar el draw-progressive con marching.
  const sx = m2px(shape.startPoint.x, scale);
  const sy = m2px(shape.startPoint.y, scale);
  const ex = m2px(shape.endPoint.x, scale);
  const ey = m2px(shape.endPoint.y, scale);
  const headLenPx = m2px(0.45, scale);
  const halfBasePx = m2px(0.18, scale);
  const tangentEndX = ex - sx;
  const tangentEndY = ey - sy;
  const finalHead = arrowHead(ex, ey, tangentEndX, tangentEndY, headLenPx, halfBasePx);
  const endX = finalHead?.cutX ?? ex;
  const endY = finalHead?.cutY ?? ey;

  const dashArr = visual.dashArray ?? [0.2, 0.18];
  const dashSizePx = m2px(dashArr[0], scale);
  const gapSizePx = m2px(dashArr[1] ?? 0.18, scale);
  const cyclePx = dashSizePx + gapSizePx;
  const visibleLenPx = lengthAtTPx(sx, sy, endX, endY, null, progress);
  const rawMarch = useMarching(!!visual.marching, 2400, 1, scale);
  const marchOffsetPx = ((-rawMarch) % cyclePx + cyclePx) % cyclePx;

  const strokeWPx = m2px(visual.strokeWidthM ?? 0.12, scale);
  let dynamicHead = finalHead;
  if (progress < 1) {
    const pt = pointAtT(sx, sy, endX, endY, null, progress);
    const tlen = Math.hypot(pt.dx, pt.dy) || 1;
    const ux = pt.dx / tlen;
    const uy = pt.dy / tlen;
    dynamicHead = arrowHead(pt.x + ux * headLenPx, pt.y + uy * headLenPx, pt.dx, pt.dy, headLenPx, halfBasePx);
  }

  const swHalfPx = strokeWPx / 2;
  const dashesEnd = Math.max(0, visibleLenPx - swHalfPx);
  const dashes: { points: number[] }[] = [];
  const startIdx = Math.floor(-marchOffsetPx / cyclePx) - 1;
  const endIdx = Math.ceil((dashesEnd - marchOffsetPx) / cyclePx) + 1;
  const minLenPx = m2px(0.005, scale);
  for (let i = startIdx; i <= endIdx; i++) {
    const startArc = marchOffsetPx + i * cyclePx;
    const endArc = startArc + dashSizePx;
    const a = Math.max(0, startArc);
    const b = Math.min(dashesEnd, endArc);
    if (b - a < minLenPx) continue;
    const tA = tAtLengthPx(sx, sy, endX, endY, null, a);
    const tB = tAtLengthPx(sx, sy, endX, endY, null, b);
    const pts: number[] = [
      sx + (endX - sx) * tA, sy + (endY - sy) * tA,
      sx + (endX - sx) * tB, sy + (endY - sy) * tB,
    ];
    dashes.push({ points: pts });
  }

  return (
    <Group>
      {dashes.map((d, i) => (
        <Line
          key={i}
          points={d.points}
          stroke={visual.stroke}
          strokeWidth={strokeWPx}
          lineCap="round"
        />
      ))}
      {dynamicHead && (
        <Line
          points={[dynamicHead.tipX, dynamicHead.tipY, dynamicHead.b1x, dynamicHead.b1y, dynamicHead.b2x, dynamicHead.b2y]}
          closed
          fill={visual.stroke}
        />
      )}
    </Group>
  );
}

function HighlightRender({ shape, visual, scale }: {
  shape: Extract<PuzzleShape, { type: 'circle' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
}) {
  const cx = m2px(shape.x, scale);
  const cy = m2px(shape.y, scale);
  const r = m2px(shape.radius, scale);
  const haloPulse = useHaloPulse(true);

  return (
    <Group>
      {/* Solo halo radial pulsante (sin anillo fino) */}
      <Circle
        x={cx}
        y={cy}
        radius={r * 1.2 * haloPulse}
        fill={visual.stroke}
        opacity={0.25 / haloPulse}
      />
    </Group>
  );
}

function ZoneRectRender({ shape, visual, scale, withHatch }: {
  shape: Extract<PuzzleShape, { type: 'rect' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
  withHatch?: boolean;
}) {
  const x = m2px(shape.x, scale);
  const y = m2px(shape.y, scale);
  const w = m2px(shape.width, scale);
  const h = m2px(shape.height, scale);
  const cornerR = m2px(0.15, scale);
  const strokeWidth = m2px(visual.strokeWidthM ?? 0.08, scale);

  // Hatch como pattern: dibujamos diagonales encima.
  const hatchLines: number[][] = [];
  if (withHatch) {
    const spacingPx = m2px(0.3, scale);
    const diag = Math.hypot(w, h);
    const num = Math.ceil(diag / spacingPx) + 1;
    for (let i = -num; i < num; i++) {
      // Línea diagonal de pendiente 1 cruzando el rect en distintos offsets.
      const dx = i * spacingPx;
      hatchLines.push([x + dx, y, x + dx + h, y + h]);
    }
  }

  return (
    <Group clipFunc={(ctx) => {
      // Recortamos al rect para que las hatch lines no se salgan.
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }}>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        cornerRadius={cornerR}
        fill={visual.fill}
        opacity={visual.fillOpacity}
        stroke={visual.stroke}
        strokeWidth={strokeWidth}
      />
      {withHatch && hatchLines.map((p, i) => (
        <Line key={i} points={p} stroke="rgba(0,0,0,0.25)" strokeWidth={m2px(0.04, scale)} />
      ))}
    </Group>
  );
}

function ZoneTriangleRender({ shape, visual, scale, withHatch }: {
  shape: Extract<PuzzleShape, { type: 'triangle' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
  withHatch?: boolean;
}) {
  void withHatch; // por simplicidad no aplicamos hatch a triángulo en web (es raro).
  const pts: number[] = [];
  for (let i = 0; i < 6; i += 2) {
    pts.push(m2px(shape.points[i], scale), m2px(shape.points[i + 1], scale));
  }
  return (
    <Line
      points={pts}
      closed
      fill={visual.fill}
      opacity={visual.fillOpacity}
      stroke={visual.stroke}
      strokeWidth={m2px(visual.strokeWidthM ?? 0.08, scale)}
      listening={false}
    />
  );
}

function LineRender({ shape, visual, scale }: {
  shape: Extract<PuzzleShape, { type: 'line' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
}) {
  const pts: number[] = [];
  for (let i = 0; i < shape.points.length - 1; i += 2) {
    pts.push(m2px(shape.points[i], scale), m2px(shape.points[i + 1], scale));
  }
  return (
    <Line
      points={pts}
      stroke={visual.stroke}
      strokeWidth={m2px(shape.strokeWidth ?? visual.strokeWidthM ?? 0.12, scale)}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />
  );
}

function TextRender({ shape, visual, scale }: {
  shape: Extract<PuzzleShape, { type: 'text' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
}) {
  const preset = resolvePreset(shape);
  const isTactical = preset === 'tactical';
  const text = isTactical ? shape.text.toUpperCase() : shape.text;
  const sizeM = Math.max(0.5, (shape.fontSize ?? 14) * 0.045);
  const fontSizePx = m2px(sizeM, scale);
  const padX = fontSizePx * 0.6;
  const padY = fontSizePx * 0.35;
  // Estimación de ancho del texto (no medimos exactamente).
  const textWidthEst = text.length * fontSizePx * 0.62;
  const pillW = textWidthEst + padX * 2;
  const pillH = fontSizePx + padY * 2;
  const cx = m2px(shape.x, scale);
  const cy = m2px(shape.y, scale);

  return (
    <Group>
      <Rect
        x={cx - pillW / 2}
        y={cy - pillH / 2}
        width={pillW}
        height={pillH}
        cornerRadius={pillH / 2}
        fill={visual.fill ?? '#fff'}
        opacity={visual.fillOpacity ?? 1}
        stroke={isTactical ? undefined : 'rgba(0,0,0,0.4)'}
        strokeWidth={isTactical ? 0 : 0.5}
      />
      <Text
        x={cx - pillW / 2}
        y={cy - fontSizePx / 2}
        width={pillW}
        text={text}
        fontSize={fontSizePx}
        fontStyle="800"
        fill={isTactical ? '#ffffff' : '#0f172a'}
        align="center"
      />
    </Group>
  );
}

function SpeechBubbleRender({ shape, scale }: {
  shape: Extract<PuzzleShape, { type: 'speechbubble' }>;
  scale: ScaleInfo;
}) {
  // Ancho fijo MAX. Si texto cabe → 1 línea, si no → 2 líneas. Si aún no cabe,
  // reducir fontSize. Mismo algoritmo que en mobile.
  const targetW = Math.min(220, scale.widthPx * 0.35);
  const sizeM = Math.max(0.5, (shape.fontSize ?? 14) * 0.045);
  let fontSizePx = m2px(sizeM, scale);
  const padX = 10;
  const padY = 6;
  const innerW = targetW - padX * 2;
  const charW = fontSizePx * 0.55;
  const charsPerLine = Math.max(1, Math.floor(innerW / charW));
  let numberOfLines = 1;
  if (shape.text.length <= charsPerLine) {
    numberOfLines = 1;
  } else if (shape.text.length <= charsPerLine * 2) {
    numberOfLines = 2;
  } else {
    numberOfLines = 2;
    const needed = shape.text.length / 2;
    fontSizePx = Math.max(10, fontSizePx * (charsPerLine / needed));
  }
  const pillW = targetW;
  const pillH = fontSizePx * numberOfLines * 1.2 + padY * 2;
  const tailH = fontSizePx * 0.5;
  const cx = m2px(shape.x, scale);
  const cy = m2px(shape.y, scale);
  const top = cy - (pillH + tailH) / 2;

  return (
    <Group>
      <Rect
        x={cx - pillW / 2}
        y={top}
        width={pillW}
        height={pillH}
        cornerRadius={fontSizePx * 0.45}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={Math.max(1, m2px(0.05, scale))}
      />
      {/* Rabo del bocadillo (triángulo apuntando abajo) */}
      <Line
        points={[
          cx - tailH * 0.55, top + pillH,
          cx + tailH * 0.55, top + pillH,
          cx, top + pillH + tailH,
        ]}
        closed
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={Math.max(1, m2px(0.05, scale))}
      />
      {/* Línea blanca que cubre la unión del rabo con el body para ocultar el borde superior del triángulo */}
      <Rect
        x={cx - tailH * 0.55 + 1}
        y={top + pillH - 1}
        width={tailH * 1.1 - 2}
        height={2}
        fill="#ffffff"
      />
      <Text
        x={cx - pillW / 2 + padX}
        y={top + padY}
        width={pillW - padX * 2}
        height={pillH - padY * 2}
        text={shape.text}
        fontSize={fontSizePx}
        fontStyle="800"
        fill="#0f172a"
        align="center"
        verticalAlign="middle"
        lineHeight={1.2}
        wrap="word"
        ellipsis
      />
    </Group>
  );
}

// ───── Dispatch ─────

export function ShapeNode({ shape, scale, selected, onSelect, onChange, draggable, ballShotType, trajectoryProgress }: Props) {
  const preset = resolvePreset(shape);
  const visual = PRESETS[preset];

  // Render no-interactivo (lo del switch) cuando no hay handlers o no es draggable.
  // Cuando hay handlers: envolvemos en un Group draggable + onClick.
  const inner = (() => {
    switch (shape.type) {
      case 'arrow':
        return preset === 'movement'
          ? <MovementRender shape={shape} visual={visual} scale={scale} progress={trajectoryProgress ?? 1} />
          : <TrajectoryRender shape={shape} visual={visual} scale={scale} ballShotType={ballShotType} progress={trajectoryProgress ?? 1} />;
      case 'circle':
        return <HighlightRender shape={shape} visual={visual} scale={scale} />;
      case 'rect':
        return <ZoneRectRender shape={shape} visual={visual} scale={scale} withHatch={preset === 'bad_zone'} />;
      case 'triangle':
        return <ZoneTriangleRender shape={shape} visual={visual} scale={scale} withHatch={preset === 'bad_zone'} />;
      case 'line':
        return <LineRender shape={shape} visual={visual} scale={scale} />;
      case 'text':
        return <TextRender shape={shape} visual={visual} scale={scale} />;
      case 'speechbubble':
        return <SpeechBubbleRender shape={shape} scale={scale} />;
      default: {
        const _: never = shape;
        void _;
        return null;
      }
    }
  })();

  const interactive = !!onChange && !!draggable;

  // Refs para Transformer.
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  // Conectar el Transformer cuando hay selección. Forzar actualización del
  // bbox cada vez que los datos del shape cambian (sino se queda en posición
  // antigua después de un resize).
  useEffect(() => {
    if (!interactive) return;
    if (selected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.forceUpdate();
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
    // Dependemos del `shape` entero para que cualquier cambio (drag, resize,
    // edit numérico desde el inspector) refresque el Transformer.
  }, [selected, interactive, shape]);

  if (!interactive) {
    return inner;
  }

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const dxPx = e.target.x();
    const dyPx = e.target.y();
    let dxM = px2m(dxPx, scale);
    let dyM = px2m(dyPx, scale);
    dxM = snap(dxM);
    dyM = snap(dyM);
    e.target.position({ x: 0, y: 0 });
    onChange!(translateShape(shape, dxM, dyM));
  };

  const handleTransformEnd = (e: KonvaEventObject<Event>) => {
    const node = e.target as Konva.Group;
    // Capturar los valores ANTES de resetear el nodo.
    const sX = node.scaleX();
    const sY = node.scaleY();
    const rotDeg = node.rotation();
    const tx = node.x();
    const ty = node.y();
    // Reset del transform del nodo a identidad (los cambios van a los datos).
    node.scaleX(1);
    node.scaleY(1);
    node.rotation(0);
    node.x(0);
    node.y(0);

    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Traslación en metros (las coords de los datos están en metros).
    const txM = tx / scale.pixelsPerMeter;
    const tyM = ty / scale.pixelsPerMeter;
    // Transformación afín: punto (x, y) → escalar → rotar → trasladar.
    const xf = (x: number, y: number) => {
      const sxV = x * sX;
      const syV = y * sY;
      const rx = sxV * cos - syV * sin;
      const ry = sxV * sin + syV * cos;
      return { x: rx + txM, y: ry + tyM };
    };
    const avgScale = (Math.abs(sX) + Math.abs(sY)) / 2;
    onChange!(applyTransformWithFn(shape, xf, avgScale));
  };

  return (
    <>
      <Group
        ref={groupRef}
        draggable
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onClick={(e) => { e.cancelBubble = true; onSelect?.(); }}
        onTap={(e) => { e.cancelBubble = true; onSelect?.(); }}
      >
        {inner}
        {selected && <SelectionIndicator shape={shape} scale={scale} />}
      </Group>
      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          // El strokeWidth no se escala porque lo aplicamos a los datos en
          // onTransformEnd y reseteamos el scale del nodo a 1.
          enabledAnchors={
            shape.type === 'circle' || shape.type === 'text'
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : undefined
          }
          keepRatio={shape.type === 'circle'}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={5}
        />
      )}
    </>
  );
}

// Indicador visual de selección (anillo punteado verde alrededor del bbox aprox).
function SelectionIndicator({ shape, scale }: { shape: PuzzleShape; scale: ScaleInfo }) {
  // Calculamos un bbox aproximado en px y dibujamos un rect punteado.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const expand = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  switch (shape.type) {
    case 'circle':
      expand(shape.x - shape.radius, shape.y - shape.radius);
      expand(shape.x + shape.radius, shape.y + shape.radius);
      break;
    case 'rect':
    case 'text':
    case 'speechbubble':
      expand(shape.x, shape.y);
      if (shape.type === 'rect') expand(shape.x + shape.width, shape.y + shape.height);
      else expand(shape.x + 1, shape.y + 0.5);
      break;
    case 'arrow':
      expand(shape.startPoint.x, shape.startPoint.y);
      expand(shape.endPoint.x, shape.endPoint.y);
      if (shape.controlPoint) expand(shape.controlPoint.x, shape.controlPoint.y);
      break;
    case 'line':
    case 'triangle':
      for (let i = 0; i < shape.points.length; i += 2) {
        expand(shape.points[i], shape.points[i + 1]);
      }
      break;
  }
  const pad = 0.2;
  const x = m2px(minX - pad, scale);
  const y = m2px(minY - pad, scale);
  const w = m2px(maxX + pad - (minX - pad), scale);
  const h = m2px(maxY + pad - (minY - pad), scale);
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      stroke="#10b981"
      strokeWidth={2}
      dash={[6, 4]}
      fill="rgba(16,185,129,0.05)"
      listening={false}
    />
  );
}
