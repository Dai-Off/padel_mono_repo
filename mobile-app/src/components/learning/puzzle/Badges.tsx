// Capa de badges A/B/C dentro del canvas, encima del court y de los players.
// Squircles SVG posicionados en `option.badge_position` (o un default si no viene).
// Espejo con los botones DOM de la barra inferior: pulsar aquí ejecuta el mismo
// onSelect.
//
// Estados visuales (3, no más):
//   - default    → glassmorphism (fill blanco 15% alpha + stroke blanco 30%)
//   - selected   → fondo naranja
//   - confirmed  → verde si is_correct, rojo si no
// Cuando algún badge no está en 'default', los otros se atenúan al 40% (cálculo
// derivado en render).
//
// La letra se renderiza como <Text> de RN (no <SvgText>) porque el centrado de
// texto SVG en react-native-svg es inconsistente entre iOS/Android.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G as SvgG, Path } from 'react-native-svg';
import { OUTER_H, OUTER_W, courtConfig } from './lib/courtConfig';
import type { PuzzleOption } from '../../../types/puzzle';

// Tween simple sin Animated.Value: useState + requestAnimationFrame.
// Evitamos pasar AnimatedNodes a react-native-svg, que en Android puede crashear
// (java.lang.String cannot be cast to com.facebook.react.bridge.ReadableArray).
function useTween(target: number, durationMs: number) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const from = value;
    if (from === target) return;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);
  return value;
}

type Props = {
  options: PuzzleOption[];
  selectedId: 1 | 2 | 3 | null;
  confirmed: boolean;
  onSelect: (opt: PuzzleOption) => void;
  widthPx: number;
  heightPx: number;
};

const SIDE_M = 1.8;
const CORNER_M = 0.4;

function defaultBadgePos(optionId: 1 | 2 | 3) {
  return { x: 2 + 2.5 * optionId, y: 4 };
}

type BadgeState = 'default' | 'selected' | 'confirmed';

interface BadgeColors {
  fill: string;
  fillOpacity: number;
  stroke: string;
  text: string;
}

function colorsFor(state: BadgeState, isCorrect: boolean): BadgeColors {
  if (state === 'confirmed') {
    return isCorrect
      ? { fill: '#22c55e', fillOpacity: 1, stroke: 'rgba(0,0,0,0.55)', text: '#06210f' }
      : { fill: '#ef4444', fillOpacity: 1, stroke: 'rgba(0,0,0,0.55)', text: '#2a0606' };
  }
  if (state === 'selected') {
    return { fill: '#fb923c', fillOpacity: 1, stroke: 'rgba(0,0,0,0.55)', text: '#1a0a00' };
  }
  // Fondo oscuro semitransparente: garantiza contraste sobre el campo y sobre
  // las líneas blancas. El texto blanco se ve siempre sin depender del fondo.
  return { fill: '#000000', fillOpacity: 0.65, stroke: 'rgba(255,255,255,0.5)', text: '#ffffff' };
}

function buildSquirclePath(cx: number, cy: number) {
  const half = SIDE_M / 2;
  const r = CORNER_M;
  const x0 = cx - half;
  const y0 = cy - half;
  const x1 = cx + half;
  const y1 = cy + half;
  return [
    `M ${x0 + r} ${y0}`,
    `H ${x1 - r}`,
    `Q ${x1} ${y0} ${x1} ${y0 + r}`,
    `V ${y1 - r}`,
    `Q ${x1} ${y1} ${x1 - r} ${y1}`,
    `H ${x0 + r}`,
    `Q ${x0} ${y1} ${x0} ${y1 - r}`,
    `V ${y0 + r}`,
    `Q ${x0} ${y0} ${x0 + r} ${y0}`,
    'Z',
  ].join(' ');
}

function BadgeSvg({
  option,
  selectedId,
  confirmed,
  anyActive,
}: {
  option: PuzzleOption;
  selectedId: 1 | 2 | 3 | null;
  confirmed: boolean;
  anyActive: boolean;
}) {
  const isSelected = selectedId === option.id;
  const state: BadgeState = confirmed && isSelected
    ? 'confirmed'
    : isSelected
      ? 'selected'
      : 'default';
  const showCorrectReveal = confirmed && !isSelected && option.is_correct;
  const baseColors = colorsFor(state, option.is_correct);
  const fill = showCorrectReveal ? '#22c55e' : baseColors.fill;
  const fillOpacity = showCorrectReveal ? 1 : baseColors.fillOpacity;
  const stroke = showCorrectReveal ? 'rgba(0,0,0,0.55)' : baseColors.stroke;

  const targetOpacity =
    anyActive && state === 'default' && !showCorrectReveal ? 0.4 : 1;
  const opacity = useTween(targetOpacity, 400);

  const pos = option.badge_position ?? defaultBadgePos(option.id);
  const cx = pos.x + courtConfig.outerMargin;
  const cy = pos.y + courtConfig.outerMargin;
  const d = buildSquirclePath(cx, cy);
  // Path desplazado para la sombra (evitamos transform=string, que crashea en
  // Android cuando se combina con bridge nativo).
  const shadowD = buildSquirclePath(cx + 0.06, cy + 0.1);

  return (
    <SvgG opacity={opacity}>
      {fillOpacity === 1 && (
        <Path d={shadowD} fill="rgba(0,0,0,0.25)" />
      )}
      <Path
        d={d}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={0.06}
      />
    </SvgG>
  );
}

export function Badges({
  options,
  selectedId,
  confirmed,
  onSelect,
  widthPx,
  heightPx,
}: Props) {
  const anyActive = selectedId !== null;

  return (
    <View
      style={[styles.layer, { width: widthPx, height: heightPx }]}
      pointerEvents="box-none"
    >
      <Svg
        width={widthPx}
        height={heightPx}
        viewBox={`0 0 ${OUTER_W} ${OUTER_H}`}
        pointerEvents="none"
      >
        {options.map((opt) => (
          <BadgeSvg
            key={opt.id}
            option={opt}
            selectedId={selectedId}
            confirmed={confirmed}
            anyActive={anyActive}
          />
        ))}
      </Svg>

      {/* Capa de letras + presionables. La letra se renderiza con <Text> de RN
          dentro del Pressable, centrada con flexbox — método más fiable que
          SvgText para evitar problemas de baseline en Android. */}
      {options.map((opt) => {
        const pos = opt.badge_position ?? defaultBadgePos(opt.id);
        const cxPx = ((pos.x + courtConfig.outerMargin) / OUTER_W) * widthPx;
        const cyPx = ((pos.y + courtConfig.outerMargin) / OUTER_H) * heightPx;
        const sidePx = (SIDE_M / OUTER_W) * widthPx;
        const isSelected = selectedId === opt.id;
        const state: BadgeState =
          confirmed && isSelected ? 'confirmed' : isSelected ? 'selected' : 'default';
        const showCorrectReveal = confirmed && !isSelected && opt.is_correct;
        const textColor = showCorrectReveal ? '#06210f' : colorsFor(state, opt.is_correct).text;
        const targetOpacity =
          anyActive && state === 'default' && !showCorrectReveal ? 0.4 : 1;

        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt)}
            disabled={confirmed}
            hitSlop={4}
            style={{
              position: 'absolute',
              left: cxPx - sidePx / 2,
              top: cyPx - sidePx / 2,
              width: sidePx,
              height: sidePx,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: targetOpacity,
            }}
          >
            <Text
              style={{
                color: textColor,
                fontSize: sidePx * 0.55,
                fontWeight: '900',
                textAlign: 'center',
                includeFontPadding: false,
                textAlignVertical: 'center',
              }}
            >
              {String.fromCharCode(64 + opt.id)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
