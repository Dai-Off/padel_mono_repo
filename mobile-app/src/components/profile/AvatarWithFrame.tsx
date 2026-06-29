import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { type AchievementRarity } from '../../design/rarity';
import { getFrameStyle, frameGradient } from '../../design/frames';
import { normalizePlayerAvatarUrl } from '../../api/playerAvatar';

/**
 * Config por tipo de animación (adaptación de las del Figma a reanimated).
 *  spin: ms de giro del degradado | beat: ms de pulso (glow/escala) | flick: parpadeo
 *  shake: ms de jitter | sparks/orbit/rings/warp/morph: efectos extra.
 */
interface AnimCfg {
  spin?: number;
  beat?: number;
  flick?: boolean;
  shake?: number;
  sparks?: boolean;
  orbit?: boolean;
  rings?: number;
  warp?: boolean;
  morph?: boolean;
}
const ANIM: Record<string, AnimCfg> = {
  rotate: { spin: 2600 },
  orbit: { spin: 6000, orbit: true },
  warp: { spin: 2200, warp: true },
  glitch: { spin: 4200, shake: 1500, flick: true },
  ripple: { spin: 5200, rings: 2200 },
  morph: { spin: 3400, morph: true },
  pulse: { beat: 1400, rings: 1900 },
  breathe: { spin: 8000, beat: 4200 },
  flicker: { flick: true },
  shake: { shake: 520, sparks: true },
};

export interface FrameAttrs {
  rarity: AchievementRarity;
  style: string | null;
  animationType: string | null;
  colors: string[] | null;
}

interface AvatarWithFrameProps {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
  frame?: FrameAttrs | null;
  animate?: boolean;
}

// ─── Anillo expansivo (ripple / pulse) ───
function ExpandRing({ progress, index, size, radius, color }: { progress: SharedValue<number>; index: number; size: number; radius: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = (progress.value + index * 0.45) % 1;
    return { opacity: interpolate(p, [0, 0.15, 1], [0, 0.6, 0], Extrapolation.CLAMP), transform: [{ scale: interpolate(p, [0, 1], [0.85, 1.55]) }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.expandRing, { width: size, height: size, borderRadius: radius, borderColor: color }, style]} />;
}

// ─── Partícula en órbita ───
function OrbitParticle({ spin, index, radius, color }: { spin: SharedValue<number>; index: number; radius: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const a = (spin.value + index / 3) * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * radius }, { translateY: Math.sin(a) * radius }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, { backgroundColor: color, shadowColor: color }, style]} />;
}

// ─── Chispa (shake) ───
function Spark({ shake, index, color, dist }: { shake: SharedValue<number>; index: number; color: string; dist: number }) {
  const angle = (index * Math.PI * 2) / 4 + 0.6;
  const style = useAnimatedStyle(() => {
    const p = (shake.value * 1.4 + index * 0.25) % 1;
    return {
      opacity: interpolate(p, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: Math.cos(angle) * dist * p }, { translateY: Math.sin(angle) * dist * p }, { scale: interpolate(p, [0, 1], [0.4, 1.4]) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, { backgroundColor: color, shadowColor: color }, style]} />;
}

export const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({ initials, avatarUrl, size = 80, frame, animate = true }) => {
  const noFrame = !frame || frame.style === 'none' || frame.style == null;
  const st = getFrameStyle(frame?.style);
  const grad = frameGradient(frame?.colors, frame?.rarity ?? 'common');
  const innerR = Math.round(size * 0.22);
  const pad = noFrame ? 0 : st.borderWidth + (st.double ? 3 : 0);
  const outer = size + pad * 2;
  const outerR = innerR + pad;

  const animType = frame?.animationType ?? null;
  const cfg = animate && !noFrame && animType ? ANIM[animType] : undefined;

  const spin = useSharedValue(0);
  const beat = useSharedValue(0);
  const flick = useSharedValue(0);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const morph = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(spin);
    cancelAnimation(beat);
    cancelAnimation(flick);
    cancelAnimation(shake);
    cancelAnimation(ring);
    cancelAnimation(morph);
    if (cfg?.spin) spin.value = withRepeat(withTiming(1, { duration: cfg.spin, easing: Easing.linear }), -1, false);
    if (cfg?.beat) beat.value = withRepeat(withTiming(1, { duration: cfg.beat, easing: Easing.inOut(Easing.ease) }), -1, true);
    if (cfg?.flick) flick.value = withRepeat(withTiming(1, { duration: 130, easing: Easing.linear }), -1, true);
    if (cfg?.shake) shake.value = withRepeat(withTiming(1, { duration: cfg.shake, easing: Easing.linear }), -1, false);
    if (cfg?.rings) ring.value = withRepeat(withTiming(1, { duration: cfg.rings, easing: Easing.out(Easing.ease) }), -1, false);
    if (cfg?.morph) morph.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => {
      cancelAnimation(spin); cancelAnimation(beat); cancelAnimation(flick);
      cancelAnimation(shake); cancelAnimation(ring); cancelAnimation(morph);
    };
  }, [cfg, spin, beat, flick, shake, ring, morph]);

  const isShake = animType === 'shake';
  const isGlitch = animType === 'glitch';
  const isWarp = animType === 'warp';

  // Animación del MARCO (warp/shake/glitch/pulse/morph). Se aplica SOLO al anillo,
  // nunca al tile interior, que permanece quieto.
  const frameAnimStyle = useAnimatedStyle(() => {
    const t: { perspective?: number; rotateX?: string; rotateY?: string; translateX?: number; translateY?: number; rotate?: string; scale?: number }[] = [];
    if (animType === 'pulse' && cfg?.beat) t.push({ scale: interpolate(beat.value, [0, 1], [1, 1.07]) });
    if (isWarp) {
      const a = spin.value * Math.PI * 2;
      t.push({ perspective: 320 }, { rotateY: `${Math.sin(a) * 14}deg` }, { rotateX: `${Math.cos(a) * -7}deg` });
    }
    if (isShake) {
      const p = shake.value * Math.PI * 2;
      t.push({ translateX: Math.sin(p * 4) * 1.8 }, { translateY: Math.cos(p * 5) * 1.8 }, { rotate: `${Math.sin(p * 3) * 1.4}deg` });
    }
    if (isGlitch) {
      const on = shake.value % 1 > 0.86;
      t.push({ translateX: on ? ((shake.value * 53) % 6) - 3 : 0 });
    }
    const out: Record<string, unknown> = { transform: t };
    if (cfg?.morph) {
      const m = morph.value;
      out.borderTopLeftRadius = interpolate(m, [0, 1], [outerR * 0.55, outerR * 1.45]);
      out.borderTopRightRadius = interpolate(m, [0, 1], [outerR * 1.35, outerR * 0.65]);
      out.borderBottomRightRadius = interpolate(m, [0, 1], [outerR * 0.65, outerR * 1.35]);
      out.borderBottomLeftRadius = interpolate(m, [0, 1], [outerR * 1.25, outerR * 0.55]);
    }
    return out;
  });

  // Giro del degradado
  const gradStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
    opacity: cfg?.flick ? (flick.value > 0.5 ? 1 : 0.5) : 1,
  }));

  // Glow / halo
  const glowStyle = useAnimatedStyle(() => {
    let op = 0.26;
    let sc = 1;
    if (cfg?.beat) { op = interpolate(beat.value, [0, 1], [0.2, 0.5]); sc = interpolate(beat.value, [0, 1], [1, 1.1]); }
    else if (cfg?.flick) { op = flick.value > 0.5 ? 0.5 : 0.12; }
    return { opacity: op, transform: [{ scale: sc }] };
  });

  // Tile interior (foto o iniciales)
  const uri = normalizePlayerAvatarUrl(avatarUrl);
  const tile = (
    <View style={[styles.tile, { width: size, height: size, borderRadius: innerR }, st.double ? { borderWidth: 2, borderColor: '#141414' } : null]}>
      <LinearGradient colors={['#F18F34', '#E95F32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tileFill, { borderRadius: innerR }]}>
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.3) }]}>{(initials || '?').slice(0, 2).toUpperCase()}</Text>
      </LinearGradient>
      {uri ? <Image source={{ uri }} style={[styles.photo, { width: size, height: size, borderRadius: innerR }]} resizeMode="cover" /> : null}
    </View>
  );

  if (noFrame) return tile;

  const gradSize = outer * 1.8;
  const hasGlow = !!cfg || st.glow;

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow (del marco) */}
      {hasGlow ? (
        <Animated.View pointerEvents="none" style={[styles.halo, { width: outer + 8, height: outer + 8, borderRadius: outerR + 4, backgroundColor: grad[0] }, glowStyle]} />
      ) : null}

      {/* Anillos expansivos (ripple / pulse) */}
      {cfg?.rings ? [0, 1, 2].map((i) => (
        <ExpandRing key={i} progress={ring} index={i} size={outer} radius={outerR} color={grad[0]} />
      )) : null}

      {/* Partículas en órbita */}
      {cfg?.orbit ? [0, 1, 2].map((i) => (
        <OrbitParticle key={i} spin={spin} index={i} radius={outer / 2} color={grad[i % grad.length]} />
      )) : null}

      {/* Chispas (shake) */}
      {cfg?.sparks ? [0, 1, 2, 3].map((i) => (
        <Spark key={i} shake={shake} index={i} color={grad[i % grad.length]} dist={outer * 0.7} />
      )) : null}

      {/* MARCO animado (anillo), detrás y absoluto — NO contiene el avatar */}
      <Animated.View style={[styles.ringClip, styles.ringAbs, { width: outer, height: outer, borderRadius: outerR }, frameAnimStyle]}>
        <Animated.View style={[styles.gradLayer, { width: gradSize, height: gradSize, left: (outer - gradSize) / 2, top: (outer - gradSize) / 2 }, cfg?.spin ? gradStyle : undefined]}>
          <LinearGradient colors={grad as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={st.bevel ? { x: 1, y: 0 } : { x: 1, y: 1 }} style={{ width: gradSize, height: gradSize }} />
        </Animated.View>
      </Animated.View>

      {/* Avatar QUIETO, encima del marco (zIndex para no quedar tapado por el anillo) */}
      <View style={styles.tileTop}>{tile}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
  tileFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
  photo: { position: 'absolute', top: 0, left: 0 },
  halo: { position: 'absolute' },
  ringClip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ringAbs: { position: 'absolute', zIndex: 0 },
  tileTop: { zIndex: 2 },
  gradLayer: { position: 'absolute' },
  expandRing: { position: 'absolute', borderWidth: 2 },
  particle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
});
