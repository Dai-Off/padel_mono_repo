import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Animated,
  ActivityIndicator,
  LayoutAnimation,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EducationalCourse, fetchCourseDetail, completeCourseLesson, type CourseLesson } from "../api/learning";
import { useAuth } from "../contexts/AuthContext";
import { useVideoPlayer, VideoView } from "expo-video";
import { androidReadableText } from "../components/home/inicio/textStyles";


const { width } = Dimensions.get("window");

interface Props {
  course: EducationalCourse;
  onBack: () => void;
}

export function EducationalCourseDetailScreen({ course, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchCourseDetail(session?.access_token, course.id).then((res) => {
      if (!mounted) return;
      if (res.ok && res.course) setLessons(res.course.lessons ?? []);
      setLessonsLoading(false);
    });
    return () => { mounted = false; };
  }, [session?.access_token, course.id]);

  const toggleLesson = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedLessonId(expandedLessonId === id ? null : id);
  };

  const handleComplete = async (lessonId: string) => {
    setCompleting(lessonId);
    const res = await completeCourseLesson(session?.access_token, course.id, lessonId);
    if (res.ok) {
      setLessons((prev) =>
        prev.map((l, i) => {
          if (l.id === lessonId) return { ...l, status: 'completed' as const };
          if (i > 0 && prev[i - 1].id === lessonId && l.status === 'locked') return { ...l, status: 'available' as const };
          return l;
        }),
      );
    }
    setCompleting(null);
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
                    <Text style={styles.coachInitials}>{(course.coach_name || 'C').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.coachInfo}>
                    <Text style={styles.coachName}>Coach {course.coach_name || 'Sin asignar'}</Text>
                    <Text style={styles.coachClub}>{course.club_name || ''}</Text>
                </View>
                <View style={styles.ratingBox}>
                    <Text style={styles.ratingValue}>4.9</Text>
                </View>
            </View>
          </View>

          {/* Lessons List */}
          <View style={styles.lessonsSection}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="book-outline" size={16} color="#F18F34" /> Lecciones ({lessons.length})
            </Text>
            <View style={styles.lessonsList}>
              {lessonsLoading ? (
                <ActivityIndicator color="#F18F34" style={{ paddingVertical: 24 }} />
              ) : (<>{lessons.map((lesson) => (
                <View key={lesson.id} style={styles.lessonItemContainer}>
                  <Pressable
                    onPress={() => lesson.status !== 'locked' && toggleLesson(lesson.id)}
                    style={[
                        styles.lessonItem,
                        expandedLessonId === lesson.id && styles.lessonItemActive,
                        lesson.status === 'locked' && { opacity: 0.5 },
                    ]}
                  >
                    <View style={[styles.lessonNumber, lesson.status === 'completed' && { backgroundColor: '#10B981' }]}>
                      {lesson.status === 'completed' ? (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      ) : (
                        <Text style={styles.lessonNumberText}>{lesson.order}</Text>
                      )}
                    </View>
                    <View style={styles.lessonDetails}>
                      <Text style={styles.lessonTitle} numberOfLines={expandedLessonId === lesson.id ? undefined : 1}>{lesson.title}</Text>
                      <Text style={styles.lessonSubtitle} numberOfLines={expandedLessonId === lesson.id ? undefined : 1}>{lesson.description ?? ''}</Text>
                    </View>
                    <View style={styles.lessonMeta}>
                      {lesson.status === 'locked' ? (
                        <Ionicons name="lock-closed" size={14} color="#4B5563" />
                      ) : (
                        <Ionicons name="play" size={12} color="#4B5563" />
                      )}
                    </View>
                  </Pressable>

                  {/* Expanded Content */}
                  {expandedLessonId === lesson.id && (
                    <View style={styles.expandedContent}>
                        {lesson.video_url && (
                          <Pressable onPress={() => setPlayingVideoUrl(lesson.video_url)} style={styles.videoMock}>
                              <Image source={{ uri: course.banner_url || imageUrl }} style={styles.videoThumb} />
                              <View style={styles.videoOverlay}>
                                  <View style={styles.videoPlayBtn}>
                                      <Ionicons name="play" size={24} color="white" style={{ marginLeft: 3 }} />
                                  </View>
                              </View>
                          </Pressable>
                        )}
                        {lesson.status === 'available' && (
                          <Pressable
                            style={styles.completeBtn}
                            onPress={() => handleComplete(lesson.id)}
                            disabled={completing === lesson.id}
                          >
                            {completing === lesson.id ? (
                              <ActivityIndicator size="small" color="#34D399" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-circle-outline" size={16} color="#34D399" />
                                <Text style={styles.completeBtnText}>Marcar como completada</Text>
                              </>
                            )}
                          </Pressable>
                        )}
                        {lesson.status === 'completed' && (
                          <View style={[styles.completeBtn, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                            <Text style={[styles.completeBtnText, { color: '#10B981' }]}>Completada</Text>
                          </View>
                        )}
                    </View>
                  )}
                </View>
              ))}</>)}
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
                        No es un examen. Es una sesión práctica con Coach <Text style={{ color: 'white', fontWeight: 'bold' }}>{course.coach_name || 'tu entrenador'}</Text> donde pones en práctica lo aprendido. Sin presión, solo aprendizaje real.
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
                        Al certificarte, recibes <Text style={{ color: '#F18F34', fontWeight: 'bold' }}>50% dto.</Text> en tu primera mensualidad de clases en {course.club_name || 'el club'}
                    </Text>
                </View>

                <View style={styles.lockBox}>
                    {lessons.length > 0 && lessons.every(l => l.status === 'completed') ? (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={[styles.lockText, { color: '#10B981' }]}>Desbloqueado</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.lockText}>Completa las {lessons.length} lecciones para desbloquear</Text>
                        <Text style={styles.lockSubText}>{Math.max(0, lessons.length - lessons.filter(l => l.status === 'completed').length)} lecciones restantes</Text>
                      </>
                    )}
                </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Video Player Fullscreen */}
      {playingVideoUrl && (
        <CourseVideoPlayer
          videoUrl={playingVideoUrl}
          onClose={() => setPlayingVideoUrl(null)}
        />
      )}

      {/* Floating Bottom Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        {(() => {
          const completedCount = lessons.filter(l => l.status === 'completed').length;
          const nextLesson = lessons.find(l => l.status === 'available');
          const allDone = lessons.length > 0 && completedCount === lessons.length;

          if (allDone) {
            return (
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.startBtn}>
                <View style={styles.startBtnInner}>
                  <Ionicons name="school" size={20} color="white" />
                  <Text style={styles.startBtnText}>Pedir clase practica</Text>
                </View>
              </LinearGradient>
            );
          }

          return (
            <LinearGradient colors={["#F18F34", "#E95F32"]} style={styles.startBtn}>
              <Pressable
                style={styles.startBtnInner}
                onPress={() => { if (nextLesson) toggleLesson(nextLesson.id); }}
              >
                <Ionicons name="play" size={20} color="white" />
                <Text style={styles.startBtnText}>
                  {completedCount > 0 ? `Continuar (${completedCount}/${lessons.length})` : 'Empezar curso'}
                </Text>
              </Pressable>
            </LinearGradient>
          );
        })()}
      </View>
    </View>
  );
}

function CourseVideoPlayer({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) {
  const [dims, setDims] = useState(Dimensions.get('window'));
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const dimSub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    // Desbloquear orientación al abrir video
    let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
    import('expo-screen-orientation').then((mod) => {
      ScreenOrientation = mod;
      mod.unlockAsync();
    });
    return () => {
      dimSub.remove();
      // Restaurar portrait al cerrar video
      ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  useEffect(() => {
    const sub = player.addListener('playToEnd', onClose);
    return () => sub.remove();
  }, [player, onClose]);

  const isLandscape = dims.width > dims.height;

  return (
    <View style={courseVideoStyles.root}>
      <VideoView
        player={player}
        style={courseVideoStyles.video}
        nativeControls={true}
        fullscreenOptions={{ enable: false }}
        contentFit="contain"
      />
      <Pressable onPress={onClose} hitSlop={8} style={[courseVideoStyles.closeBtn, isLandscape && { top: 16, left: 16 }]}>
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

const courseVideoStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 100,
    justifyContent: 'center',
  },
  video: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});

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
