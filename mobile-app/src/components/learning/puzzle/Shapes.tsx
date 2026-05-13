// Capa de shapes sobre la pista. Renderiza los 6 tipos (circle/arrow/rect/line/text/triangle)
// del catálogo de puzzles, en SVG cubriendo el Stage entero. Filtra las shapes con
// `visible_only_after_confirmation` en los estados init y select.
//
// Sistema de coordenadas: metros del modelo (0..10 en X, 0..20 en Y) traducidos
// al espacio del Stage via courtConfig (margen externo incluido).

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Path,
  Polygon,
  Polyline,
  Rect,
} from 'react-native-svg';
import { OUTER_H, OUTER_W, courtConfig } from './lib/courtConfig';
import type { PuzzleFrame, PuzzleShape } from '../../../types/puzzle';

type PuzzleStateKey = 'init' | 'select' | 'confirmed';

type Props = {
  frame: PuzzleFrame;
  state: PuzzleStateKey;
  widthPx: number;
  heightPx: number;
};

// Convierte coords del modelo (interior, 0..10 / 0..20) a coords del Stage (con margen).
const mx = (m: number) => m + courtConfig.outerMargin;
const my = (m: number) => m + courtConfig.outerMargin;

function shouldRender(shape: PuzzleShape, state: PuzzleStateKey): boolean {
  if (shape.visible_only_after_confirmation && state !== 'confirmed') return false;
  return true;
}

function ShapeView({ shape }: { shape: PuzzleShape }) {
  const stroke = shape.color ?? '#ffcf68';

  switch (shape.type) {
    case 'circle': {
      const dashArray = shape.dashed ? '0.3,0.2' : undefined;
      return (
        <Circle
          cx={mx(shape.x)}
          cy={my(shape.y)}
          r={shape.radius}
          stroke={stroke}
          strokeWidth={0.12}
          strokeDasharray={dashArray}
          fill="none"
        />
      );
    }

    case 'arrow': {
      const s = shape.startPoint;
      const e = shape.endPoint;
      const c = shape.controlPoint;
      const sx = mx(s.x);
      const sy = my(s.y);
      const ex = mx(e.x);
      const ey = my(e.y);

      const d = c
        ? `M ${sx} ${sy} Q ${mx(c.x)} ${my(c.y)} ${ex} ${ey}`
        : `M ${sx} ${sy} L ${ex} ${ey}`;
      const dashArray = shape.dashed ? '0.3,0.2' : undefined;

      // Ángulo de la cabeza al final: derivada en t=1.
      const endTangentX = c ? ex - mx(c.x) : ex - sx;
      const endTangentY = c ? ey - my(c.y) : ey - sy;
      const endHead = arrowHead(ex, ey, endTangentX, endTangentY, stroke);

      // Cabeza inicial si pointerAtBeginning.
      const startTangentX = c ? sx - mx(c.x) : sx - ex;
      const startTangentY = c ? sy - my(c.y) : sy - ey;
      const startHead = shape.pointerAtBeginning
        ? arrowHead(sx, sy, startTangentX, startTangentY, stroke)
        : null;

      return (
        <G>
          <Path d={d} stroke={stroke} strokeWidth={0.12} strokeDasharray={dashArray} fill="none" />
          {endHead}
          {startHead}
          {/* tagText pendiente: requiere capa de texto RN nativo (no SvgText). */}
        </G>
      );
    }

    case 'rect': {
      return (
        <Rect
          x={mx(shape.x)}
          y={my(shape.y)}
          width={shape.width}
          height={shape.height}
          fill={shape.fillColor ?? 'none'}
          fillOpacity={shape.fillOpacity ?? 1}
          stroke={stroke}
          strokeWidth={0.12}
        />
      );
    }

    case 'line': {
      // points como flat array [x1,y1,x2,y2,...] → "x1,y1 x2,y2".
      const pts: string[] = [];
      for (let i = 0; i < shape.points.length - 1; i += 2) {
        pts.push(`${mx(shape.points[i])},${my(shape.points[i + 1])}`);
      }
      return (
        <Polyline
          points={pts.join(' ')}
          stroke={stroke}
          strokeWidth={shape.strokeWidth ?? 0.12}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    case 'text': {
      // Los shapes de tipo `text` no se renderizan en SVG porque react-native-svg
      // posiciona mal los glyphs cuando el viewBox usa unidades pequeñas (metros).
      // Se renderizan como <Text> de RN en una capa absoluta encima del SVG (ver
      // TextShapesOverlay más abajo).
      return null;
    }

    case 'triangle': {
      // points: [x1,y1,x2,y2,x3,y3]
      const pts: string[] = [];
      for (let i = 0; i < 6; i += 2) {
        pts.push(`${mx(shape.points[i])},${my(shape.points[i + 1])}`);
      }
      return (
        <Polygon
          points={pts.join(' ')}
          fill={shape.fillColor ?? 'none'}
          fillOpacity={shape.fillOpacity ?? 1}
          stroke={stroke}
          strokeWidth={0.12}
        />
      );
    }

    default:
      return null;
  }
}

// Cabeza de flecha como triángulo isósceles centrado en (x,y) y orientado por (dx,dy).
function arrowHead(x: number, y: number, dx: number, dy: number, color: string) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Tamaño de la cabeza ~0.5 m, base ~0.35 m.
  const headLen = 0.5;
  const halfBase = 0.18;
  // Punto base (detrás de la punta): x - ux*headLen, y - uy*headLen.
  const bx = x - ux * headLen;
  const by = y - uy * headLen;
  // Perpendicular para los dos extremos de la base.
  const px = -uy;
  const py = ux;
  const p1x = bx + px * halfBase;
  const p1y = by + py * halfBase;
  const p2x = bx - px * halfBase;
  const p2y = by - py * halfBase;
  return <Polygon points={`${x},${y} ${p1x},${p1y} ${p2x},${p2y}`} fill={color} />;
}


export function Shapes({ frame, state, widthPx, heightPx }: Props) {
  // Crossfade: cuando cambia el set de shapes (frame), la capa anterior se desvanece
  // y la nueva aparece con fade-in. Más simple que morph y robusto frente a cambios
  // de número de shapes.
  const opacity = useRef(new Animated.Value(0)).current;
  const shapes = (frame.shapes ?? []).filter((s) => shouldRender(s, state));

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    // Key del efecto: la lista de ids de shapes visibles para detectar cambios.
  }, [shapes.map((s) => s.id).join('|'), opacity]);

  if (shapes.length === 0) return null;

  // Separamos los shapes de tipo `text` para renderizarlos como <Text> de RN
  // (los glyphs de SvgText se solapan cuando el viewBox usa unidades pequeñas).
  const textShapes = shapes.filter((s): s is Extract<PuzzleShape, { type: 'text' }> =>
    s.type === 'text',
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { width: widthPx, height: heightPx, opacity }]}
    >
      <Svg width={widthPx} height={heightPx} viewBox={`0 0 ${OUTER_W} ${OUTER_H}`}>
        {shapes.map((s) => (
          <ShapeView key={s.id} shape={s} />
        ))}
      </Svg>

      {/* Overlay de textos en RN nativo, posicionados en píxeles. */}
      {textShapes.map((s) => {
        // El kit guarda fontSize en "px del stage original" (~14 px). La fórmula
        // del kit lo convierte a metros con factor 0.05 (mín 0.45m). Después
        // pasamos esos metros a píxeles del Stage actual.
        const sizeM = Math.max(0.45, (s.fontSize ?? 14) * 0.05);
        const pxPerMeterX = widthPx / OUTER_W;
        const fontSizePx = sizeM * pxPerMeterX;
        // Centro del texto en px.
        const cxPx = ((s.x + courtConfig.outerMargin) / OUTER_W) * widthPx;
        const cyPx = ((s.y + courtConfig.outerMargin) / OUTER_H) * heightPx;
        // Anchura aproximada del bloque (chars × ancho medio del glyph).
        const approxWidth = s.text.length * fontSizePx * 0.6;
        return (
          <View
            key={s.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cxPx - approxWidth / 2,
              top: cyPx - fontSizePx / 2,
              width: approxWidth,
              alignItems: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: s.color ?? '#ffcf68',
                fontSize: fontSizePx,
                fontWeight: 'bold',
                textShadowColor: '#000',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 2,
                includeFontPadding: false,
              }}
            >
              {s.text}
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
