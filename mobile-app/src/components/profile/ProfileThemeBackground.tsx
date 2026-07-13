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
  withSequence,
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

/** Giro holográfico + brillo que barre (prisma). */
function Prisma({ accent }: { accent: string }) {
  return (
    <>
      <Holo accent={accent} />
      <Sheen />
    </>
  );
}

function Holo({ accent }: { accent: string }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [spin, pulse]);
  const st = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }, { scale: 1.5 + pulse.value * 0.35 }],
    opacity: 0.42 + pulse.value * 0.28,
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, st]}>
      <LinearGradient
        colors={['#ff5db1', '#ff8a3a', '#ffe14d', '#57e7a2', '#4ab8ff', accent, '#ff5db1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: '150%', height: '150%' }}
      />
    </Animated.View>
  );
}

/** Brillo diagonal que barre (holo/prisma). */
function Sheen() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 0.5) * 500 }, { rotate: '18deg' }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center' }, st]} pointerEvents="none">
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: '55%', height: '170%', top: '-35%' }}
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
      return <Aurora />;
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
      return <Cosmos accent={accent} />;
    case 'prisma':
      return <Prisma accent={accent} />;
    default:
      // Sin motor conocido: un resplandor sutil desde abajo con el acento.
      return (
        <LinearGradient colors={['transparent', bottom]} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      );
  }
}

/** Aurora: cortinas verticales difusas que ondulan (sin bloques duros). */
function AuroraBand({ color, dur, delay, left, width, base }: {
  color: string; dur: number; delay: number; left: number; width: `${number}%`; base: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(p);
  }, [p, dur, delay]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: (p.value - 0.5) * 44 }, { scaleY: 0.85 + p.value * 0.5 }, { rotate: `${(p.value - 0.5) * 18}deg` }],
    opacity: base + p.value * 0.45,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: '-30%', height: '160%', left: `${left}%`, width }, st]}>
      <LinearGradient colors={['transparent', color, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

function Aurora() {
  return (
    <>
      <AuroraBand color="rgba(60,255,170,0.55)" dur={7000} delay={0} left={2} width="46%" base={0.28} />
      <AuroraBand color="rgba(74,184,255,0.5)" dur={9000} delay={1200} left={32} width="52%" base={0.26} />
      <AuroraBand color="rgba(168,108,255,0.5)" dur={8200} delay={600} left={58} width="44%" base={0.24} />
    </>
  );
}

/** Olas en capas + burbujas + brillo (océano). */
function WaveField({ accent }: { accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const back = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 0.5) * 34 }, { translateY: (0.5 - p.value) * 4 }] }));
  const mid = useAnimatedStyle(() => ({ transform: [{ translateX: (0.5 - p.value) * 48 }, { translateY: (p.value - 0.5) * 5 }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 0.5) * 62 }] }));
  const wave = (y: number) => `M-40 ${y} q 20 -9 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V100 H-40 Z`;
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Path d={wave(50)} fill={accent} opacity={0.18} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, mid]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Path d={wave(64)} fill={accent} opacity={0.26} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, front]}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Path d={wave(78)} fill={accent} opacity={0.34} />
        </Svg>
      </Animated.View>
      {[14, 30, 46, 62, 78, 90].map((x, i) => (
        <Rising key={i} leftPct={x} size={i % 2 === 0 ? 2.5 : 1.8} color="rgba(200,240,255,0.9)" dur={5200 + (i % 3) * 1100} delay={i * 520} rise={100} />
      ))}
      <LinearGradient colors={['rgba(180,235,255,0.16)', 'transparent']} start={{ x: 0.5, y: 0.4 }} end={{ x: 0.5, y: 0.78 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
    </>
  );
}

/** Cosmos: nebulosa animada + starfield con deriva + estrella fugaz. */
function Cosmos({ accent }: { accent: string }) {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(drift);
  }, [drift]);
  const driftSt = useAnimatedStyle(() => ({ transform: [{ translateX: (drift.value - 0.5) * 16 }, { translateY: (drift.value - 0.5) * 12 }] }));
  return (
    <>
      <Nebula accent={accent} />
      <Animated.View style={[StyleSheet.absoluteFill, driftSt]}>
        {STAR_POS.map(([x, y], i) => (
          <Twinkle key={`a${i}`} leftPct={x} topPct={y} size={i % 3 === 0 ? 2.4 : 1.5} dur={2200 + (i % 5) * 500} delay={i * 240} />
        ))}
        {STAR_POS.map(([x, y], i) => (
          <Twinkle key={`b${i}`} leftPct={(x + 9) % 100} topPct={(y + 43) % 100} size={i % 4 === 0 ? 2 : 1.2} dur={2600 + (i % 4) * 600} delay={i * 320 + 500} />
        ))}
      </Animated.View>
      <ShootingStar />
    </>
  );
}

/** Nebulosa que respira y deriva. */
function Nebula({ accent }: { accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({ opacity: 0.6 + p.value * 0.4, transform: [{ scale: 1 + p.value * 0.12 }, { translateX: (p.value - 0.5) * 10 }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="neb" cx="30%" cy="68%" r="70%">
            <Stop offset="0" stopColor={accent} stopOpacity="0.5" />
            <Stop offset="1" stopColor={accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="neb2" cx="78%" cy="30%" r="55%">
            <Stop offset="0" stopColor="#4ab8ff" stopOpacity="0.32" />
            <Stop offset="1" stopColor="#4ab8ff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="30%" cy="68%" r="62%" fill="url(#neb)" />
        <Circle cx="78%" cy="30%" r="50%" fill="url(#neb2)" />
      </Svg>
    </Animated.View>
  );
}

/** Estrella fugaz que cruza ocasionalmente. */
function ShootingStar() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      1500,
      withRepeat(
        withSequence(withTiming(1, { duration: 1100, easing: Easing.in(Easing.quad) }), withDelay(5200, withTiming(0, { duration: 0 }))),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(p);
  }, [p]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: -40 + p.value * 220 }, { translateY: -20 + p.value * 150 }, { rotate: '30deg' }],
    opacity: Math.sin(p.value * Math.PI) * 0.9,
  }));
  return (
    <Animated.View style={[{ position: 'absolute', top: '8%', left: '6%', width: 60, height: 2, borderRadius: 2 }, st]} pointerEvents="none">
      <LinearGradient colors={['transparent', '#ffffff']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
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
