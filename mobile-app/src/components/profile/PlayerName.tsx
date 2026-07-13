import React, { useEffect } from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';
import type { NameColorAttrs } from '../../api/profileCustomization';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(n, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Color en la posición t∈[0,1] del gradiente definido por `stops` (versión JS, estática). */
function sampleGradient(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const clamped = Math.max(0, Math.min(1, t));
  const seg = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const local = seg - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex(a.r + (b.r - a.r) * local, a.g + (b.g - a.g) * local, a.b + (b.b - a.b) * local);
}

/** Un carácter cuyo color recorre el gradiente cíclico según `t` (flujo animado). */
function FlowChar({ ch, input, cyc, base, t }: {
  ch: string; input: number[]; cyc: string[]; base: number; t: SharedValue<number>;
}) {
  const st = useAnimatedStyle(() => {
    const pos = (base + t.value) % 1;
    return { color: interpolateColor(pos, input, cyc) };
  });
  return <Animated.Text style={st}>{ch}</Animated.Text>;
}

interface Props {
  name: string;
  nameColor?: NameColorAttrs | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Permite animar. El grado de movimiento lo marca la rareza (ver abajo). */
  animate?: boolean;
}

/**
 * Nombre del jugador con color/gradiente cosmético (name_color). El dinamismo
 * escala con la rareza: común estático · rara solo glow · épica gradiente que
 * fluye · legendaria flujo más rápido y glow más intenso. Sin cosmético, cae a
 * un <Text> normal. `animate={false}` fuerza estático (listas/miniaturas).
 */
export const PlayerName: React.FC<Props> = ({ name, nameColor, style, numberOfLines, animate = true }) => {
  const colors = nameColor?.colors ?? null;
  const rarity = (nameColor?.rarity as AchievementRarity) ?? 'common';
  const conf = RARITY_CONFIG[rarity] ?? RARITY_CONFIG.common;

  // Nivel de dinamismo por rareza: 0 común, 1 rara (glow), 2 épica (flujo), 3 legendaria.
  const level = animate && colors && colors.length
    ? rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 1 : 0
    : 0;
  const doGlow = level >= 1;
  const doFlow = level >= 2 && !!colors && colors.length >= 2;
  const flowDur = rarity === 'legendary' ? 2400 : 3400;
  const glowMax = rarity === 'legendary' ? 10 : rarity === 'epic' ? 7 : 4;

  const t = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (doFlow) t.value = withRepeat(withTiming(1, { duration: flowDur, easing: Easing.linear }), -1, false);
    if (doGlow) glow.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => {
      cancelAnimation(t);
      cancelAnimation(glow);
    };
  }, [doFlow, doGlow, flowDur, t, glow]);

  const glowStyle = useAnimatedStyle(() => ({ textShadowRadius: 2 + glow.value * glowMax }));

  if (!colors || colors.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {name}
      </Text>
    );
  }

  const shadowBase: TextStyle = { textShadowColor: conf.glow, textShadowOffset: { width: 0, height: 0 } };
  const staticGradient = () => {
    const chars = Array.from(name);
    const denom = Math.max(1, chars.length - 1);
    return chars.map((ch, i) => (
      <Text key={i} style={{ color: sampleGradient(colors, i / denom) }}>
        {ch}
      </Text>
    ));
  };

  // Épica/legendaria con gradiente: flujo por carácter + glow que respira.
  if (doFlow) {
    const chars = Array.from(name);
    const n = Math.max(1, chars.length);
    const cyc = [...colors, colors[0]]; // paleta cíclica → sin salto al reciclar
    const input = cyc.map((_, i) => i / (cyc.length - 1));
    return (
      <Animated.Text style={[style, shadowBase, glowStyle]} numberOfLines={numberOfLines ?? 1}>
        {chars.map((ch, i) => (
          <FlowChar key={i} ch={ch} input={input} cyc={cyc} base={i / n} t={t} />
        ))}
      </Animated.Text>
    );
  }

  // Rara: color/gradiente fijo con glow que respira.
  if (doGlow) {
    if (colors.length === 1) {
      return (
        <Animated.Text style={[style, { color: colors[0] }, shadowBase, glowStyle]} numberOfLines={numberOfLines}>
          {name}
        </Animated.Text>
      );
    }
    return (
      <Animated.Text style={[style, shadowBase, glowStyle]} numberOfLines={numberOfLines ?? 1}>
        {staticGradient()}
      </Animated.Text>
    );
  }

  // Común o estático forzado: sin animación.
  const shadow: TextStyle = { ...shadowBase, textShadowRadius: rarity === 'common' ? 2 : 6 };
  if (colors.length === 1) {
    return (
      <Text style={[style, { color: colors[0] }, shadow]} numberOfLines={numberOfLines}>
        {name}
      </Text>
    );
  }
  return (
    <Text style={[style, shadow]} numberOfLines={numberOfLines ?? 1}>
      {staticGradient()}
    </Text>
  );
};
