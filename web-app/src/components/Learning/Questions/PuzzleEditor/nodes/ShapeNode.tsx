// Render Konva de los presets visuales v2.
// Animaciones: marching dashes (dashOffset) + halo pulse (escala).
// Puntas de flecha: base perpendicular al final de la línea, no superpuestas.

import { useEffect, useState } from 'react';
import { Circle, Group, Line, Path, Rect, Text } from 'react-konva';
import { m2px, type ScaleInfo } from '../lib/coords';
import { PRESETS, resolvePreset, type PresetVisual } from '../lib/shapePresets';
import type { PuzzleShape } from '../../../../../types/learningContent';

interface Props {
  shape: PuzzleShape;
  scale: ScaleInfo;
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

function TrajectoryRender({ shape, visual, scale }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
}) {
  const sx = m2px(shape.startPoint.x, scale);
  const sy = m2px(shape.startPoint.y, scale);
  const ex = m2px(shape.endPoint.x, scale);
  const ey = m2px(shape.endPoint.y, scale);
  const cp = shape.controlPoint
    ? { x: m2px(shape.controlPoint.x, scale), y: m2px(shape.controlPoint.y, scale) }
    : null;
  const tangentX = cp ? ex - cp.x : ex - sx;
  const tangentY = cp ? ey - cp.y : ey - sy;
  const headLenPx = m2px(0.5, scale);
  const halfBasePx = m2px(0.22, scale);
  const head = arrowHead(ex, ey, tangentX, tangentY, headLenPx, halfBasePx);
  const endX = head?.cutX ?? ex;
  const endY = head?.cutY ?? ey;
  const pathData = cp
    ? `M ${sx} ${sy} Q ${cp.x} ${cp.y} ${endX} ${endY}`
    : `M ${sx} ${sy} L ${endX} ${endY}`;
  const strokeWidth = m2px(visual.strokeWidthM ?? 0.12, scale);
  const dash = visual.dashArray?.map((v) => m2px(v, scale));
  const dashOffset = useMarching(!!visual.marching, 1200, 1, scale);

  return (
    <Group listening={false}>
      {/* Línea con marching dashes */}
      <Path
        data={pathData}
        stroke={visual.stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        dashOffset={dashOffset}
        lineCap="round"
      />

      {/* Punta perpendicular */}
      {head && (
        <Line
          points={[head.tipX, head.tipY, head.b1x, head.b1y, head.b2x, head.b2y]}
          closed
          fill={visual.stroke}
        />
      )}
    </Group>
  );
}

function MovementRender({ shape, visual, scale }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  scale: ScaleInfo;
}) {
  const sx = m2px(shape.startPoint.x, scale);
  const sy = m2px(shape.startPoint.y, scale);
  const ex = m2px(shape.endPoint.x, scale);
  const ey = m2px(shape.endPoint.y, scale);
  const tangentX = ex - sx;
  const tangentY = ey - sy;
  const headLenPx = m2px(0.45, scale);
  const halfBasePx = m2px(0.18, scale);
  const head = arrowHead(ex, ey, tangentX, tangentY, headLenPx, halfBasePx);
  const endX = head?.cutX ?? ex;
  const endY = head?.cutY ?? ey;
  const strokeWidth = m2px(visual.strokeWidthM ?? 0.12, scale);
  const dash = visual.dashArray?.map((v) => m2px(v, scale));
  const dashOffset = useMarching(!!visual.marching, 2400, 1, scale);

  return (
    <Group listening={false}>
      <Line
        points={[sx, sy, endX, endY]}
        stroke={visual.stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        dashOffset={dashOffset}
        lineCap="round"
      />
      {head && (
        <Line
          points={[head.tipX, head.tipY, head.b1x, head.b1y, head.b2x, head.b2y]}
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
    <Group listening={false}>
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
    <Group listening={false} clipFunc={(ctx) => {
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
    <Group listening={false}>
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

// ───── Dispatch ─────

export function ShapeNode({ shape, scale }: Props) {
  const preset = resolvePreset(shape);
  const visual = PRESETS[preset];

  switch (shape.type) {
    case 'arrow':
      return preset === 'movement'
        ? <MovementRender shape={shape} visual={visual} scale={scale} />
        : <TrajectoryRender shape={shape} visual={visual} scale={scale} />;
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
    default: {
      const _: never = shape;
      void _;
      return null;
    }
  }
}
