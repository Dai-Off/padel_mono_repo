import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EducationalCourse } from "../api/learning";
import { androidReadableText } from "../components/home/inicio/textStyles";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");

interface Lesson {
  id: number;
  title: string;
  description: string;
  duration: string;
}

const MOCK_LESSONS: Lesson[] = [
  { id: 1, title: "Empuñadura continental", description: "Cómo colocar la mano en la pala para una volea limpia", duration: "4:30" },
  { id: 2, title: "Posición de espera en la red", description: "La posición base que te permite reaccionar a cualquier bola", duration: "5:10" },
  { id: 3, title: "Movimiento de pies lateral", description: "Desplazamiento correcto para llegar a tiempo", duration: "4:45" },
  { id: 4, title: "El punto de impacto ideal", description: "Dónde golpear la bola para máximo control", duration: "5:20" },
  { id: 5, title: "Control vs profundidad", description: "Cuándo usar cada tipo según la situación", duration: "5:00" },
  { id: 6, title: "Errores comunes y correcciones", description: "Los 5 fallos más frecuentes en principiantes", duration: "4:50" },
];

interface Props {
  course: EducationalCourse;
  onBack: () => void;
}

export function EducationalCourseDetailScreen({ course, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [expandedLessonId, setExpandedLessonId] = useState<number | null>(null);

  const toggleLesson = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedLessonId(expandedLessonId === id ? null : id);
  };

  const imageUrl = course.banner_url || "https://images.unsplash.com/photo-1585381867469-11d95edfe82c?w=600&fit=crop";

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Image Section */}
        <View style={styles.heroSection}>
          <Image source={{ uri: imageUrl }} style={styles.heroImage} />
          <LinearGradient
            colors={["transparent", "rgba(15,15,15,0.7)", "#0F0F0F"]}
            style={styles.heroGradient}
          />
          
          <View style={[styles.topButtons, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={onBack} style={styles.glassButton}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </Pressable>
            <Pressable style={styles.glassButton}>
              <Ionicons name="heart-outline" size={20} color="white" />
            </Pressable>
          </View>

          <View style={styles.heroContent}>
            <View style={styles.tagRow}>
              <View style={styles.courseTag}>
                <Text style={styles.tagText}>Curso</Text>
              </View>
              <View style={styles.levelTag}>
                <Text style={styles.levelTagText}>Nivel {course.elo_min.toFixed(0)}-{course.elo_max.toFixed(0)}</Text>
              </View>
            </View>
            <Text style={styles.title}>{course.title}</Text>
            <Text style={styles.subtitle}>{course.description || "Aprender la técnica correcta desde cero"}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{course.elo_min.toFixed(0)}-{course.elo_max.toFixed(0)}</Text>
              <Text style={styles.statLabel}>NIVEL</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{course.total_lessons || 6}</Text>
              <Text style={styles.statLabel}>LECCIONES</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>30 min</Text>
              <Text style={styles.statLabel}>DURACIÓN</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>342</Text>
              <Text style={styles.statLabel}>ALUMNOS</Text>
            </View>
          </View>

          {/* Reward Card */}
          <View style={styles.rewardCard}>
            <View style={styles.rewardGlow} />
            <View style={styles.rewardIconBox}>
                <Ionicons name="medal-outline" size={24} color="#9CA3AF" />
            </View>
            <View style={styles.rewardInfo}>
                <Text style={styles.rewardHeader}>RECOMPENSA DEL CURSO</Text>
                <Text style={styles.rewardTitle}>Muro de la Red</Text>
                <Text style={styles.rewardDesc}>Completaste tu primer curso de volea</Text>
            </View>
          </View>

          {/* Coach Card */}
          <View style={styles.coachCard}>
            <View style={styles.coachContent}>
                <View style={styles.coachAvatar}>
                    <Text style={styles.coachInitials}>CR</Text>
                </View>
                <View style={styles.coachInfo}>
                    <Text style={styles.coachName}>Coach Carlos Ruiz</Text>
                    <Text style={styles.coachClub}>Padel Family Indoor</Text>
                    <Text style={styles.coachSchedule}>Lun y Mié 18:00</Text>
                </View>
                <View style={styles.ratingBox}>
                    <Text style={styles.ratingValue}>4.9</Text>
                </View>
            </View>
          </View>

          {/* Lessons List */}
          <View style={styles.lessonsSection}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="book-outline" size={16} color="#F18F34" /> Lecciones ({MOCK_LESSONS.length})
            </Text>
            <View style={styles.lessonsList}>
              {MOCK_LESSONS.map((lesson) => (
                <View key={lesson.id} style={styles.lessonItemContainer}>
                  <Pressable 
                    onPress={() => toggleLesson(lesson.id)}
                    style={[
                        styles.lessonItem,
                        expandedLessonId === lesson.id && styles.lessonItemActive
                    ]}
                  >
                    <View style={styles.lessonNumber}>
                      <Text style={styles.lessonNumberText}>{lesson.id}</Text>
                    </View>
                    <View style={styles.lessonDetails}>
                      <Text style={styles.lessonTitle} numberOfLines={1}>{lesson.title}</Text>
                      <Text style={styles.lessonSubtitle} numberOfLines={1}>{lesson.description}</Text>
                    </View>
                    <View style={styles.lessonMeta}>
                      <Text style={styles.lessonDuration}>{lesson.duration}</Text>
                      <Ionicons name="play" size={12} color="#4B5563" />
                    </View>
                  </Pressable>

                  {/* Expanded Video Part */}
                  {expandedLessonId === lesson.id && (
                    <View style={styles.expandedContent}>
                        <View style={styles.videoMock}>
                            <Image source={{ uri: imageUrl }} style={styles.videoThumb} />
                            <View style={styles.videoOverlay}>
                                <View style={styles.videoPlayBtn}>
                                    <Ionicons name="play" size={24} color="white" style={{ marginLeft: 3 }} />
                                </View>
                                <Text style={styles.videoMetaText}>Vídeo horizontal · {lesson.duration}</Text>
                            </View>
                            <View style={styles.videoInfoBar}>
                                <Text style={styles.videoInfoTitle}>{lesson.title}</Text>
                                <Text style={styles.videoInfoSubtitle}>{lesson.description}</Text>
                            </View>
                        </View>
                        <Pressable style={styles.completeBtn}>
                           <Ionicons name="checkmark-circle-outline" size={16} color="#34D399" />
                           <Text style={styles.completeBtnText}>Marcar como completada</Text>
                        </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Certification Card */}
          <View style={styles.certCard}>
            <View style={styles.certGlow} />
            <View style={styles.certContent}>
                <View style={styles.certHeaderRow}>
                    <View style={styles.certIconBox}>
                        <Ionicons name="medal" size={20} color="white" />
                    </View>
                    <View>
                        <Text style={styles.certSubtitle}>Sesión práctica + Certificación</Text>
                        <Text style={styles.certHint}>Practica lo aprendido con tu entrenador</Text>
                    </View>
                </View>

                <View style={styles.certWarningBox}>
                    <Ionicons name="school-outline" size={16} color="#6B7280" />
                    <Text style={styles.certWarningText}>
                        No es un examen. Es una sesión práctica con Coach <Text style={{ color: 'white', fontWeight: 'bold' }}>Carlos Ruiz</Text> donde pones en práctica lo aprendido. Sin presión, solo aprendizaje real.
                    </Text>
                </View>

                <View style={styles.priceBox}>
                    <View>
                        <Text style={styles.priceLabel}>Precio de la sesión</Text>
                        <Text style={styles.priceSubLabel}>1ª certificación gratuita</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.priceValue}>GRATIS</Text>
                        <Text style={styles.priceBadge}>Lead magnet</Text>
                    </View>
                </View>

                <View style={styles.giftBox}>
                    <Text style={{ fontSize: 14 }}>🎁</Text>
                    <Text style={styles.giftText}>
                        Al certificarte, recibes <Text style={{ color: '#F18F34', fontWeight: 'bold' }}>50% dto.</Text> en tu primera mensualidad de clases en Padel Family Indoor
                    </Text>
                </View>

                <View style={styles.lockBox}>
                    <Text style={styles.lockText}>Completa las 6 lecciones para desbloquear</Text>
                    <Text style={styles.lockSubText}>6 lecciones restantes</Text>
                </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <LinearGradient
            colors={["#F18F34", "#E95F32"]}
            style={styles.startBtn}
        >
            <Pressable style={styles.startBtnInner}>
                <Ionicons name="play" size={20} color="white" />
                <Text style={styles.startBtnText}>Empezar curso</Text>
            </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  scroll: {
    flex: 1,
  },
  heroSection: {
    height: 300,
    width: "100%",
    position: 'relative',
  },
  heroImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topButtons: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  glassButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  courseTag: {
    backgroundColor: 'rgba(241, 143, 52, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: androidReadableText({
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  }),
  levelTagText: androidReadableText({
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  }),
  title: androidReadableText({
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  }),
  subtitle: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  }),
  body: {
    paddingHorizontal: 20,
    marginTop: 10,
    gap: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  statValue: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  }),
  statLabel: androidReadableText({
    color: '#6B7280',
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 1,
  }),
  rewardCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  rewardGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
    borderRadius: 60,
  },
  rewardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardInfo: {
    flex: 1,
  },
  rewardHeader: androidReadableText({
    color: '#F18F34',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
  }),
  rewardTitle: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  }),
  rewardDesc: androidReadableText({
    color: '#9CA3AF',
    fontSize: 11,
  }),
  coachCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  coachContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachInitials: androidReadableText({
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  }),
  coachInfo: {
    flex: 1,
  },
  coachName: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  }),
  coachClub: androidReadableText({
    color: '#6B7280',
    fontSize: 12,
  }),
  coachSchedule: androidReadableText({
    color: '#F18F34',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  }),
  ratingBox: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingValue: androidReadableText({
    color: '#1A1A1A',
    fontSize: 10,
    fontWeight: '900',
  }),
  lessonsSection: {
    marginTop: 8,
  },
  sectionTitle: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  }),
  lessonsList: {
    gap: 8,
  },
  lessonItemContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  lessonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  lessonItemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  lessonNumber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonNumberText: androidReadableText({
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '900',
  }),
  lessonDetails: {
    flex: 1,
  },
  lessonTitle: androidReadableText({
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  }),
  lessonSubtitle: androidReadableText({
    color: '#4B5563',
    fontSize: 10,
  }),
  lessonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lessonDuration: androidReadableText({
    color: '#4B5563',
    fontSize: 10,
  }),
  expandedContent: {
    padding: 12,
    paddingTop: 16,
  },
  videoMock: {
    width: '100%',
    aspectRatio: 16/9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'black',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  videoThumb: {
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  videoMetaText: androidReadableText({
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  }),
  videoInfoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoInfoTitle: androidReadableText({
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  }),
  videoInfoSubtitle: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  }),
  completeBtn: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeBtnText: androidReadableText({
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  }),
  certCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    position: 'relative',
    overflow: 'hidden',
  },
  certGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    backgroundColor: 'rgba(241, 143, 52, 0.06)',
    borderRadius: 50,
  },
  certContent: {
    gap: 12,
  },
  certHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  certIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  certSubtitle: androidReadableText({
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '900',
  }),
  certHint: androidReadableText({
    color: 'rgba(252, 211, 77, 0.6)',
    fontSize: 11,
    fontWeight: '500',
  }),
  certWarningBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    gap: 8,
  },
  certWarningText: androidReadableText({
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    flex: 1,
  }),
  priceBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: androidReadableText({
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  }),
  priceSubLabel: androidReadableText({
    color: '#6B7280',
    fontSize: 10,
  }),
  priceValue: androidReadableText({
    color: '#34D399',
    fontSize: 18,
    fontWeight: '900',
  }),
  priceBadge: androidReadableText({
    color: 'rgba(52, 211, 153, 0.6)',
    fontSize: 9,
    fontWeight: '700',
  }),
  giftBox: {
    backgroundColor: 'rgba(241, 143, 52, 0.08)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  giftText: androidReadableText({
    color: '#D1D5DB',
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  }),
  lockBox: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockText: androidReadableText({
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
  }),
  lockSubText: androidReadableText({
    color: '#4B5563',
    fontSize: 10,
  }),
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 15, 15, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    zIndex: 20,
  },
  startBtn: {
    borderRadius: 16,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  startBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  startBtnText: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  }),
});
