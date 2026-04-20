import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useDailyLesson, useStreak } from '../hooks/useDailyLesson';
import { submitDailyLesson, type AnswerPayload, type SubmitLessonResponse, type QuestionArea, type DailyLessonQuestion } from '../api/dailyLessons';
import { fetchMyCoachAssessment } from '../api/coachAssessment';
import { QuestionCard } from '../components/learning/QuestionCard';
import { VideoPlayer } from '../components/learning/VideoPlayer';
import { Skeleton } from '../components/ui/Skeleton';
import { LessonImpactRadar, type SkillValues } from '../components/learning/LessonImpactRadar';

type Props = {
  onBack: () => void;
  onComplete: () => void;
};

type Phase = 'intro' | 'questions' | 'review' | 'results';

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const AREA_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  technique: { label: 'Tecnica', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
  tactics: { label: 'Tactica', color: '#A855F7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)' },
  physical: { label: 'Fisico', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)' },
  mental_vocabulary: { label: 'Vocabulario', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
};

// Mapeo areas del modulo learning -> skills del coachAssessment
const AREA_TO_SKILL: Record<QuestionArea, keyof SkillValues> = {
  technique: 'technical',
  tactics: 'tactical',
  physical: 'physical',
  mental_vocabulary: 'mental',
};

// Skills por defecto si el jugador no tiene coachAssessment
const DEFAULT_SKILLS: SkillValues = { technical: 25, physical: 25, mental: 25, tactical: 25 };

// Umbrales de racha para siguiente bonus (sincronizados con getMultiplier del backend)
const STREAK_THRESHOLDS = [3, 8, 21, 46] as const;

function getNextStreakMilestone(current: number): number | null {
  for (const threshold of STREAK_THRESHOLDS) {
    if (current < threshold) return threshold - current;
  }
  return null; // ya en el maximo
}

function getQuestionPreview(q: DailyLessonQuestion): string {
  const c = q.content as Record<string, unknown>;
  if (q.type === 'match_columns') return 'Empareja los elementos';
  if (q.type === 'order_sequence') {
    return typeof c.instruction === 'string' && c.instruction
      ? c.instruction
      : 'Ordena la secuencia';
  }
  return typeof c.question === 'string' ? c.question : 'Pregunta';
}

export function DailyLessonScreen({ onBack, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { questions, alreadyCompleted, loading, error } = useDailyLesson(TIMEZONE);
  const streak = useStreak(TIMEZONE);

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerPayload[]>([]);
  const [failedIndices, setFailedIndices] = useState<number[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [results, setResults] = useState<SubmitLessonResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showingVideo, setShowingVideo] = useState(false);
  const [baseSkills, setBaseSkills] = useState<SkillValues>(DEFAULT_SKILLS);
  const [questionVotes, setQuestionVotes] = useState<Record<string, 'up' | 'down' | null>>({});

  // Refs para timers y animaciones
  const questionStartTime = useRef(Date.now());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const flashColorRef = useRef('#10B981');
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.9)).current;
  const introOpacity = useRef(new Animated.Value(0)).current;
  const resultsScale = useRef(new Animated.Value(0.95)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.15)).current;

  // Cleanup de timers al desmontar
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // Animacion de entrada en intro + breathe glow
  useEffect(() => {
    if (phase === 'intro') {
      introOpacity.setValue(0);
      introScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(introOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(introScale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();

      // Breathe glow animation
      const breathe = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(glowScale, { toValue: 1.3, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(glowScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(glowOpacity, { toValue: 0.25, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0.1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ]),
      );
      breathe.start();
      return () => breathe.stop();
    }
  }, [phase]);

  // Animacion de entrada en results
  useEffect(() => {
    if (phase === 'results') {
      resultsOpacity.setValue(0);
      resultsScale.setValue(0.95);
      Animated.parallel([
        Animated.timing(resultsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(resultsScale, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  // Cargar skills base desde coachAssessment al entrar en results
  useEffect(() => {
    if (phase !== 'results' || !session?.access_token) return;
    let mounted = true;
    fetchMyCoachAssessment(session.access_token).then((assessment) => {
      if (!mounted) return;
      if (assessment?.skills) {
        setBaseSkills({
          technical: assessment.skills.technical,
          physical: assessment.skills.physical,
          mental: assessment.skills.mental,
          tactical: assessment.skills.tactical,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, [phase, session?.access_token]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const animateProgressTo = useCallback((target: number) => {
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const showFlash = useCallback((correct: boolean) => {
    flashColorRef.current = correct ? '#10B981' : '#EF4444';
    flashOpacity.setValue(0.3);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  const fadeQuestion = useCallback((onDone: () => void) => {
    Animated.sequence([
      Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    // Ejecutar el cambio en el punto medio del fade
    setTimeout(onDone, 150);
  }, [contentOpacity]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const doSubmit = useCallback(async (answersToSend: AnswerPayload[]) => {
    // Si ya completó hoy, mostrar resultados locales sin llamar al backend
    if (alreadyCompleted) {
      const correctCount = answersToSend.filter((_, i) => !failedIndices.includes(i)).length;
      const totalScore = correctCount * 100;
      setResults({
        ok: true,
        session: { id: 'repeat', correct_count: correctCount, total_count: answersToSend.length, score: totalScore, xp_earned: 0, completed_at: new Date().toISOString() },
        streak: {
          current: streak.currentStreak,
          longest: streak.longestStreak,
          multiplier: streak.multiplier,
          xp_base: 0,
          xp_bonus: 0,
        },
        shared_streaks: [],
        results: answersToSend.map((a, i) => ({ question_id: a.question_id, correct: !failedIndices.includes(i), correct_answer: null, points: failedIndices.includes(i) ? 0 : 100 })),
      });
      setPhase('results');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    const res = await submitDailyLesson(session?.access_token, TIMEZONE, answersToSend);
    if (res.ok && 'session' in res) {
      setResults(res as SubmitLessonResponse);
      setPhase('results');
    } else {
      setSubmitError(('error' in res && res.error) ? res.error : 'Error al enviar');
      setPhase('results');
    }
    setSubmitting(false);
  }, [session?.access_token, alreadyCompleted, failedIndices, streak.currentStreak, streak.longestStreak, streak.multiplier]);

  const startQuestionOrVideo = useCallback((index: number) => {
    const q = questions[index];
    if (q?.has_video && q.video_url) {
      setShowingVideo(true);
    } else {
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }
  }, [questions]);

  const handleQuestionAnswered = useCallback((correct: boolean, selectedAnswer: unknown) => {
    const elapsed = Date.now() - questionStartTime.current;
    const q = questions[currentIndex];

    const newAnswer: AnswerPayload = {
      question_id: q.id,
      selected_answer: selectedAnswer,
      response_time_ms: elapsed,
    };

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);

    const updatedFailed = correct ? failedIndices : [...failedIndices, currentIndex];
    setFailedIndices(updatedFailed);

    showFlash(correct);

    // Cancelar timer anterior si existe
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    advanceTimer.current = setTimeout(() => {
      const nextIndex = currentIndex + 1;
      if (nextIndex < questions.length) {
        fadeQuestion(() => {
          setCurrentIndex(nextIndex);
          animateProgressTo(nextIndex / questions.length);
          startQuestionOrVideo(nextIndex);
        });
      } else {
        // Fin de preguntas — siempre ir a results
        doSubmit(updatedAnswers);
      }
    }, 2200);
  }, [currentIndex, questions, answers, failedIndices, showFlash, fadeQuestion, animateProgressTo, doSubmit, startQuestionOrVideo]);

  const handleReviewAnswered = useCallback((_correct: boolean, _selectedAnswer: unknown) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    advanceTimer.current = setTimeout(() => {
      const nextReview = reviewIndex + 1;
      if (nextReview < failedIndices.length) {
        fadeQuestion(() => {
          setReviewIndex(nextReview);
          animateProgressTo(nextReview / failedIndices.length);
          startQuestionOrVideo(failedIndices[nextReview]);
        });
      } else {
        doSubmit(answers);
      }
    }, 2200);
  }, [reviewIndex, failedIndices, answers, fadeQuestion, animateProgressTo, doSubmit, startQuestionOrVideo]);

  const handleVideoEnd = useCallback(() => {
    setTimeout(() => {
      contentOpacity.setValue(1);
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }, 50);
  }, [contentOpacity]);

  const handleStart = () => {
    setPhase('questions');
    setCurrentIndex(0);
    setAnswers([]);
    setFailedIndices([]);
    setReviewIndex(0);
    setResults(null);
    setSubmitError(null);
    animateProgressTo(0);
    // Mostrar video si la primera pregunta tiene uno
    const firstQ = questions[0];
    if (firstQ?.has_video && firstQ.video_url) {
      setShowingVideo(true);
    } else {
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER: Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Skeleton width={200} height={24} variant="dark" borderRadius={8} />
          <Skeleton width={150} height={16} variant="dark" borderRadius={8} style={{ marginTop: 12 }} />
          <Skeleton width="80%" height={48} variant="dark" borderRadius={16} style={{ marginTop: 32 }} />
        </View>
      </View>
    );
  }

  if (error || questions.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.errorText}>{error ?? 'No hay preguntas disponibles'}</Text>
          <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Volver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Intro
  // ---------------------------------------------------------------------------
  if (phase === 'intro') {
    const areas = [...new Set(questions.map((q) => q.area))];
    const multiplierText = streak.multiplier > 0 ? `x${(1 + streak.multiplier).toFixed(1)} XP` : null;

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Animated.ScrollView
          contentContainerStyle={styles.introContent}
          style={{ opacity: introOpacity, transform: [{ scale: introScale }] }}
        >
          <View style={styles.introIconWrap}>
            <Animated.View style={[
              styles.introGlow,
              {
                backgroundColor: alreadyCompleted ? '#10B981' : '#F18F34',
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]} />
            <LinearGradient
              colors={alreadyCompleted ? ['#10B981', '#059669'] : ['#F18F34', '#FFB347']}
              style={styles.introIcon}
            >
              <Ionicons name={alreadyCompleted ? 'reload' : 'flame'} size={48} color="#fff" />
            </LinearGradient>
          </View>

          {alreadyCompleted && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark" size={12} color="#10B981" />
              <Text style={styles.completedBadgeText}>Completada hoy</Text>
            </View>
          )}

          <Text style={styles.introTitle}>
            {alreadyCompleted ? 'Repetir leccion' : 'Leccion del dia'}
          </Text>
          <Text style={styles.introSubtitle}>
            {alreadyCompleted ? 'Las mismas 5 preguntas sin recompensas' : '5 preguntas ~ 3 minutos'}
          </Text>

          {streak.currentStreak > 0 && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={16} color="#F97316" />
              <Text style={styles.streakText}>{streak.currentStreak} dias de racha</Text>
              {multiplierText && <Text style={styles.multiplierText}>{multiplierText}</Text>}
            </View>
          )}

          <View style={styles.topicBadges}>
            {areas.map((area) => {
              const info = AREA_LABELS[area];
              if (!info) return null;
              return (
                <View key={area} style={[styles.topicBadge, { backgroundColor: info.bg, borderColor: info.border }]}>
                  <Text style={[styles.topicBadgeText, { color: info.color }]}>{info.label}</Text>
                </View>
              );
            })}
          </View>

          <Pressable onPress={handleStart} style={styles.startButton}>
            <LinearGradient
              colors={alreadyCompleted ? ['#10B981', '#059669'] : ['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startGradient}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.startText}>Empezar</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Animated.ScrollView>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Questions / Review
  // ---------------------------------------------------------------------------
  if (phase === 'questions' || phase === 'review') {
    const isReview = phase === 'review';
    const qIndex = isReview ? failedIndices[reviewIndex] : currentIndex;
    const question = questions[qIndex];
    const progressTarget = isReview
      ? (reviewIndex + 1) / failedIndices.length
      : (currentIndex + 1) / questions.length;
    const counter = isReview
      ? `${reviewIndex + 1}/${failedIndices.length}`
      : `${currentIndex + 1}/${questions.length}`;

    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Flash overlay */}
        <Animated.View
          pointerEvents="none"
          style={[styles.flash, { backgroundColor: flashColorRef.current, opacity: flashOpacity }]}
        />

        {/* Video player fullscreen */}
        {showingVideo && question.has_video && question.video_url && (
          <VideoPlayer
            videoUrl={question.video_url}
            area={question.area}
            counter={counter}
            clubName={question.club_name}
            clubCity={question.club_city}
            isReview={isReview}
            onVideoEnd={handleVideoEnd}
            onSkip={handleVideoEnd}
            onClose={onBack}
          />
        )}

        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.closeButton}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
          </View>

          <View style={styles.counterWrap}>
            {isReview && (
              <View style={styles.reviewBadge}>
                <Ionicons name="reload" size={12} color="#F18F34" />
                <Text style={styles.reviewBadgeText}>Repaso</Text>
              </View>
            )}
            <Text style={styles.counterText}>{counter}</Text>
          </View>
        </View>

        {/* Question con fade — oculta mientras se muestra video */}
        {!showingVideo && (
          <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
            <ScrollView
              contentContainerStyle={[styles.questionContent, { paddingBottom: insets.bottom + 32 }]}
              showsVerticalScrollIndicator={false}
            >
              <QuestionCard
                key={`${qIndex}-${isReview ? 'r' : 'q'}`}
                question={question}
                onAnswered={isReview ? handleReviewAnswered : handleQuestionAnswered}
                onReplayVideo={question.has_video && question.video_url ? () => setShowingVideo(true) : undefined}
              />
            </ScrollView>
          </Animated.View>
        )}

        {submitting && (
          <View style={styles.submittingOverlay}>
            <Text style={styles.submittingText}>Enviando resultados...</Text>
          </View>
        )}
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Results
  // ---------------------------------------------------------------------------
  if (phase === 'results') {
    if (submitError) {
      return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{submitError}</Text>
            <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Volver</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!results) return null;

    const pct = Math.round((results.session.correct_count / results.session.total_count) * 100);
    const title = pct >= 80 ? '¡Excelente!' : pct >= 60 ? '¡Bien hecho!' : '¡Sigue practicando!';

    // Delta por area de esta sesion (1 pto por acierto en la skill correspondiente)
    const deltas: SkillValues = { technical: 0, physical: 0, mental: 0, tactical: 0 };
    questions.forEach((q, idx) => {
      const r = results.results[idx];
      if (r?.correct) {
        deltas[AREA_TO_SKILL[q.area]] += 1;
      }
    });

    const nextMilestone = getNextStreakMilestone(results.streak.current);

    const toggleVote = (questionId: string, vote: 'up' | 'down') => {
      // TODO: persistir cuando se cree endpoint de feedback por pregunta
      setQuestionVotes((prev) => ({
        ...prev,
        [questionId]: prev[questionId] === vote ? null : vote,
      }));
    };

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Animated.ScrollView
          contentContainerStyle={[styles.resultsContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          style={{ opacity: resultsOpacity, transform: [{ scale: resultsScale }] }}
        >
          <View style={styles.trophyWrap}>
            <LinearGradient colors={['#FBBF24', '#D97706']} style={styles.trophyIcon}>
              <Ionicons name="trophy" size={32} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.resultsTitle}>{title}</Text>
          <Text style={styles.resultsSubtitle}>Lección completada</Text>

          <View style={styles.metricsCard}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{pct}%</Text>
              <Text style={styles.metricLabel}>PUNTUACIÓN</Text>
            </View>
            <View style={[styles.metricItem, styles.metricXp]}>
              <Text style={styles.metricValueXp}>+{results.session.xp_earned}</Text>
              <Text style={styles.metricLabel}>PTS. HABILIDAD</Text>
            </View>
            <View style={[styles.metricItem, styles.metricCorrect]}>
              <Text style={styles.metricValueCorrect}>
                {results.session.correct_count}/{results.session.total_count}
              </Text>
              <Text style={styles.metricLabel}>CORRECTAS</Text>
            </View>
          </View>

          <LessonImpactRadar baseSkills={baseSkills} deltas={deltas} />

          {(results.streak.current > 0 || nextMilestone !== null) && (
            <View style={styles.streakResultCard}>
              <View style={styles.streakResultTop}>
                <Ionicons name="flame" size={20} color="#F97316" />
                <View style={styles.streakResultInfo}>
                  <Text style={styles.streakResultValue}>{results.streak.current} días</Text>
                  <Text style={styles.streakResultLabel}>Racha actual</Text>
                </View>
                {results.streak.xp_bonus > 0 && (
                  <View style={styles.bonusBadge}>
                    <Text style={styles.bonusText}>+{results.streak.xp_bonus} XP bonus</Text>
                  </View>
                )}
              </View>
              {nextMilestone !== null && (
                <View style={styles.nextBonusRow}>
                  <Ionicons name="trending-up-outline" size={12} color="#F18F34" />
                  <Text style={styles.nextBonusText}>
                    Siguiente bonus con {nextMilestone} {nextMilestone === 1 ? 'día' : 'días'} más de racha
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen de respuestas</Text>
            {results.results.map((r, i) => {
              const q = questions[i];
              const preview = q ? getQuestionPreview(q) : `Pregunta ${i + 1}`;
              const vote = questionVotes[r.question_id] ?? null;
              return (
                <View key={r.question_id} style={styles.summaryRow}>
                  <View style={[styles.summaryIcon, r.correct ? styles.summaryIconCorrect : styles.summaryIconIncorrect]}>
                    <Ionicons name={r.correct ? 'checkmark' : 'close'} size={14} color={r.correct ? '#10B981' : '#EF4444'} />
                  </View>
                  <Text style={styles.summaryText} numberOfLines={2}>{preview}</Text>
                  <Pressable
                    onPress={() => toggleVote(r.question_id, 'up')}
                    hitSlop={6}
                    style={[styles.voteBtn, vote === 'up' && styles.voteBtnUpActive]}
                  >
                    <Ionicons
                      name={vote === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                      size={14}
                      color={vote === 'up' ? '#10B981' : '#6B7280'}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => toggleVote(r.question_id, 'down')}
                    hitSlop={6}
                    style={[styles.voteBtn, vote === 'down' && styles.voteBtnDownActive]}
                  >
                    <Ionicons
                      name={vote === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                      size={14}
                      color={vote === 'down' ? '#EF4444' : '#6B7280'}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Boton repasar fallos */}
          {failedIndices.length > 0 && (
            <Pressable
              onPress={() => {
                setReviewIndex(0);
                setPhase('review');
                animateProgressTo(0);
                startQuestionOrVideo(failedIndices[0]);
              }}
              style={styles.continueButton}
            >
              <View style={styles.reviewButton}>
                <Ionicons name="reload" size={18} color="#F18F34" />
                <Text style={styles.reviewButtonText}>Repasar fallos ({failedIndices.length})</Text>
              </View>
            </Pressable>
          )}

          <Pressable onPress={onComplete} style={styles.continueButton}>
            <LinearGradient
              colors={['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueGradient}
            >
              <Text style={styles.continueText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </Animated.ScrollView>
      </View>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F0F' },
  flash: { ...StyleSheet.absoluteFillObject, zIndex: 10 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 12 },

  // Intro
  introContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  introIconWrap: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
  introGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    // Simular glow con shadow en iOS y elevation en Android
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 30,
  },
  introIcon: { width: 96, height: 96, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
    backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 12,
  },
  completedBadgeText: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  introTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  introSubtitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 8 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)', marginBottom: 24,
  },
  streakText: { color: '#FB923C', fontSize: 14, fontWeight: '700' },
  multiplierText: { color: 'rgba(249,115,22,0.6)', fontSize: 12 },
  topicBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 32 },
  topicBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  topicBadgeText: { fontSize: 11, fontWeight: '700' },
  startButton: { width: '100%', maxWidth: 280, marginBottom: 16 },
  startGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  startText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  cancelButton: { paddingVertical: 8 },
  cancelText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },

  // Questions
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  closeButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2, backgroundColor: '#F18F34' },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reviewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)',
  },
  reviewBadgeText: { color: '#FB923C', fontSize: 11, fontWeight: '700' },
  questionContent: { paddingHorizontal: 20, paddingTop: 8 },
  submittingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  submittingText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  // Results
  resultsContent: { paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' },
  trophyWrap: { marginBottom: 20 },
  trophyIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resultsTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 4 },
  resultsSubtitle: { color: '#6B7280', fontSize: 12, marginBottom: 24 },
  metricsCard: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 12, gap: 8, width: '100%', marginBottom: 16,
  },
  metricItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  metricXp: { backgroundColor: 'rgba(241,143,52,0.06)', borderWidth: 1, borderColor: 'rgba(241,143,52,0.12)' },
  metricCorrect: { backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.12)' },
  metricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  metricValueXp: { color: '#F18F34', fontSize: 18, fontWeight: '900' },
  metricValueCorrect: { color: '#10B981', fontSize: 18, fontWeight: '900' },
  metricLabel: { color: '#6B7280', fontSize: 9, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  streakResultCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, width: '100%', marginBottom: 16,
  },
  streakResultTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakResultInfo: { flex: 1 },
  streakResultValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  streakResultLabel: { color: '#6B7280', fontSize: 11 },
  bonusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(241,143,52,0.1)', borderWidth: 1, borderColor: 'rgba(241,143,52,0.2)' },
  bonusText: { color: '#F18F34', fontSize: 11, fontWeight: '700' },
  nextBonusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  nextBonusText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 16, width: '100%', marginBottom: 24,
  },
  summaryTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  summaryIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryIconCorrect: { backgroundColor: 'rgba(16,185,129,0.2)' },
  summaryIconIncorrect: { backgroundColor: 'rgba(239,68,68,0.2)' },
  summaryText: { flex: 1, color: '#D1D5DB', fontSize: 12, lineHeight: 16 },
  voteBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  voteBtnUpActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  voteBtnDownActive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  reviewButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(241,143,52,0.2)',
  },
  reviewButtonText: { color: '#F18F34', fontWeight: '700', fontSize: 16 },
  continueButton: { width: '100%', marginBottom: 12 },
  continueGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  continueText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
