import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { androidReadableText } from "../components/home/inicio/textStyles";
import { useAuth } from "../contexts/AuthContext";
import { fetchDailyLesson, Question } from "../api/learning";
import { ActivityIndicator } from "react-native";

const { width } = Dimensions.get("window");

type Props = {
  onBack: () => void;
  onStart: (questions: Question[]) => void;
};

export function DailyLessonIntroScreen({ onBack, onStart }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [alreadyCompleted, setAlreadyCompleted] = React.useState(false);

  // Valores de animación
  const iconScale = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const tag1Anim = useRef(new Animated.Value(0)).current;
  const tag2Anim = useRef(new Animated.Value(0)).current;
  const tag3Anim = useRef(new Animated.Value(0)).current;
  const tag4Anim = useRef(new Animated.Value(0)).current;
  const bottomAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function load() {
      if (session?.access_token) {
        const res = await fetchDailyLesson(session.access_token);
        if (res.ok) {
          if (res.already_completed) {
            setAlreadyCompleted(true);
          } else if (res.questions) {
            setQuestions(res.questions);
          }
        }
      }
      setLoading(false);
    }
    load();

    // Animaciones
    const createSlideAnim = (value: Animated.Value) => {
      return Animated.timing(value, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      });
    };

    Animated.sequence([
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.stagger(150, [
        createSlideAnim(titleAnim),
        createSlideAnim(subtitleAnim),
        createSlideAnim(tag1Anim),
        createSlideAnim(tag2Anim),
        createSlideAnim(tag3Anim),
        createSlideAnim(tag4Anim),
        createSlideAnim(bottomAnim),
      ]),
    ]).start();
  }, [session?.access_token]);

  const getAnimatedStyle = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlow} />

      <View style={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Icono Principal Animado */}
        <Animated.View
          style={[styles.iconWrapper, { transform: [{ scale: iconScale }] }]}
        >
          <View style={styles.iconGlowEffect} />
          <LinearGradient
            colors={["#F18F34", "#FFB347"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconBox}
          >
            <Ionicons name="flame" size={48} color="white" />
          </LinearGradient>
        </Animated.View>

        {/* Títulos Animados */}
        <Animated.Text style={[styles.title, getAnimatedStyle(titleAnim)]}>
          Lección del día
        </Animated.Text>
        <Animated.Text
          style={[styles.subtitle, getAnimatedStyle(subtitleAnim)]}
        >
          5 preguntas · ~3 minutos
        </Animated.Text>

        {/* Tags de Categorías Animados Individualmente */}
        <View style={styles.tagGrid}>
          <Animated.View style={getAnimatedStyle(tag1Anim)}>
            <LessonTag label="Técnica" color="#3B82F6" />
          </Animated.View>
          <Animated.View style={getAnimatedStyle(tag2Anim)}>
            <LessonTag label="Reglas" color="#10B981" />
          </Animated.View>
          <Animated.View style={getAnimatedStyle(tag3Anim)}>
            <LessonTag label="Táctica" color="#8B5CF6" />
          </Animated.View>
          <Animated.View style={getAnimatedStyle(tag4Anim)}>
            <LessonTag label="Vocabulario" color="#F59E0B" />
          </Animated.View>
        </View>

        {/* Bloque Inferior Animado */}
        <Animated.View
          style={[styles.bottomBlock, getAnimatedStyle(bottomAnim)]}
        >
          {loading ? (
            <ActivityIndicator size="large" color="#F18F34" />
          ) : alreadyCompleted ? (
            <View style={styles.completedContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <Text style={styles.completedText}>¡Ya completaste la lección de hoy!</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => onStart(questions)}
              disabled={questions.length === 0}
              style={({ pressed }) => [
                styles.mainButtonContainer,
                pressed && styles.pressed,
                questions.length === 0 && { opacity: 0.5 }
              ]}
            >
              <LinearGradient
                colors={["#F18F34", "#C46A20"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mainButton}
              >
                <Ionicons name="play" size={20} color="white" />
                <Text style={styles.mainButtonText}>Empezar lección</Text>
              </LinearGradient>
            </Pressable>
          )}

          <Pressable onPress={onBack} style={styles.skipButton}>
            <Text style={styles.skipButtonText}>Ahora no</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function LessonTag({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={[
        styles.tag,
        { borderColor: `${color}33`, backgroundColor: `${color}1A` },
      ]}
    >
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundGlow: {
    position: "absolute",
    top: "20%",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: "rgba(241, 143, 52, 0.08)",
    transform: [{ scale: 1.5 }],
  },
  content: {
    paddingHorizontal: 32,
    alignItems: "center",
    width: "100%",
  },
  iconWrapper: {
    marginBottom: 24,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlowEffect: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F18F34",
    opacity: 0.2,
    transform: [{ scale: 1.2 }],
  },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    elevation: 20,
    shadowColor: "#F18F34",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  title: androidReadableText({
    fontSize: 32,
    fontWeight: "900",
    color: "white",
    textAlign: "center",
    marginBottom: 8,
  }),
  subtitle: androidReadableText({
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 40,
  }),
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 80,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  bottomBlock: {
    width: "100%",
    alignItems: "center",
  },
  mainButtonContainer: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#F18F34",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  mainButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  mainButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  skipButton: {
    marginTop: 24,
    padding: 12,
  },
  skipButtonText: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "500",
  },
  completedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  completedText: androidReadableText({
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  }),
});
