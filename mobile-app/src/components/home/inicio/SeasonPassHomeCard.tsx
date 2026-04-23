import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGrad,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { ACCENT, ACCENT_SOFT } from "./constants";
import { DASH, dash } from "./dash";
import { androidReadableText } from "./textStyles";
import { ScalePressable } from "./ScalePressable";

/**
 * Igual que X7 `SeasonPassWidget`: `radial-gradient(circle, rgba(241,143,52,0.22) 0%, transparent 70%)`
 * + `blur-3xl` (aquí aproximado con gradiente suave) y `opacity` 0.5↔1 en ~4s.
 */
function SeasonPassWarmGlow({ compact }: { compact: boolean }) {
  const gid = useId().replace(/:/g, "_");
  const gradId = `seasonGlow_${gid}`;
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    let alive = true;
    const half = 2000;
    const run = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    run();
    return () => {
      alive = false;
      opacity.stopAnimation();
    };
  }, [opacity]);
  const size = compact ? 176 : 192;
  const r = size / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: compact ? -8 : 0,
        top: compact ? -12 : 0,
        width: size,
        height: size,
        opacity,
      }}
    >
      <Svg width={size} height={size} pointerEvents="none">
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor="rgb(241,143,52)" stopOpacity={0.22} />
            <Stop offset="70%" stopColor="rgb(241,143,52)" stopOpacity={0} />
            <Stop offset="100%" stopColor="rgb(241,143,52)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

function SeasonPassBarFill({ pct }: { pct: number }) {
  const [fillW, setFillW] = useState(0);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (fillW <= 0 || pct <= 0) return;
    let alive = true;
    const sweepMs = 2400;
    const pauseMs = 2000;
    const run = () => {
      if (!alive) return;
      shimmer.setValue(0);
      Animated.timing(shimmer, {
        toValue: 1,
        duration: sweepMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !alive) return;
        setTimeout(() => {
          if (alive) run();
        }, pauseMs);
      });
    };
    run();
    return () => {
      alive = false;
      shimmer.stopAnimation();
    };
  }, [fillW, pct, shimmer]);

  const stripW = Math.max(28, fillW * 0.42);
  const shimmerTx = useMemo(
    () =>
      shimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [-stripW, fillW + stripW],
      }),
    [fillW, shimmer, stripW],
  );

  const onFillLayout = (e: LayoutChangeEvent) => {
    setFillW(e.nativeEvent.layout.width);
  };

  if (pct <= 0) {
    return null;
  }

  return (
    <View
      style={[styles.barFillClip, { width: `${pct}%` }]}
      onLayout={onFillLayout}
    >
      <LinearGradient
        colors={[ACCENT, "#ffa940", "#ffd700"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {fillW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.barShimmerHost,
            { width: stripW, transform: [{ translateX: shimmerTx }] },
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.4)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

function RewardGem({ size = 32 }: { size?: number }) {
  const gid = useId().replace(/:/g, "_");
  const fillId = `gemFill_${gid}`;
  const strokeId = `gemStroke_${gid}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGrad id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#6B7280" stopOpacity={0.85} />
          <Stop offset="100%" stopColor="#9CA3AF" stopOpacity={0.6} />
        </SvgGrad>
        <SvgGrad id={strokeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#9CA3AF" />
          <Stop offset="100%" stopColor="#6B7280" />
        </SvgGrad>
      </Defs>
      <Path d="M50,8 L92,50 L50,92 L8,50 Z" fill={`url(#${fillId})`} />
      <Path
        d="M50,8 L92,50 L50,92 L8,50 Z"
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth={2.5}
      />
      <Circle cx={50} cy={50} r={13} fill="#374151" opacity={0.9} />
      <Circle cx={50} cy={50} r={9} fill="#9CA3AF" opacity={0.85} />
      <Circle cx={50} cy={50} r={5} fill="#fff" opacity={0.9} />
    </Svg>
  );
}

type Props = {
  /** Misma altura que `SeasonPassWidget` dentro del carrusel X7 (160px). */
  compact?: boolean;
  loading?: boolean;
  seasonLabel?: string | null;
  seasonTitle?: string | null;
  levelCurrent?: string | null;
  levelMax?: string | null;
  /** 0–100; sin dato → barra vacía. */
  progressPercent?: number | null;
  spCurrent?: string | null;
  spToNext?: string | null;
  nextRewardName?: string | null;
  onPress?: () => void;
};

export function SeasonPassHomeCard({
  compact = false,
  loading = false,
  seasonLabel,
  seasonTitle,
  levelCurrent,
  levelMax,
  progressPercent,
  spCurrent,
  spToNext,
  nextRewardName,
  onPress,
}: Props) {
  const pct =
    progressPercent != null &&
    !Number.isNaN(progressPercent) &&
    progressPercent >= 0
      ? Math.min(100, progressPercent)
      : 0;

  return (
    <ScalePressable
      onPress={onPress}
      pressedScale={compact ? 0.97 : 0.985}
      style={({ pressed }) => [
        styles.wrap,
        compact && styles.wrapCompact,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={["#1a0800", "#2a1100", "#1a0800"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.borderRing} />
      <SeasonPassWarmGlow compact={compact} />
      <View style={[styles.inner, compact && styles.innerCompact]}>
        <View style={[styles.topRow, compact && styles.topRowCompact]}>
          <View style={styles.left}>
            <LinearGradient
              colors={[ACCENT, "#ffa940"]}
              style={[styles.flameBox, compact && styles.flameBoxCompact]}
            >
              <Ionicons name="flame" size={compact ? 16 : 18} color="#fff" />
            </LinearGradient>
            <View style={styles.titleBlock}>
              <Text style={[styles.seasonLabel, compact && styles.seasonLabelCompact]}>
                {seasonLabel != null && String(seasonLabel).trim() !== ""
                  ? seasonLabel
                  : "Temporada"}
              </Text>
              <Text style={[styles.seasonTitle, compact && styles.seasonTitleCompact]}>
                {seasonTitle != null && String(seasonTitle).trim() !== ""
                  ? seasonTitle
                  : "Pase de temporada"}
              </Text>
            </View>
          </View>
          <View style={styles.levelCol}>
            <Text style={[styles.levelHint, compact && styles.levelHintCompact]}>Nivel</Text>
            {loading ? (
              <View style={{ minHeight: compact ? 28 : 34, justifyContent: "center", alignItems: "flex-end" }}>
                <ActivityIndicator size="small" color={ACCENT} />
              </View>
            ) : (
              <>
                <Text style={[styles.levelNum, compact && styles.levelNumCompact]}>
                  {dash(levelCurrent)}
                </Text>
                <Text style={[styles.levelMax, compact && styles.levelMaxCompact]}>
                  {levelMax != null && String(levelMax).trim() !== ""
                    ? `/ ${dash(levelMax)}`
                    : DASH}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={[styles.barWrap, compact && styles.barWrapCompact]}>
          <View style={[styles.barTrack, compact && styles.barTrackCompact]}>
            <SeasonPassBarFill pct={pct} />
          </View>
          <View style={styles.barMeta}>
            <Text style={[styles.barMetaLeft, compact && styles.barMetaTight]}>
              {dash(spCurrent)}
            </Text>
            <Text style={[styles.barMetaRight, compact && styles.barMetaTight]}>
              {dash(spToNext)}
            </Text>
          </View>
        </View>

        <View style={[styles.nextRow, compact && styles.nextRowCompact]}>
          <Text style={[styles.nextLabel, compact && styles.barMetaTight]}>Siguiente:</Text>
          <View style={styles.nextContent}>
            <RewardGem size={compact ? 24 : 32} />
            <Text style={[styles.nextName, compact && styles.barMetaTight]} numberOfLines={1}>
              {dash(nextRewardName)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={compact ? 16 : 18} color="#4b5563" />
        </View>
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
  },
  wrapCompact: {
    height: 160,
    maxHeight: 160,
  },
  pressed: { opacity: 0.95 },
  borderRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(241,143,52,0.22)",
  },
  inner: { padding: 20, zIndex: 1 },
  innerCompact: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  topRowCompact: { marginBottom: 6 },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  titleBlock: { flex: 1, minWidth: 0 },
  flameBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  flameBoxCompact: {
    width: 32,
    height: 32,
    borderRadius: 12,
  },
  seasonLabel: androidReadableText({
    fontSize: 10,
    fontWeight: "700",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 1,
  }),
  seasonTitle: androidReadableText({
    marginTop: 2,
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  }),
  seasonLabelCompact: androidReadableText({
    fontSize: 9,
    letterSpacing: 0.8,
  }),
  seasonTitleCompact: androidReadableText({
    marginTop: 1,
    fontSize: 13,
  }),
  levelCol: { alignItems: "flex-end" },
  levelHint: androidReadableText({
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 12,
    paddingRight: 4,
  }),
  levelHintCompact: androidReadableText({
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 12,
    paddingRight: 0,
  }),
  levelNum: androidReadableText({
    fontSize: 30,
    fontWeight: "900",
    color: "#fff",
    lineHeight: 34,
  }),
  levelNumCompact: androidReadableText({
    fontSize: 26,
    lineHeight: 28,
  }),
  levelMax: androidReadableText({ fontSize: 9, color: "#4b5563" }),
  levelMaxCompact: androidReadableText({ fontSize: 8 }),
  barWrap: { marginBottom: 12 },
  barWrapCompact: { marginBottom: 4 },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: 6,
  },
  barTrackCompact: {
    height: 8,
    marginBottom: 4,
  },
  barFillClip: {
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  barShimmerHost: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.55,
  },
  barMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  barMetaLeft: androidReadableText({ fontSize: 10, color: "#4b5563" }),
  barMetaRight: androidReadableText({ fontSize: 10, color: ACCENT_SOFT }),
  barMetaTight: androidReadableText({ fontSize: 9 }),
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nextRowCompact: { gap: 6, marginTop: 0 },
  nextLabel: androidReadableText({ fontSize: 10, color: "#6b7280" }),
  nextContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  nextName: androidReadableText({
    flex: 1,
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "500",
  }),
});
