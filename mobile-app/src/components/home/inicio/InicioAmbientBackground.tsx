import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Ellipse,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

const BRAND_RGB = '241, 143, 52';
const PURPLE_RGB = '139, 92, 246';

/** RNG determinista (sin `Math.random` en render). */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Motas blancas: puntos pequeños sólidos (como en X7), no halos. */
type SmallCfg = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  driftY: number;
  driftX: number;
  scalePeak: number;
  duration: number;
  delay: number;
};

function buildSmallParticles(rng: () => number, count: number): SmallCfg[] {
  return Array.from({ length: count }, () => ({
    left: rng(),
    top: rng(),
    size: rng() > 0.5 ? 3 : 2,
    opacity: 0.3 + rng() * 0.4,
    driftY: 40 + rng() * 30,
    driftX: 10 + rng() * 20,
    scalePeak: 1.5 + rng(),
    duration: 4000 + rng() * 6000,
    delay: rng() * 8000,
  }));
}

/** Naranja / morado / azul: solo brillo difuso (casi imperceptible), no disco sólido. */
type GlowOrbCfg = {
  left: number;
  top: number;
  canvas: number;
  driftY: number;
  driftX: number;
  scalePeak: number;
  duration: number;
  delay: number;
  r: number;
  g: number;
  b: number;
  centerOpacity: number;
};

function buildMediumGlows(rng: () => number, count: number): GlowOrbCfg[] {
  return Array.from({ length: count }, () => {
    const warm = rng() > 0.5;
    const rgb = warm
      ? { r: 241, g: 143, b: 52 }
      : { r: 139, g: 92, b: 246 };
    const core = 6 + rng() * 8;
    return {
      left: rng(),
      top: rng(),
      canvas: Math.max(56, core * 5.8),
      driftY: 60 + rng() * 40,
      driftX: 15 + rng() * 30,
      scalePeak: 1.35 + rng() * 0.4,
      duration: 6000 + rng() * 8000,
      delay: rng() * 10000,
      ...rgb,
      centerOpacity: 0.04 + rng() * 0.045,
    };
  });
}

function buildLargeGlows(rng: () => number, count: number): GlowOrbCfg[] {
  return Array.from({ length: count }, () => {
    const warm = rng() > 0.5;
    const rgb = warm
      ? { r: 241, g: 143, b: 52 }
      : { r: 59, g: 130, b: 246 };
    const core = 20 + rng() * 30;
    return {
      left: rng(),
      top: rng(),
      canvas: Math.max(96, core * 3.15),
      driftY: 80 + rng() * 60,
      driftX: 30 + rng() * 60,
      scalePeak: 1.2 + rng() * 0.45,
      duration: 10000 + rng() * 15000,
      delay: rng() * 12000,
      ...rgb,
      centerOpacity: 0.022 + rng() * 0.035,
    };
  });
}

const PARTICLE_SEED = 0x9e3779b9;

function DriftingGradientOrb({
  orbKey,
  size,
  durationMs,
  tx0,
  tx1,
  tx2,
  ty0,
  ty1,
  ty2,
  stops,
  rxPct = '68%',
  ryPct = '44%',
}: {
  orbKey: string;
  size: number;
  durationMs: number;
  tx0: number;
  tx1: number;
  tx2: number;
  ty0: number;
  ty1: number;
  ty2: number;
  stops: { pct: number; color: string; opacity: number }[];
  rxPct?: string;
  ryPct?: string;
}) {
  const t = useRef(new Animated.Value(0)).current;

  const { tx, ty } = useMemo(() => {
    const txI = t.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [tx0, tx1, tx2],
    });
    const tyI = t.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [ty0, ty1, ty2],
    });
    return { tx: txI, ty: tyI };
  }, [t, tx0, tx1, tx2, ty0, ty1, ty2]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      t.setValue(0);
      Animated.timing(t, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    run();
    return () => {
      alive = false;
      t.stopAnimation();
    };
  }, [durationMs, t]);

  const r = size / 2;
  const gradId = `orbGrad_${orbKey}`;

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    >
      <Svg width={size} height={size} pointerEvents="none">
        <Defs>
          <RadialGradient id={gradId} cx="48%" cy="46%" rx={rxPct} ry={ryPct} fx="46%" fy="42%">
            {stops.map((s, i) => (
              <Stop
                key={`${orbKey}-${i}-${s.pct}`}
                offset={`${s.pct}%`}
                stopColor={s.color}
                stopOpacity={s.opacity}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Ellipse cx={r} cy={r} rx={r * 0.98} ry={r * 0.72} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

/** Punto blanco sólido (X7 “small dots”). */
function WhiteSpeckParticle({
  W,
  H,
  cfg,
}: {
  W: number;
  H: number;
  cfg: SmallCfg;
}) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      p.setValue(0);
      Animated.timing(p, {
        toValue: 1,
        duration: cfg.duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    const tid = setTimeout(run, cfg.delay % 12000);
    return () => {
      alive = false;
      clearTimeout(tid);
      p.stopAnimation();
    };
  }, [cfg.delay, cfg.duration, p]);

  const translateY = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -cfg.driftY, 0],
  });
  const translateX = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-cfg.driftX * 0.5, cfg.driftX, -cfg.driftX * 0.5],
  });
  const scale = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, cfg.scalePeak, 1],
  });

  const left = cfg.left * W;
  const top = cfg.top * H;

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        left,
        top,
        width: cfg.size,
        height: cfg.size,
        marginLeft: -cfg.size / 2,
        marginTop: -cfg.size / 2,
        borderRadius: cfg.size / 2,
        backgroundColor: `rgba(255,255,255,${cfg.opacity})`,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

/** Brillo naranja / morado / azul: gradiente muy suave, apenas visible. */
function AmbientGlowOrb({
  W,
  H,
  cfg,
  gradId,
}: {
  W: number;
  H: number;
  cfg: GlowOrbCfg;
  gradId: string;
}) {
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      p.setValue(0);
      Animated.timing(p, {
        toValue: 1,
        duration: cfg.duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    const tid = setTimeout(run, cfg.delay % 12000);
    return () => {
      alive = false;
      clearTimeout(tid);
      p.stopAnimation();
    };
  }, [cfg.delay, cfg.duration, p]);

  const translateY = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -cfg.driftY, 0],
  });
  const translateX = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-cfg.driftX * 0.5, cfg.driftX, -cfg.driftX * 0.5],
  });
  const scale = p.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, cfg.scalePeak, 1],
  });

  const left = cfg.left * W;
  const top = cfg.top * H;
  const c = cfg.canvas;
  const cx = c / 2;
  const cy = c / 2;
  const rgb = `rgb(${cfg.r},${cfg.g},${cfg.b})`;
  const midA = cfg.centerOpacity * 0.22;

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={{
        position: 'absolute',
        left,
        top,
        width: c,
        height: c,
        marginLeft: -cx,
        marginTop: -cy,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      <Svg width={c} height={c} pointerEvents="none">
        <Defs>
          <RadialGradient id={gradId} cx="42%" cy="40%" rx="82%" ry="78%">
            <Stop offset="0%" stopColor={rgb} stopOpacity={cfg.centerOpacity} />
            <Stop offset="18%" stopColor={rgb} stopOpacity={midA} />
            <Stop offset="48%" stopColor={rgb} stopOpacity={midA * 0.25} />
            <Stop offset="100%" stopColor={rgb} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={cx * 0.98} ry={cy * 0.95} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

/** Rejilla como X7: `<svg style={{ opacity: 0.03 }}>`. */
function GridLayer({ W, H }: { W: number; H: number }) {
  const patternId = 'inicioGrid';

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.03 }]}>
      <Svg width={W} height={H} pointerEvents="none">
        <Defs>
          <Pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={40}
            height={40}
          >
            <Path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={0.5}
            />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

/**
 * Fondo Inicio (X7): 3 halos lentos + 40 puntos blancos sólidos + 20 + 8 luces de color muy suaves.
 */
export function InicioAmbientBackground() {
  const { width: W, height: H } = useWindowDimensions();

  const rngA = useMemo(() => mulberry32(PARTICLE_SEED), []);
  const rngB = useMemo(() => mulberry32(PARTICLE_SEED + 1), []);
  const rngC = useMemo(() => mulberry32(PARTICLE_SEED + 2), []);

  const smallCfgs = useMemo(() => buildSmallParticles(rngA, 40), [rngA]);
  const mediumCfgs = useMemo(() => buildMediumGlows(rngB, 20), [rngB]);
  const largeCfgs = useMemo(() => buildLargeGlows(rngC, 8), [rngC]);

  const s1 = Math.min(500, Math.max(W, H) * 0.95);
  const s2 = Math.min(600, Math.max(W, H) * 1.05);
  const s3 = Math.min(450, Math.max(W, H) * 0.85);

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0F0F0F' }]} />

      <DriftingGradientOrb
        orbKey="a"
        rxPct="74%"
        ryPct="38%"
        size={s1}
        durationMs={25000}
        tx0={-250}
        tx1={W * 0.85}
        tx2={-250}
        ty0={-250}
        ty1={H * 0.78}
        ty2={-250}
        stops={[
          { pct: 0, color: `rgb(${BRAND_RGB})`, opacity: 0.12 },
          { pct: 42, color: `rgb(${BRAND_RGB})`, opacity: 0.03 },
          { pct: 78, color: `rgb(${BRAND_RGB})`, opacity: 0 },
          { pct: 100, color: '#0F0F0F', opacity: 0 },
        ]}
      />
      <DriftingGradientOrb
        orbKey="b"
        rxPct="62%"
        ryPct="50%"
        size={s2}
        durationMs={30000}
        tx0={W * 0.65}
        tx1={-300}
        tx2={W * 0.65}
        ty0={H * 0.55}
        ty1={-300}
        ty2={H * 0.55}
        stops={[
          { pct: 0, color: `rgb(${BRAND_RGB})`, opacity: 0.1 },
          { pct: 48, color: `rgb(${BRAND_RGB})`, opacity: 0.028 },
          { pct: 80, color: `rgb(${BRAND_RGB})`, opacity: 0 },
          { pct: 100, color: '#0F0F0F', opacity: 0 },
        ]}
      />
      <DriftingGradientOrb
        orbKey="c"
        rxPct="58%"
        ryPct="46%"
        size={s3}
        durationMs={20000}
        tx0={W * 0.45}
        tx1={-200}
        tx2={W * 0.45}
        ty0={-200}
        ty1={H * 0.82}
        ty2={-200}
        stops={[
          { pct: 0, color: `rgb(${PURPLE_RGB})`, opacity: 0.07 },
          { pct: 45, color: `rgb(${PURPLE_RGB})`, opacity: 0.02 },
          { pct: 78, color: `rgb(${PURPLE_RGB})`, opacity: 0 },
          { pct: 100, color: '#0F0F0F', opacity: 0 },
        ]}
      />

      {smallCfgs.map((cfg, i) => (
        <WhiteSpeckParticle key={`w-${i}`} W={W} H={H} cfg={cfg} />
      ))}
      {mediumCfgs.map((cfg, i) => (
        <AmbientGlowOrb key={`m-${i}`} W={W} H={H} cfg={cfg} gradId={`inicioGlowM_${i}`} />
      ))}
      {largeCfgs.map((cfg, i) => (
        <AmbientGlowOrb key={`l-${i}`} W={W} H={H} cfg={cfg} gradId={`inicioGlowL_${i}`} />
      ))}

      <GridLayer W={W} H={H} />

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(0,0,0,0.42)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.38)',
        ]}
        locations={[0, 0.18, 0.72, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
});
