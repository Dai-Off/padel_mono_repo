import React, { useEffect, useState } from 'react';
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

const DARK = '#141414';

// Config por animación (copiada del Figma): spin = ms de giro del degradado,
// cyc = ms del ciclo del efecto, ring = ms de los anillos expansivos.
type Effect = 'beat' | 'breathe' | 'flicker' | 'shake' | 'warp' | 'glitch' | 'morph';
interface Cfg {
  spin?: number;
  cyc?: number;
  ring?: number;
  effect?: Effect;
  rings?: number;
  orbit?: number;
  sparks?: number;
}
const CFG: Record<string, Cfg> = {
  rotate: { spin: 2500 },
  orbit: { spin: 6000, orbit: 3 },
  warp: { spin: 2000, cyc: 3000, effect: 'warp' },
  glitch: { spin: 4000, cyc: 4000, effect: 'glitch' },
  ripple: { spin: 5000, ring: 2200, rings: 3 },
  morph: { spin: 3000, cyc: 6000, effect: 'morph' },
  pulse: { cyc: 1500, ring: 2000, rings: 3, effect: 'beat' },
  breathe: { spin: 8000, cyc: 4000, effect: 'breathe' },
  flicker: { cyc: 2000, effect: 'flicker' },
  shake: { cyc: 500, effect: 'shake', sparks: 4 },
};

export interface FrameAttrs {
  rarity: AchievementRarity;
  style: string | null;
  animationType: string | null;
  colors: string[] | null;
}
interface Props {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
  frame?: FrameAttrs | null;
  animate?: boolean;
  /** Nivel/ELO (0–7). Si se pasa, muestra una burbuja en el borde inferior. */
  level?: number | null;
}

// Anillo expansivo (wmRippleRing): scale .92→1.5, opacity .8→0
function ExpandRing({ p, index, size, radius, color, count }: { p: SharedValue<number>; index: number; size: number; radius: number; color: string; count: number }) {
  const style = useAnimatedStyle(() => {
    const t = (p.value + index / count) % 1;
    return { opacity: interpolate(t, [0, 1], [0.8, 0], Extrapolation.CLAMP), transform: [{ scale: interpolate(t, [0, 1], [0.92, 1.5]) }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, { width: size, height: size, borderRadius: radius, borderColor: color }, style]} />;
}

// Partícula en órbita
function Orbit({ spin, index, radius, color, count }: { spin: SharedValue<number>; index: number; radius: number; color: string; count: number }) {
  const style = useAnimatedStyle(() => {
    const a = (spin.value + index / count) * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * radius }, { translateY: Math.sin(a) * radius }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, { backgroundColor: color, shadowColor: color }, style]} />;
}

// Chispa (shake)
function Spark({ cyc, index, color, dist, count }: { cyc: SharedValue<number>; index: number; color: string; dist: number; count: number }) {
  const ang = (index * Math.PI * 2) / count + 0.6;
  const style = useAnimatedStyle(() => {
    const t = (cyc.value * 0.6 + index / count) % 1;
    return {
      opacity: interpolate(t, [0, 0.2, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: Math.cos(ang) * dist * t }, { translateY: Math.sin(ang) * dist * t }, { scale: interpolate(t, [0, 1], [0.3, 1.5]) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.particle, { backgroundColor: color, shadowColor: color }, style]} />;
}

export const AvatarWithFrame: React.FC<Props> = ({ initials, avatarUrl, size = 80, frame, animate = true, level }) => {
  const noFrame = !frame || frame.style === 'none' || frame.style == null;
  const stl = getFrameStyle(frame?.style);
  const grad = frameGradient(frame?.colors, frame?.rarity ?? 'common');
  const innerR = Math.round(size * 0.22);
  const bw = noFrame ? 0 : stl.borderWidth + (stl.double ? 3 : 0);
  const outer = size + bw * 2;
  const outerR = innerR + bw;
  const maskR = Math.max(0, outerR - bw);

  const animType = frame?.animationType ?? null;
  const cfg = animate && !noFrame && animType ? CFG[animType] : undefined;

  const spin = useSharedValue(0);
  const cyc = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(spin); cancelAnimation(cyc); cancelAnimation(ring);
    if (cfg?.spin) spin.value = withRepeat(withTiming(1, { duration: cfg.spin, easing: Easing.linear }), -1, false);
    if (cfg?.cyc) cyc.value = withRepeat(withTiming(1, { duration: cfg.cyc, easing: Easing.linear }), -1, false);
    if (cfg?.ring) ring.value = withRepeat(withTiming(1, { duration: cfg.ring, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(spin); cancelAnimation(cyc); cancelAnimation(ring); };
  }, [cfg, spin, cyc, ring]);

  const effect = cfg?.effect;

  // Giro del degradado (conic→linear girando)
  const gradStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  // Movimiento del MARCO (no del avatar): beat/warp/glitch/shake/morph
  const frameStyle = useAnimatedStyle(() => {
    const t = cyc.value;
    const tr: Record<string, unknown>[] = [];
    if (effect === 'beat') {
      tr.push({ scale: interpolate(t, [0, 0.15, 0.3, 0.45, 1], [1, 1.08, 0.96, 1.04, 1]) });
    } else if (effect === 'warp') {
      tr.push(
        { perspective: 200 },
        { rotateY: `${interpolate(t, [0, 0.25, 0.5, 0.75, 1], [0, 10, 0, -10, 0])}deg` },
        { rotateX: `${interpolate(t, [0, 0.25, 0.5, 0.75, 1], [0, -3, 3, -2, 0])}deg` },
        { scale: interpolate(t, [0, 0.25, 0.5, 0.75, 1], [1, 1.03, 0.97, 1.02, 1]) },
      );
    } else if (effect === 'shake') {
      const k = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
      tr.push(
        { translateX: interpolate(t, k, [0, -2, 3, -1, 2, -2, 1, 0, -1, 1, 0]) },
        { translateY: interpolate(t, k, [0, -1, 1, 2, -1, 1, 0, -2, 1, 1, 0]) },
        { rotate: `${interpolate(t, k, [0, -1.5, 1.5, -0.5, 1, -1, 0.5, -1, 1, 0, 0])}deg` },
      );
    } else if (effect === 'glitch') {
      const k = [0, 0.84, 0.85, 0.87, 0.89, 0.91, 1];
      tr.push(
        { translateX: interpolate(t, k, [0, 0, -4, 4, -2, 0, 0]) },
        { translateY: interpolate(t, k, [0, 0, 1, -2, 2, 0, 0]) },
      );
    }
    return { transform: tr as never };
  });

  // Morph (wmMorph): deforma el anillo (clip del degradado) y la máscara.
  const morphRingStyle = useAnimatedStyle(() => {
    if (effect !== 'morph') return {};
    const t = cyc.value;
    const k = [0, 0.25, 0.5, 0.75, 1];
    const r = outerR;
    return {
      borderTopLeftRadius: interpolate(t, k, [r * 0.5, r * 1.2, r * 1.6, r * 0.5, r * 0.5]),
      borderTopRightRadius: interpolate(t, k, [r * 1.6, r * 1.2, r * 0.5, r * 1.2, r * 1.6]),
      borderBottomRightRadius: interpolate(t, k, [r * 1.2, r * 0.5, r * 0.5, r * 1.6, r * 1.2]),
      borderBottomLeftRadius: interpolate(t, k, [r * 1.2, r * 1.6, r * 1.2, r * 1.2, r * 1.2]),
    };
  });
  const morphMaskStyle = useAnimatedStyle(() => {
    if (effect !== 'morph') return {};
    const t = cyc.value;
    const k = [0, 0.25, 0.5, 0.75, 1];
    const r = maskR;
    return {
      borderTopLeftRadius: interpolate(t, k, [r * 0.5, r * 1.2, r * 1.6, r * 0.5, r * 0.5]),
      borderTopRightRadius: interpolate(t, k, [r * 1.6, r * 1.2, r * 0.5, r * 1.2, r * 1.6]),
      borderBottomRightRadius: interpolate(t, k, [r * 1.2, r * 0.5, r * 0.5, r * 1.6, r * 1.2]),
      borderBottomLeftRadius: interpolate(t, k, [r * 1.2, r * 1.6, r * 1.2, r * 1.2, r * 1.2]),
    };
  });

  // Glow (del marco)
  const glowStyle = useAnimatedStyle(() => {
    const t = cyc.value;
    let op = 0.3;
    let sc = 1;
    if (effect === 'beat') { op = interpolate(t, [0, 0.5, 1], [0.7, 1, 0.7]) * 0.55; sc = interpolate(t, [0, 0.5, 1], [1, 1.15, 1]); }
    else if (effect === 'breathe') { op = interpolate(t, [0, 0.5, 1], [0.4, 0.85, 0.4]); sc = interpolate(t, [0, 0.5, 1], [1, 1.12, 1]); }
    else if (effect === 'flicker') {
      const k = [0, 0.05, 0.1, 0.15, 0.2, 0.5, 0.52, 0.54, 1];
      op = interpolate(t, k, [0.7, 0.25, 0.7, 0.4, 0.7, 0.6, 0.18, 0.7, 0.7]);
    }
    return { opacity: op, transform: [{ scale: sc }] };
  });

  // Tile interior (foto o iniciales) — QUIETO. El gradiente con iniciales queda
  // SIEMPRE debajo, así que la foto nunca "reemplaza" al fallback; si falla la
  // carga se reintenta (hasta 2 veces) antes de rendirse y quedarse en iniciales.
  const uri = normalizePlayerAvatarUrl(avatarUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    setPhotoFailed(false);
    setLoadAttempt(0);
  }, [uri]);
  const tile = (
    <View style={[styles.tile, { width: size, height: size, borderRadius: innerR }]}>
      <LinearGradient colors={['#F18F34', '#E95F32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tileFill, { borderRadius: innerR }]}>
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.3) }]}>{(initials || '?').slice(0, 2).toUpperCase()}</Text>
      </LinearGradient>
      {uri && !photoFailed ? (
        <Image
          key={`${uri}-${loadAttempt}`}
          source={{ uri }}
          style={[styles.photo, { width: size, height: size, borderRadius: innerR }]}
          resizeMode="cover"
          onError={() => {
            if (loadAttempt < 2) {
              setTimeout(() => setLoadAttempt((n) => n + 1), 1200);
            } else {
              setPhotoFailed(true);
            }
          }}
        />
      ) : null}
    </View>
  );

  // Burbuja de nivel en el borde inferior (parte del "pack" avatar+marco+nivel)
  // Se muestra siempre que se pase `level` (aunque sea null → "-"). Si no se pasa
  // el prop (undefined), no hay burbuja (otros usos del pack sin nivel).
  // Dimensiones proporcionales a `size` (referencia 80 = perfil) para que se vea
  // igual en cualquier tamaño sin ajustes por pantalla.
  const lvlK = size / 80;
  const lvlFont = Math.max(9, Math.round(14 * lvlK));
  const lvlPadH = Math.max(6, Math.round(9 * lvlK));
  const lvlPadV = Math.max(2, Math.round(3 * lvlK));
  const lvlMinW = Math.max(28, Math.round(42 * lvlK));
  const lvlRadius = Math.max(6, Math.round(9 * lvlK));
  const lvlOffset = Math.round(12 * lvlK);
  const levelBubble =
    level !== undefined ? (
      <View style={[styles.levelRow, { bottom: (noFrame ? 0 : bw) - lvlOffset }]} pointerEvents="none">
        <View style={[styles.levelPill, { minWidth: lvlMinW, paddingHorizontal: lvlPadH, paddingVertical: lvlPadV, borderRadius: lvlRadius }]}>
          <Text style={[styles.levelText, { fontSize: lvlFont }]}>{level != null && Number.isFinite(level) ? level.toFixed(2).replace('.', ',') : '-'}</Text>
        </View>
      </View>
    ) : null;

  if (noFrame) {
    return (
      <View style={{ width: size, height: size }}>
        {tile}
        {levelBubble}
      </View>
    );
  }

  const gradSize = outer * 1.8;
  const hasGlow = !!cfg || stl.glow;

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {/* Glow del marco */}
      {hasGlow ? (
        <Animated.View pointerEvents="none" style={[styles.halo, { width: outer + 8, height: outer + 8, borderRadius: outerR + 4, backgroundColor: grad[0] }, glowStyle]} />
      ) : null}

      {/* Anillos expansivos (ripple / pulse) */}
      {cfg?.rings ? Array.from({ length: cfg.rings }).map((_, i) => (
        <ExpandRing key={i} p={ring} index={i} size={outer} radius={outerR} color={grad[0]} count={cfg.rings!} />
      )) : null}

      {/* Partículas en órbita */}
      {cfg?.orbit ? Array.from({ length: cfg.orbit }).map((_, i) => (
        <Orbit key={i} spin={spin} index={i} radius={outer / 2} color={grad[i % grad.length]} count={cfg.orbit!} />
      )) : null}

      {/* Chispas (shake) */}
      {cfg?.sparks ? Array.from({ length: cfg.sparks }).map((_, i) => (
        <Spark key={i} cyc={cyc} index={i} color={grad[i % grad.length]} dist={outer * 0.7} count={cfg.sparks!} />
      )) : null}

      {/* MARCO: borde con degradado + máscara oscura (forma el hueco). Solo esto se anima. */}
      <Animated.View style={[styles.frameAbs, { width: outer, height: outer, borderRadius: outerR }, frameStyle]}>
        <Animated.View style={[styles.ringClip, { width: outer, height: outer, borderRadius: outerR }, morphRingStyle]}>
          <Animated.View style={[styles.gradLayer, { width: gradSize, height: gradSize, left: (outer - gradSize) / 2, top: (outer - gradSize) / 2 }, cfg?.spin ? gradStyle : undefined]}>
            <LinearGradient colors={grad as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={stl.bevel ? { x: 1, y: 0 } : { x: 1, y: 1 }} style={{ width: gradSize, height: gradSize }} />
          </Animated.View>
        </Animated.View>
        {/* Máscara interior oscura = hueco */}
        <Animated.View style={[styles.mask, { top: bw, left: bw, right: bw, bottom: bw, borderRadius: maskR, backgroundColor: DARK }, morphMaskStyle]} />
        {stl.double ? <View style={[styles.mask, { top: bw - 2, left: bw - 2, right: bw - 2, bottom: bw - 2, borderRadius: maskR + 2, borderWidth: 1, borderColor: DARK, backgroundColor: 'transparent' }]} /> : null}
      </Animated.View>

      {/* Avatar QUIETO, encima del marco (en el hueco) */}
      <View style={styles.tileTop}>{tile}</View>

      {levelBubble}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
  tileFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
  photo: { position: 'absolute', top: 0, left: 0 },
  halo: { position: 'absolute' },
  frameAbs: { position: 'absolute', zIndex: 0, overflow: 'visible' },
  ringClip: { overflow: 'hidden', position: 'absolute' },
  gradLayer: { position: 'absolute' },
  mask: { position: 'absolute' },
  tileTop: { zIndex: 2 },
  levelRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  // minWidth/padding/borderRadius/fontSize se calculan según `size` (ver arriba).
  levelPill: {
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { color: '#fff', fontWeight: '800' },
  ring: { position: 'absolute', borderWidth: 2 },
  particle: { position: 'absolute', width: 5, height: 5, borderRadius: 3, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, elevation: 3 },
});
