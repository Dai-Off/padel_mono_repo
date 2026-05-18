// Capa de shapes sobre la pista. Aplica presets visuales v2 (trajectory,
// movement, highlight, good_zone, bad_zone, neutral_zone, measure, tactical).
//
// Sistema de coordenadas: metros del modelo (0..10 X, 0..20 Y) traducidos al
// espacio del Stage via courtConfig (margen externo incluido).
//
// Animaciones (Animated.Value):
//   - marching dashes  → strokeDashoffset 0 → -1m loop, 2s (trayectoria 1.2s)
//   - halo pulse       → scale 1 ↔ 1.18 + opacity 0.55 ↔ 0.2 loop, 1.6s
// El glow es fake: path duplicado debajo con stroke más ancho y opacidad baja.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Path,
  Polygon,
  Polyline,
  Rect,
} from 'react-native-svg';
import { OUTER_H, OUTER_W, courtConfig } from './lib/courtConfig';
import { PRESETS, resolvePreset, type PresetVisual } from './lib/shapePresets';
import { generateAutoShapes } from './lib/autoTrajectory';
import type { PuzzleFrame, PuzzleShape } from '../../../types/puzzle';

type PuzzleStateKey = 'init' | 'select' | 'confirmed';

type Props = {
  frame: PuzzleFrame;
  state: PuzzleStateKey;
  widthPx: number;
  heightPx: number;
  // Clave de la transición: cuando cambia, las shapes con `style: trajectory`
  // se dibujan progresivamente al ritmo de `transitionDurationMs`, sincronizadas
  // con la pelota. Las shapes que no son trajectory mantienen su fade-in normal.
  transitionKey?: string;
  transitionDurationMs?: number;
  // Frame anterior (initial cuando state=select; select cuando state=confirmed).
  // Si está definido y `frame.auto_trajectory !== false`, se generan trajectory
  // + highlights automáticamente desde la pelota del previo a la actual.
  prevFrame?: PuzzleFrame | null;
};

const mx = (m: number) => m + courtConfig.outerMargin;
const my = (m: number) => m + courtConfig.outerMargin;

// Calcula los 3 puntos de la punta de flecha (triángulo isósceles) tal que:
//   - la punta del triángulo está en (tipX, tipY)
//   - la base es PERPENDICULAR al vector (dx, dy) (que define la dirección de la flecha)
//   - el centro de la base está a distancia `headLen` de la punta
// Devuelve también el "punto de corte" donde la línea debe terminar (centro de la base).
function arrowHead(tipX: number, tipY: number, dx: number, dy: number, headLen: number, halfBase: number) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Centro de la base: la punta menos un vector hacia atrás de longitud headLen.
  const cutX = tipX - ux * headLen;
  const cutY = tipY - uy * headLen;
  // Perpendicular unitaria.
  const px = -uy;
  const py = ux;
  const b1x = cutX + px * halfBase;
  const b1y = cutY + py * halfBase;
  const b2x = cutX - px * halfBase;
  const b2y = cutY - py * halfBase;
  return { tipX, tipY, b1x, b1y, b2x, b2y, cutX, cutY };
}

// Hook para marching dashes con requestAnimationFrame.
// Devuelve un número plano (no Animated.Value) para no enviar AnimatedNodes al
// bridge de react-native-svg, que en Android puede crashear.
function useMarchingOffset(enabled: boolean, durationMs: number, distanceM: number) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = ((Date.now() - start) % durationMs) / durationMs;
      setOffset(-t * distanceM);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, durationMs, distanceM]);
  return offset;
}

// Hook que devuelve un progress 0..1 que arranca cuando cambia `key` y dura
// `durationMs`. Si `key` es undefined, devuelve 1 (efecto completo, sin animar).
// El easing es smooth-step (matching aproximado del inOut(cubic) que usa la pelota).
function useTransitionProgress(key: string | undefined, durationMs: number) {
  const [p, setP] = useState(1);
  useEffect(() => {
    if (key === undefined) return;
    let raf = 0;
    const start = Date.now();
    setP(0);
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / Math.max(50, durationMs));
      // Easing aproximado al inOut(cubic) que usa Animated.timing para la pelota.
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setP(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, durationMs]);
  return p;
}

// Aproxima la longitud de un path Bézier cuadrático (o línea recta) usando muestreo.
function approxPathLength(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null): number {
  if (!cp) return Math.hypot(ex - sx, ey - sy);
  let len = 0;
  let prevX = sx;
  let prevY = sy;
  const samples = 20;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    const x = u * u * sx + 2 * u * t * cp.x + t * t * ex;
    const y = u * u * sy + 2 * u * t * cp.y + t * t * ey;
    len += Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return len;
}

// Aproxima la longitud arc del path desde t=0 hasta t=target.
// Para Bézier la relación entre parámetro t y longitud arc NO es lineal, así
// que necesitamos esta función para sincronizar correctamente la máscara con
// la posición de la punta de flecha.
function lengthAtT(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, target: number): number {
  if (target <= 0) return 0;
  if (!cp) return Math.hypot(ex - sx, ey - sy) * Math.min(1, target);
  const t1 = Math.min(1, target);
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

// Búsqueda binaria: dado un targetLen de longitud arc, devuelve el t ∈ [0,1]
// tal que lengthAtT(t) ≈ targetLen. Sirve para posicionar la punta de flecha
// donde acaba la línea revelada cuando esa línea se extiende un cap extra.
function tAtLength(sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, targetLen: number): number {
  if (targetLen <= 0) return 0;
  const totalLen = approxPathLength(sx, sy, ex, ey, cp);
  if (targetLen >= totalLen) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const len = lengthAtT(sx, sy, ex, ey, cp, mid);
    if (len < targetLen) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Devuelve el punto (x, y) y la tangente (dx, dy) en parámetro t ∈ [0, 1] de
// la curva (Bézier cuadrática si hay control point, recta si no).
function pointAndTangentOnPath(
  sx: number, sy: number, ex: number, ey: number, cp: { x: number; y: number } | null, t: number,
) {
  if (!cp) {
    return {
      x: sx + (ex - sx) * t,
      y: sy + (ey - sy) * t,
      dx: ex - sx,
      dy: ey - sy,
    };
  }
  const u = 1 - t;
  const x = u * u * sx + 2 * u * t * cp.x + t * t * ex;
  const y = u * u * sy + 2 * u * t * cp.y + t * t * ey;
  // Derivada: P'(t) = 2(1-t)(P1-P0) + 2t(P2-P1).
  const dx = 2 * u * (cp.x - sx) + 2 * t * (ex - cp.x);
  const dy = 2 * u * (cp.y - sy) + 2 * t * (ey - cp.y);
  return { x, y, dx, dy };
}

// Hook para halo pulsante: devuelve { scale, opacity } como números planos.
function useHaloPulse(enabled: boolean) {
  const [s, setS] = useState({ scale: 1, opacity: 0.3 });
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = Date.now();
    const period = 1600;
    const tick = () => {
      const t = ((Date.now() - start) % period) / period;
      // Sinusoidal entre 0 y 1.
      const eased = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);
      const scale = 1 + 0.18 * eased;
      const opacity = 0.35 - 0.2 * eased;
      setS({ scale, opacity });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return s;
}

// ─── Renderers por preset ──────────────────────────────────────────────────

function TrajectoryShape({ shape, visual, progress, ballShotType }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  progress: number;
  ballShotType?: 'lob' | 'chiquita';
}) {
  const sx = mx(shape.startPoint.x);
  const sy = my(shape.startPoint.y);
  const ex = mx(shape.endPoint.x);
  const ey = my(shape.endPoint.y);
  // El controlPoint se calcula UNA sola vez por combinación de endpoints +
  // shot_type. Sin useMemo, cada re-render del marching/progress evalúa otra
  // vez la lógica de border-avoidance y, con redondeos, puede acabar eligiendo
  // el lado opuesto a mitad de animación.
  const explicitCp = shape.controlPoint;
  const cp = useMemo<{ x: number; y: number } | null>(() => {
    if (explicitCp) {
      return { x: mx(explicitCp.x), y: my(explicitCp.y) };
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
    const minX = courtConfig.outerMargin;
    const maxX = OUTER_W - courtConfig.outerMargin;
    const minY = courtConfig.outerMargin;
    const maxY = OUTER_H - courtConfig.outerMargin;
    const distToBorder = (p: { x: number; y: number }) =>
      Math.min(p.x - minX, maxX - p.x, p.y - minY, maxY - p.y);
    return distToBorder(candA) >= distToBorder(candB) ? candA : candB;
  }, [sx, sy, ex, ey, explicitCp?.x, explicitCp?.y, ballShotType]);

  const headLen = 0.5;
  const halfBase = 0.22;

  // Path acortado.
  const tangentEndX = cp ? ex - cp.x : ex - sx;
  const tangentEndY = cp ? ey - cp.y : ey - sy;
  const finalHead = arrowHead(ex, ey, tangentEndX, tangentEndY, headLen, halfBase);
  const endX = finalHead?.cutX ?? ex;
  const endY = finalHead?.cutY ?? ey;
  const lineLength = approxPathLength(sx, sy, endX, endY, cp);

  // Patrón de dashes del preset (en metros).
  const dashArr = visual.dashArray ?? [0.3, 0.2];
  const dashSize = dashArr[0];
  const gapSize = dashArr[1] ?? 0.2;
  const cycle = dashSize + gapSize;

  // Longitud arc revelada en este frame.
  const visibleLen = lengthAtT(sx, sy, endX, endY, cp, progress);

  // Marching offset (lo usamos en metros, 0..cycle, continuo).
  // useMarchingOffset devuelve un valor que va de 0 a -1 ciclo en 1.2s.
  // Convertimos a un offset en metros que se desplaza una cycle por loop.
  const rawMarchOffset = useMarchingOffset(!!visual.marching, 1200, cycle);
  // Lo queremos positivo y módulo cycle.
  const marchOffset = ((-rawMarchOffset) % cycle + cycle) % cycle;

  // Punta dinámica: TIP `headLen` adelante del punto del path en t=progress.
  // La base coincide exactamente con visibleLen (final de la línea revelada).
  let dynamicHead = finalHead;
  const isDrawing = progress < 1;
  if (isDrawing) {
    const pt = pointAndTangentOnPath(sx, sy, endX, endY, cp, progress);
    const tlen = Math.hypot(pt.dx, pt.dy) || 1;
    const ux = pt.dx / tlen;
    const uy = pt.dy / tlen;
    dynamicHead = arrowHead(pt.x + ux * headLen, pt.y + uy * headLen, pt.dx, pt.dy, headLen, halfBase);
  }

  // ───── Enumerar dashes a renderizar ─────
  // Los dashes empiezan en posiciones: marchOffset - cycle, marchOffset, marchOffset + cycle, ...
  // Cada dash ocupa [start, start + dashSize].
  // La línea termina justo donde empieza la base de la punta de flecha. Como
  // los dashes usan strokeLinecap="round", el linecap redondo añade `sw/2` al
  // extremo visualmente: ajustamos `dashesEnd = visibleLen - sw/2` para que el
  // extremo redondo del último dash quede pegado a la base SIN sobrepasarla.
  const dashes: { polyPoints: number[] }[] = [];
  const swHalf = (visual.strokeWidthM ?? 0.18) / 2;
  const dashesEnd = Math.max(0, visibleLen - swHalf);
  const startIdx = Math.floor(-marchOffset / cycle) - 1;
  const endIdx = Math.ceil((dashesEnd - marchOffset) / cycle) + 1;
  const samplesPerDash = cp ? 4 : 2;
  // Permitimos dashes parciales muy pequeños (5mm mínimo) para que el dash
  // "en crecimiento" en el extremo de la línea revelada nazca desde casi cero
  // y se alargue suavemente, sin pop. Al inicio del crecimiento se verá como
  // un punto redondo (linecaps superpuestos) que se va alargando.
  const minDashLen = 0.005;

  for (let i = startIdx; i <= endIdx; i++) {
    const startArc = marchOffset + i * cycle;
    const endArc = startArc + dashSize;
    // Recortar al rango [0, dashesEnd]
    const a = Math.max(0, startArc);
    const b = Math.min(dashesEnd, endArc);
    if (b - a < minDashLen) continue;

    // Convertir longitudes arc a parámetros t.
    const tA = tAtLength(sx, sy, endX, endY, cp, a);
    const tB = tAtLength(sx, sy, endX, endY, cp, b);

    // Muestrear puntos a lo largo del dash.
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
    dashes.push({ polyPoints: pts });
  }

  return (
    <>
      {/* Cada dash es una Polyline independiente — no se cortan unas a otras
          y se renderizan completos o parciales según el progreso de la línea
          revelada. Marching se logra desplazando todas las posiciones via
          marchOffset cada frame. */}
      {dashes.map((d, i) => (
        <Polyline
          key={i}
          points={d.polyPoints.join(' ')}
          stroke={visual.stroke}
          strokeWidth={visual.strokeWidthM}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Punta de flecha sólida, base coincide con el final de la línea revelada. */}
      {dynamicHead && (
        <Polygon
          points={`${dynamicHead.tipX},${dynamicHead.tipY} ${dynamicHead.b1x},${dynamicHead.b1y} ${dynamicHead.b2x},${dynamicHead.b2y}`}
          fill={visual.stroke}
        />
      )}
    </>
  );
}

function MovementShape({ shape, visual, progress }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  progress: number;
}) {
  // Mismo algoritmo de dashes individuales que TrajectoryShape pero sin cp.
  const sx = mx(shape.startPoint.x);
  const sy = my(shape.startPoint.y);
  const ex = mx(shape.endPoint.x);
  const ey = my(shape.endPoint.y);
  const headLen = 0.45;
  const halfBase = 0.18;
  const tangentEndX = ex - sx;
  const tangentEndY = ey - sy;
  const finalHead = arrowHead(ex, ey, tangentEndX, tangentEndY, headLen, halfBase);
  const endX = finalHead?.cutX ?? ex;
  const endY = finalHead?.cutY ?? ey;
  const lineLength = approxPathLength(sx, sy, endX, endY, null);

  const dashArr = visual.dashArray ?? [0.2, 0.18];
  const dashSize = dashArr[0];
  const gapSize = dashArr[1] ?? 0.18;
  const cycle = dashSize + gapSize;
  const visibleLen = lengthAtT(sx, sy, endX, endY, null, progress);
  const rawMarch = useMarchingOffset(!!visual.marching, 2400, cycle);
  const marchOffset = ((-rawMarch) % cycle + cycle) % cycle;

  let dynamicHead = finalHead;
  const isDrawing = progress < 1;
  if (isDrawing) {
    const pt = pointAndTangentOnPath(sx, sy, endX, endY, null, progress);
    const tlen = Math.hypot(pt.dx, pt.dy) || 1;
    const ux = pt.dx / tlen;
    const uy = pt.dy / tlen;
    dynamicHead = arrowHead(pt.x + ux * headLen, pt.y + uy * headLen, pt.dx, pt.dy, headLen, halfBase);
  }

  void lineLength;
  const swHalf = (visual.strokeWidthM ?? 0.12) / 2;
  const dashesEnd = Math.max(0, visibleLen - swHalf);
  const dashes: { polyPoints: number[] }[] = [];
  const startIdx = Math.floor(-marchOffset / cycle) - 1;
  const endIdx = Math.ceil((dashesEnd - marchOffset) / cycle) + 1;
  const minDashLen = 0.005;
  for (let i = startIdx; i <= endIdx; i++) {
    const startArc = marchOffset + i * cycle;
    const endArc = startArc + dashSize;
    const a = Math.max(0, startArc);
    const b = Math.min(dashesEnd, endArc);
    if (b - a < minDashLen) continue;
    const tA = a / lineLength;
    const tB = b / lineLength;
    dashes.push({
      polyPoints: [
        sx + (endX - sx) * tA, sy + (endY - sy) * tA,
        sx + (endX - sx) * tB, sy + (endY - sy) * tB,
      ],
    });
  }

  return (
    <>
      {dashes.map((d, i) => (
        <Polyline
          key={i}
          points={d.polyPoints.join(' ')}
          stroke={visual.stroke}
          strokeWidth={visual.strokeWidthM}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {dynamicHead && (
        <Polygon
          points={`${dynamicHead.tipX},${dynamicHead.tipY} ${dynamicHead.b1x},${dynamicHead.b1y} ${dynamicHead.b2x},${dynamicHead.b2y}`}
          fill={visual.stroke}
        />
      )}
    </>
  );
}

function HighlightShape({
  shape,
  visual,
  progress,
  appearOnArrival,
}: {
  shape: Extract<PuzzleShape, { type: 'circle' }>;
  visual: PresetVisual;
  progress: number;
  // Si true, el highlight permanece invisible hasta que la pelota está
  // llegando (progress ≥ 0.85) y entonces hace fade-in suave.
  appearOnArrival?: boolean;
}) {
  const cx = mx(shape.x);
  const cy = my(shape.y);
  const r = shape.radius;
  const halo = useHaloPulse(true);
  const baseR = r * 1.2;
  const animR = baseR * halo.scale;

  let appearOpacity = 1;
  if (appearOnArrival) {
    // 0 hasta 0.85; sube linealmente hasta 1 en 1.0.
    appearOpacity = progress < 0.85 ? 0 : Math.min(1, (progress - 0.85) / 0.15);
  }

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={animR}
      fill={visual.stroke}
      opacity={halo.opacity * appearOpacity}
    />
  );
}

function ZoneRectShape({ shape, visual, withHatch }: {
  shape: Extract<PuzzleShape, { type: 'rect' }>;
  visual: PresetVisual;
  withHatch?: boolean;
}) {
  const x = mx(shape.x);
  const y = my(shape.y);
  const cornerR = 0.15;
  const hatchId = `hatch-${shape.id}`;

  // Diagonales del hatch dibujadas explícitamente (no usamos Pattern para evitar
  // problemas de bridge en RN-SVG con patternTransform).
  const hatchLines: { p: string }[] = [];
  if (withHatch) {
    const spacing = 0.3;
    const diag = Math.hypot(shape.width, shape.height);
    const num = Math.ceil(diag / spacing) + 2;
    for (let i = -num; i < num; i++) {
      const dx = i * spacing;
      hatchLines.push({ p: `M ${x + dx} ${y} L ${x + dx + shape.height} ${y + shape.height}` });
    }
  }

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={shape.width}
        height={shape.height}
        rx={cornerR}
        fill={visual.fill}
        fillOpacity={visual.fillOpacity}
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidthM}
      />
      {withHatch && hatchLines.map((h, i) => (
        <Path
          key={hatchId + i}
          d={h.p}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={0.04}
          // ClipPath sería ideal pero requiere ID único + soporte fiable en Android.
          // Como las hatch lines son cortas, el overflow visual es mínimo.
        />
      ))}
    </>
  );
}

function ZoneTriangleShape({ shape, visual }: {
  shape: Extract<PuzzleShape, { type: 'triangle' }>;
  visual: PresetVisual;
  withHatch?: boolean;  // ignorado en mobile por simplicidad (raro en datos)
}) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 2) {
    pts.push(`${mx(shape.points[i])},${my(shape.points[i + 1])}`);
  }
  return (
    <Polygon
      points={pts.join(' ')}
      fill={visual.fill}
      fillOpacity={visual.fillOpacity}
      stroke={visual.stroke}
      strokeWidth={visual.strokeWidthM}
    />
  );
}

function LineShape({ shape, visual }: { shape: Extract<PuzzleShape, { type: 'line' }>; visual: PresetVisual }) {
  const pts: string[] = [];
  for (let i = 0; i < shape.points.length - 1; i += 2) {
    pts.push(`${mx(shape.points[i])},${my(shape.points[i + 1])}`);
  }
  return (
    <Polyline
      points={pts.join(' ')}
      stroke={visual.stroke}
      strokeWidth={shape.strokeWidth ?? visual.strokeWidthM}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ─── ShapeView (dispatch por tipo + preset) ────────────────────────────────

function ShapeView({
  shape,
  trajectoryProgress,
  ballShotType,
  appearOnArrival,
}: {
  shape: PuzzleShape;
  trajectoryProgress: number;
  ballShotType?: 'lob' | 'chiquita';
  appearOnArrival?: boolean;
}) {
  const preset = resolvePreset(shape);
  const visual = PRESETS[preset];

  if (shape.type === 'arrow') {
    if (preset === 'movement') return <MovementShape shape={shape} visual={visual} progress={trajectoryProgress} />;
    return <TrajectoryShape shape={shape} visual={visual} progress={trajectoryProgress} ballShotType={ballShotType} />;
  }
  if (shape.type === 'circle') {
    return (
      <HighlightShape
        shape={shape}
        visual={visual}
        progress={trajectoryProgress}
        appearOnArrival={appearOnArrival}
      />
    );
  }
  if (shape.type === 'rect') {
    return <ZoneRectShape shape={shape} visual={visual} withHatch={preset === 'bad_zone'} />;
  }
  if (shape.type === 'triangle') {
    return <ZoneTriangleShape shape={shape} visual={visual} withHatch={preset === 'bad_zone'} />;
  }
  if (shape.type === 'line') {
    return <LineShape shape={shape} visual={visual} />;
  }
  // text + speechbubble → se renderizan fuera del SVG (overlay RN Text)
  return null;
}

// ─── Componente principal ─────────────────────────────────────────────────

export function Shapes({ frame, state, widthPx, heightPx, transitionKey, transitionDurationMs, prevFrame }: Props) {
  // El parámetro `state` se conserva en la firma para compatibilidad de los
  // callers pero ya no se usa para filtrar shapes — el sistema de frames split
  // garantiza que cada frame solo se renderiza en su estado correspondiente.
  void state;
  const opacity = useRef(new Animated.Value(0)).current;
  // Shapes auto (trayectoria + highlights) primero, luego las manuales encima.
  const autoShapes = useMemo(
    () => generateAutoShapes(prevFrame ?? null, frame),
    [prevFrame, frame],
  );
  const shapes = [...autoShapes, ...(frame.shapes ?? [])];

  // Progress 0..1 sincronizado con la duración del frame. Lo consumen las
  // shapes de tipo trayectoria para dibujarse detrás de la pelota.
  const trajectoryProgress = useTransitionProgress(transitionKey, transitionDurationMs ?? 1500);

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [shapes.map((s) => s.id).join('|'), opacity]);

  const textShapes = useMemo(
    () =>
      shapes.filter(
        (s): s is Extract<PuzzleShape, { type: 'text' | 'speechbubble' }> =>
          s.type === 'text' || s.type === 'speechbubble',
      ),
    [shapes],
  );

  if (shapes.length === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { width: widthPx, height: heightPx, opacity }]}
    >
      <Svg width={widthPx} height={heightPx} viewBox={`0 0 ${OUTER_W} ${OUTER_H}`}>
        {shapes.map((s) => {
          // El highlight auto de destino solo "aparece" cuando la pelota llega:
          // identificable por id y solo aplica si hay frame anterior (es decir,
          // hay transición con trajectoria). Si no hay prev, el highlight es
          // estático y visible desde el primer paint.
          const isAutoDestArrival = !!prevFrame && s.id === 'auto-dest';
          return (
            <ShapeView
              key={s.id}
              shape={s}
              trajectoryProgress={trajectoryProgress}
              ballShotType={frame.ball.shot_type === 'lob' || frame.ball.shot_type === 'chiquita' ? frame.ball.shot_type : undefined}
              appearOnArrival={isAutoDestArrival}
            />
          );
        })}
      </Svg>

      {/* Overlay de textos en RN nativo: pills (measure/tactical). */}
      {textShapes.map((s) => {
        const preset = resolvePreset(s);
        const visual = PRESETS[preset];
        const isTactical = preset === 'tactical';
        const isBubble = s.type === 'speechbubble';
        const text = isTactical ? s.text.toUpperCase() : s.text;

        const pxPerMeterX = widthPx / OUTER_W;

        // Cálculo de tamaño:
        //   - text (no bubble): ancho según número de chars, sin límite. 1 línea.
        //   - speechbubble: ancho fijo MAX. Si el texto excede, salto a 2 líneas.
        //     Si en 2 líneas aún excede, escalar fontSize hacia abajo.
        let fontSizePx: number;
        let pillW: number;
        let pillH: number;
        let numberOfLines = 1;
        const padX = isBubble ? 10 : 0;
        const padY = isBubble ? 6 : 0;

        if (isBubble) {
          // Ancho fijo: 35% del Stage horizontal, máximo 220px.
          const targetW = Math.min(220, widthPx * 0.35);
          // Tamaño base por fontSize del shape.
          const sizeM = Math.max(0.5, (s.fontSize ?? 14) * 0.045);
          let baseFontPx = sizeM * pxPerMeterX;
          // Ancho disponible para texto.
          const innerW = targetW - padX * 2;
          // Aprox chars que caben en una línea con baseFontPx.
          const charW = baseFontPx * 0.55;
          const charsPerLine = Math.max(1, Math.floor(innerW / charW));
          if (text.length <= charsPerLine) {
            numberOfLines = 1;
          } else if (text.length <= charsPerLine * 2) {
            numberOfLines = 2;
          } else {
            // No cabe en 2 líneas: reducir fontSize hasta que quepa.
            numberOfLines = 2;
            const needed = text.length / 2;
            const scaleDown = charsPerLine / needed;
            baseFontPx = Math.max(10, baseFontPx * scaleDown);
          }
          fontSizePx = baseFontPx;
          pillW = targetW;
          pillH = fontSizePx * numberOfLines * 1.2 + padY * 2;
        } else {
          // text (medida/tactica): igual que antes.
          const sizeM = Math.max(0.5, (s.fontSize ?? 14) * 0.045);
          fontSizePx = sizeM * pxPerMeterX;
          const approxTextWidth = text.length * fontSizePx * 0.62;
          const tPadX = fontSizePx * 0.6;
          const tPadY = fontSizePx * 0.35;
          pillW = approxTextWidth + tPadX * 2;
          pillH = fontSizePx + tPadY * 2;
        }

        const cxPx = ((s.x + courtConfig.outerMargin) / OUTER_W) * widthPx;
        const cyPx = ((s.y + courtConfig.outerMargin) / OUTER_H) * heightPx;

        // Speech bubble: fondo blanco, borde negro, rabo apuntando abajo.
        const bgColor = isBubble ? '#ffffff' : (visual.fill ?? '#fff');
        const txtColor = isBubble ? '#0f172a' : (isTactical ? '#ffffff' : '#0f172a');
        const borderWidth = isTactical && !isBubble ? 0 : 1;
        const borderColor = isBubble ? '#0f172a' : 'rgba(0,0,0,0.4)';
        const tailH = isBubble ? fontSizePx * 0.5 : 0;

        return (
          <View
            key={s.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cxPx - pillW / 2,
              top: cyPx - (pillH + tailH) / 2,
              width: pillW,
              height: pillH + tailH,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: pillW,
                height: pillH,
                borderRadius: isBubble ? fontSizePx * 0.45 : pillH / 2,
                backgroundColor: bgColor,
                borderWidth,
                borderColor,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                numberOfLines={isBubble ? numberOfLines : 1}
                style={{
                  color: txtColor,
                  fontSize: fontSizePx,
                  lineHeight: fontSizePx * 1.2,
                  fontWeight: '800',
                  includeFontPadding: false,
                  letterSpacing: isTactical ? 0.5 : 0,
                  textAlign: 'center',
                }}
              >
                {text}
              </Text>
            </View>
            {isBubble && (
              <View
                style={{
                  width: 0,
                  height: 0,
                  marginTop: -1,
                  borderLeftWidth: tailH * 0.55,
                  borderRightWidth: tailH * 0.55,
                  borderTopWidth: tailH,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderTopColor: '#0f172a',
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: -tailH - 1,
                    left: -tailH * 0.55 + 1,
                    width: 0,
                    height: 0,
                    borderLeftWidth: tailH * 0.55 - 1,
                    borderRightWidth: tailH * 0.55 - 1,
                    borderTopWidth: tailH - 1,
                    borderLeftColor: 'transparent',
                    borderRightColor: 'transparent',
                    borderTopColor: '#ffffff',
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});

export type { PuzzleStateKey };
