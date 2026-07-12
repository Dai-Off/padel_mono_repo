import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { ThemeAttrs } from '../../api/profileCustomization';

const FALLBACK: [string, string, string] = ['#17110d', '#0a0807', '#ff7d2e'];

function palette(theme?: ThemeAttrs | null): { top: string; bottom: string; accent: string } {
  const c = theme?.colors && theme.colors.length >= 2 ? theme.colors : FALLBACK;
  return { top: c[0], bottom: c[1] ?? c[0], accent: c[2] ?? c[1] ?? c[0] };
}

// Posiciones deterministas (evita Math.random en render).
const EMBER_X = [8, 22, 34, 47, 58, 69, 78, 88, 15, 63];
const STAR_POS = [
  [12, 18], [28, 62], [44, 30], [62, 74], [78, 24],
  [88, 58], [52, 48], [20, 82], [70, 12], [36, 70],
];

/** Partícula que asciende y se desvanece (brasas). */
function Rising({ leftPct, size, color, dur, delay, rise }: {
  leftPct: number; size: number; color: string; dur: number; delay: number; rise: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [p, dur, delay]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: -p.value * rise }, { translateX: Math.sin(p.value * Math.PI * 2) * 6 }],
    opacity: Math.sin(p.value * Math.PI) * 0.9,
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', bottom: 0, left: `${leftPct}%`, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        st,
      ]}
    />
  );
}

/** Estrella titilante. */
function Twinkle({ leftPct, topPct, size, dur, delay }: {
  leftPct: number; topPct: number; size: number; dur: number; delay: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(p);
  }, [p, dur, delay]);
  const st = useAnimatedStyle(() => ({ opacity: 0.3 + p.value * 0.7 }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: `${topPct}%`, left: `${leftPct}%`, width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' },
        st,
      ]}
    />
  );
}

/** Capa de gradiente que deriva lentamente (humo, aurora, nebulosa). */
function Drift({ colors, dur, dx, dy, angle }: {
  colors: [string, string]; dur: number; dx: number; dy: number; angle?: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p, dur]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: (p.value - 0.5) * dx }, { translateY: (p.value - 0.5) * dy }, { scale: 1.1 + p.value * 0.2 }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <LinearGradient
        colors={[colors[0], 'transparent', colors[1]]}
        start={{ x: angle ? 0 : 0.2, y: 0.1 }}
        end={{ x: 0.8, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Franjas horizontales que "avanzan" hacia el jugador (pista/neón). */
function ApproachLines({ color }: { color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: p.value * 26 }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' }, st]}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ position: 'absolute', bottom: i * 26, left: 0, right: 0, height: 2, backgroundColor: color, opacity: 0.25 + i * 0.12 }} />
      ))}
    </Animated.View>
  );
}

/** Giro holográfico (prisma). */
function Holo({ accent }: { accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }, { scale: 1.6 }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, st]}>
      <LinearGradient
        colors={['#ff5db1', '#ff8a3a', '#ffe14d', '#57e7a2', '#4ab8ff', accent, '#ff5db1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: '140%', height: '140%', opacity: 0.5 }}
      />
    </Animated.View>
  );
}

/** Pulso de resplandor (fénix). */
function GlowPulse({ accent }: { accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({ opacity: 0.5 + p.value * 0.5 }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]} pointerEvents="none">
      <LinearGradient colors={['transparent', accent]} start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 1.1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function Effect({ type, accent, bottom }: { type: string | null; accent: string; bottom: string }) {
  switch (type) {
    case 'embers':
      return (
        <>
          {EMBER_X.map((x, i) => (
            <Rising key={i} leftPct={x} size={i % 3 === 0 ? 3 : 2} color={accent} dur={4500 + (i % 4) * 900} delay={i * 320} rise={130} />
          ))}
        </>
      );
    case 'phoenix':
      return (
        <>
          <GlowPulse accent={accent} />
          {EMBER_X.map((x, i) => (
            <Rising key={i} leftPct={x} size={i % 2 === 0 ? 3 : 2} color={accent} dur={3600 + (i % 4) * 700} delay={i * 240} rise={150} />
          ))}
        </>
      );
    case 'smoke':
      return <Drift colors={[accent + '2b', accent + '22']} dur={13000} dx={40} dy={22} />;
    case 'aurora':
      return (
        <>
          <Drift colors={['#3cffaa55', '#7850ff44']} dur={8000} dx={70} dy={10} angle={1} />
          <Drift colors={['#4ab8ff44', '#3cffaa33']} dur={11000} dx={-60} dy={14} angle={1} />
        </>
      );
    case 'court':
      return <ApproachLines color={accent} />;
    case 'neon':
      return (
        <>
          <View style={{ position: 'absolute', top: '20%', alignSelf: 'center', width: 120, height: 120, borderRadius: 60, backgroundColor: accent, opacity: 0.7 }} />
          <ApproachLines color={accent} />
        </>
      );
    case 'waves':
      return <WaveField accent={accent} />;
    case 'cosmos':
      return (
        <>
          <NebulaSvg accent={accent} />
          {STAR_POS.map(([x, y], i) => (
            <Twinkle key={i} leftPct={x} topPct={y} size={i % 3 === 0 ? 2.4 : 1.6} dur={2600 + (i % 5) * 500} delay={i * 260} />
          ))}
        </>
      );
    case 'prisma':
      return <Holo accent={accent} />;
    default:
      // Sin motor conocido: un resplandor sutil desde abajo con el acento.
      return (
        <LinearGradient colors={['transparent', bottom]} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      );
  }
}

/** Nebulosa radial (cosmos), SVG. */
function NebulaSvg({ accent }: { accent: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="neb" cx="30%" cy="70%" r="70%">
          <Stop offset="0" stopColor={accent} stopOpacity="0.45" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="30%" cy="70%" r="60%" fill="url(#neb)" />
    </Svg>
  );
}

/** Olas (SVG paths desplazándose). */
function WaveField({ accent }: { accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 0.5) * 40 }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateX: (0.5 - p.value) * 50 }] }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, s1]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Path d="M-20 62 Q 25 52 60 62 T 140 62 V100 H-20 Z" fill={accent} opacity={0.28} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, s2]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Path d="M-20 76 Q 30 68 65 76 T 140 76 V100 H-20 Z" fill={accent} opacity={0.22} />
        </Svg>
      </Animated.View>
    </>
  );
}

type Props = {
  theme?: ThemeAttrs | null;
  style?: StyleProp<ViewStyle>;
  /** Difumina ligeramente para que el contenido encima siga legible. */
  scrim?: boolean;
};

/**
 * Fondo animado del perfil según el tema equipado (kind 'theme'). Se coloca como
 * capa absoluta detrás del hero. Sin tema, no renderiza nada.
 */
export const ProfileThemeBackground: React.FC<Props> = ({ theme, style, scrim = true }) => {
  if (!theme || !theme.animationType) return null;
  const { top, bottom, accent } = palette(theme);
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, style]} pointerEvents="none">
      <LinearGradient colors={[top, bottom]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <Effect type={theme.animationType} accent={accent} bottom={bottom} />
      {scrim ? (
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} start={{ x: 0.5, y: 0.35 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
