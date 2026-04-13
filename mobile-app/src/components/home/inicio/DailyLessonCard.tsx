import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { androidReadableText } from "./textStyles";

const WEEK_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;

type Props = {
  /** Texto bonus (API); sin dato → `-`. */
  bonusText?: string | null;
  weeklyProgress?: boolean[];
  alreadyCompleted?: boolean;
  onPress?: () => void;
};

export function DailyLessonCard({
  bonusText,
  weeklyProgress,
  alreadyCompleted,
  onPress,
}: Props) {
  // Obtener el índice del día actual (0=Lunes, 6=Domingo)
  const today = new Date();
  let todayIdx = today.getDay(); // 0=Domingo, 1=Lunes...
  todayIdx = todayIdx === 0 ? 6 : todayIdx - 1;

  // Animación tipo Pulse suave
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 1800,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    ]);
    Animated.loop(pulse).start();
  }, [pulseAnim]);

  // Usamos los datos reales que vienen por props
  const streakCount = weeklyProgress?.filter(Boolean).length ?? 0;
  const displayStreak = streakCount;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {/* Capa base oscura */}
      <LinearGradient
        colors={["#1A0800", "#261005", "#1A0800"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Capa de Pulso Naranja (Aumenta el tono y respira) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.1],
              outputRange: [0, 0.4],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={["#2A1100", "#4A2000", "#2A1100"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.glassBorder} />

      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={["#FFB040", "#FF5F00"]}
              style={styles.iconBox}
            >
              <Ionicons name="flame" size={20} color="white" />
            </LinearGradient>
            <View>
              <Text style={styles.title}>Lección diaria</Text>
              <Text style={styles.subtitle}>Racha semanal</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.ctaText}>
              {alreadyCompleted ? "Repasar" : "Empezar"}
            </Text>
            <Ionicons name="chevron-forward" size={12} color="#FF8C00" />
          </View>
        </View>

        {/* Streak Info */}
        <View style={styles.streakInfo}>
          <View style={styles.streakLabelContainer}>
            <Ionicons name="flame" size={10} color="#FF7A00" />
            <Text style={styles.streakText}>{displayStreak} días de racha</Text>
          </View>
          <Text style={styles.bonusText}>Bonus {bonusText || "x0.5"}</Text>
        </View>

        {/* Weekly Progress */}
        <View style={styles.daysRow}>
          {WEEK_LABELS.map((label, idx) => {
            const isDone = weeklyProgress?.[idx] ?? false;
            const isToday = idx === todayIdx;

            return (
              <View key={idx} style={styles.dayCol}>
                <Text
                  style={[
                    styles.dayLabel,
                    isToday ? styles.dayLabelActive : null,
                  ]}
                >
                  {label}
                </Text>

                <View
                  style={[
                    styles.dayCell,
                    isDone && styles.dayCellCompleted,
                    isToday && styles.dayCellToday,
                    !isDone && !isToday && styles.dayCellFuture,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={12} color="white" />
                  ) : isToday ? (
                    <Ionicons name="book-outline" size={12} color="#9CA3AF" />
                  ) : (
                    <Ionicons name="lock-closed" size={10} color="#374151" />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  wrap: {
    borderRadius: 28,
    overflow: "hidden",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  pressed: { opacity: 0.95 },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  inner: {
    padding: 16,
    paddingTop: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF5F00",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  title: androidReadableText({
    color: "white",
    fontSize: 17,
    fontWeight: "bold",
  }),
  subtitle: androidReadableText({
    color: "#6B7280",
    fontSize: 12,
    marginTop: -2,
  }),
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ctaText: androidReadableText({
    color: "#FF8C00",
    fontSize: 13,
    fontWeight: "700",
  }),
  streakInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  streakLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  streakText: androidReadableText({
    color: "#FF8E00",
    fontSize: 12,
    fontWeight: "bold",
  }),
  bonusText: androidReadableText({
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
  }),
  daysRow: {
    flexDirection: "row",
    gap: 4,
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  dayLabel: androidReadableText({
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
    textTransform: "uppercase",
  }),
  dayLabelActive: {
    color: "white",
    fontWeight: "bold",
  },
  dayCell: {
    width: "100%",
    height: 42, // Más alto en Figma para que sea rectangular ancho
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayCellCompleted: {
    backgroundColor: "#FF5F00",
    borderColor: "transparent",
  },
  dayCellToday: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.2,
    borderColor: "rgba(255, 122, 0, 0.4)",
  },
  dayCellFuture: {
    backgroundColor: "rgba(30, 20, 15, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
});
