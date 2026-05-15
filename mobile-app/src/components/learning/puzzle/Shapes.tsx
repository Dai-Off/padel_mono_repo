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
};

const mx = (m: number) => m + courtConfig.outerMargin;
const my = (m: number) => m + courtConfig.outerMargin;

function shouldRender(shape: PuzzleShape, state: PuzzleStateKey): boolean {
  if (shape.visible_only_after_confirmation && state !== 'confirmed') return false;
  return true;
}

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

function TrajectoryShape({ shape, visual, progress }: {
  shape: Extract<PuzzleShape, { type: 'arrow' }>;
  visual: PresetVisual;
  progress: number;
}) {
  const sx = mx(shape.startPoint.x);
  const sy = my(shape.startPoint.y);
  const ex = mx(shape.endPoint.x);
  const ey = my(shape.endPoint.y);
  const cp = shape.controlPoint
    ? { x: mx(shape.controlPoint.x), y: my(shape.controlPoint.y) }
    : null;

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

function MovementShape({ shape, visual }: { shape: Extract<PuzzleShape, { type: 'arrow' }>; visual: PresetVisual }) {
  const sx = mx(shape.startPoint.x);
  const sy = my(shape.startPoint.y);
  const ex = mx(shape.endPoint.x);
  const ey = my(shape.endPoint.y);
  const tangentX = ex - sx;
  const tangentY = ey - sy;
  const headLen = 0.45;
  const halfBase = 0.18;
  const head = arrowHead(ex, ey, tangentX, tangentY, headLen, halfBase);
  const endX = head?.cutX ?? ex;
  const endY = head?.cutY ?? ey;

  const dashOffset = useMarchingOffset(!!visual.marching, 2400, 1);

  return (
    <>
      <Path
        d={`M ${sx} ${sy} L ${endX} ${endY}`}
        stroke={visual.stroke}
        strokeWidth={visual.strokeWidthM}
        strokeDasharray={visual.dashArray}
        strokeDashoffset={dashOffset}
        fill="none"
        strokeLinecap="round"
      />
      {head && (
        <Polygon
          points={`${head.tipX},${head.tipY} ${head.b1x},${head.b1y} ${head.b2x},${head.b2y}`}
          fill={visual.stroke}
        />
      )}
    </>
  );
}

function HighlightShape({ shape, visual }: { shape: Extract<PuzzleShape, { type: 'circle' }>; visual: PresetVisual }) {
  const cx = mx(shape.x);
  const cy = my(shape.y);
  const r = shape.radius;
  const halo = useHaloPulse(true);
  const baseR = r * 1.2;
  const animR = baseR * halo.scale;

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={animR}
      fill={visual.stroke}
      opacity={halo.opacity}
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

function ShapeView({ shape, trajectoryProgress }: { shape: PuzzleShape; trajectoryProgress: number }) {
  const preset = resolvePreset(shape);
  const visual = PRESETS[preset];

  if (shape.type === 'arrow') {
    if (preset === 'movement') return <MovementShape shape={shape} visual={visual} />;
    return <TrajectoryShape shape={shape} visual={visual} progress={trajectoryProgress} />;
  }
  if (shape.type === 'circle') {
    return <HighlightShape shape={shape} visual={visual} />;
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
  // text → se renderiza fuera del SVG (overlay RN Text)
  return null;
}

// ─── Componente principal ─────────────────────────────────────────────────

export function Shapes({ frame, state, widthPx, heightPx, transitionKey, transitionDurationMs }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const shapes = (frame.shapes ?? []).filter((s) => shouldRender(s, state));

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
      shapes.filter((s): s is Extract<PuzzleShape, { type: 'text' }> => s.type === 'text'),
    [shapes],
  );

  if (shapes.length === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { width: widthPx, height: heightPx, opacity }]}
    >
      <Svg width={widthPx} height={heightPx} viewBox={`0 0 ${OUTER_W} ${OUTER_H}`}>
        {shapes.map((s) => (
          <ShapeView key={s.id} shape={s} trajectoryProgress={trajectoryProgress} />
        ))}
      </Svg>

      {/* Overlay de textos en RN nativo: pills (measure/tactical). */}
      {textShapes.map((s) => {
        const preset = resolvePreset(s);
        const visual = PRESETS[preset];
        const isTactical = preset === 'tactical';
        const text = isTactical ? s.text.toUpperCase() : s.text;

        // Tamaño base del texto en metros, escalado al Stage.
        const sizeM = Math.max(0.5, (s.fontSize ?? 14) * 0.045);
        const pxPerMeterX = widthPx / OUTER_W;
        const fontSizePx = sizeM * pxPerMeterX;
        // Posición del centro del pill.
        const cxPx = ((s.x + courtConfig.outerMargin) / OUTER_W) * widthPx;
        const cyPx = ((s.y + courtConfig.outerMargin) / OUTER_H) * heightPx;
        // Ancho aproximado (chars × ancho medio).
        const approxTextWidth = text.length * fontSizePx * 0.62;
        const padX = fontSizePx * 0.6;
        const padY = fontSizePx * 0.35;
        const pillW = approxTextWidth + padX * 2;
        const pillH = fontSizePx + padY * 2;

        return (
          <View
            key={s.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cxPx - pillW / 2,
              top: cyPx - pillH / 2,
              width: pillW,
              height: pillH,
              borderRadius: pillH / 2,
              backgroundColor: visual.fill ?? '#fff',
              borderWidth: isTactical ? 0 : 0.5,
              borderColor: 'rgba(0,0,0,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: isTactical ? '#ffffff' : '#0f172a',
                fontSize: fontSizePx,
                fontWeight: '800',
                includeFontPadding: false,
                letterSpacing: isTactical ? 0.5 : 0,
              }}
            >
              {text}
            </Text>
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
