import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGrad,
  Path,
  Stop,
} from "react-native-svg";
import { ACCENT, ACCENT_SOFT } from "./constants";
import { DASH, dash } from "./dash";
import { androidReadableText } from "./textStyles";

function RewardGem() {
  return (
    <Svg width={32} height={32} viewBox="0 0 100 100">
      <Defs>
        <SvgGrad id="gemFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#6B7280" stopOpacity={0.85} />
          <Stop offset="100%" stopColor="#9CA3AF" stopOpacity={0.6} />
        </SvgGrad>
        <SvgGrad id="gemStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#9CA3AF" />
          <Stop offset="100%" stopColor="#6B7280" />
        </SvgGrad>
      </Defs>
      <Path d="M50,8 L92,50 L50,92 L8,50 Z" fill="url(#gemFill)" />
      <Path
        d="M50,8 L92,50 L50,92 L8,50 Z"
        fill="none"
        stroke="url(#gemStroke)"
        strokeWidth={2.5}
      />
      <Circle cx={50} cy={50} r={13} fill="#374151" opacity={0.9} />
      <Circle cx={50} cy={50} r={9} fill="#9CA3AF" opacity={0.85} />
      <Circle cx={50} cy={50} r={5} fill="#fff" opacity={0.9} />
    </Svg>
  );
}

type Props = {
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={["#1a0800", "#2a1100", "#1a0800"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.borderRing} />
      <View style={styles.orb} />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={styles.left}>
            <LinearGradient
              colors={[ACCENT, "#ffa940"]}
              style={styles.flameBox}
            >
              <Ionicons name="flame" size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.titleBlock}>
              <Text style={styles.seasonLabel}>
                {seasonLabel != null && String(seasonLabel).trim() !== ""
                  ? seasonLabel
                  : "Temporada"}
              </Text>
              <Text style={styles.seasonTitle}>
                {seasonTitle != null && String(seasonTitle).trim() !== ""
                  ? seasonTitle
                  : "Pase de temporada"}
              </Text>
            </View>
          </View>
          <View style={styles.levelCol}>
            <Text style={styles.levelHint}>Nivel</Text>
            <Text style={styles.levelNum}>{dash(levelCurrent)}</Text>
            <Text style={styles.levelMax}>
              {levelMax != null && String(levelMax).trim() !== ""
                ? `/ ${dash(levelMax)}`
                : DASH}
            </Text>
          </View>
        </View>

        <View style={styles.barWrap}>
          <View style={styles.barTrack}>
            <LinearGradient
              colors={[ACCENT, "#ffa940", "#ffd700"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${pct}%` }]}
            />
          </View>
          <View style={styles.barMeta}>
            <Text style={styles.barMetaLeft}>{dash(spCurrent)}</Text>
            <Text style={styles.barMetaRight}>{dash(spToNext)}</Text>
          </View>
        </View>

        <View style={styles.nextRow}>
          <Text style={styles.nextLabel}>Siguiente:</Text>
          <View style={styles.nextContent}>
            <RewardGem />
            <Text style={styles.nextName} numberOfLines={1}>
              {dash(nextRewardName)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4b5563" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: "hidden",
    width: "100%",
  },
  pressed: { opacity: 0.95 },
  borderRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(241,143,52,0.22)",
  },
  orb: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: "rgba(241,143,52,0.15)",
  },
  inner: { padding: 20, zIndex: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  titleBlock: { flex: 1, minWidth: 0 },
  flameBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
  levelCol: { alignItems: "flex-end" },
  levelHint: androidReadableText({
    fontSize: 12,
    color: "#6b7280",
    paddingRight: 4,
  }),
  levelNum: androidReadableText({
    fontSize: 30,
    fontWeight: "900",
    color: "#fff",
    lineHeight: 34,
  }),
  levelMax: androidReadableText({ fontSize: 9, color: "#4b5563" }),
  barWrap: { marginBottom: 12 },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginBottom: 6,
  },
  barFill: { height: "100%", borderRadius: 999 },
  barMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  barMetaLeft: androidReadableText({ fontSize: 10, color: "#4b5563" }),
  barMetaRight: androidReadableText({ fontSize: 10, color: ACCENT_SOFT }),
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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
