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
import { submitDailyLesson, type AnswerPayload, type SubmitLessonResponse } from '../api/dailyLessons';
import { QuestionCard } from '../components/learning/QuestionCard';
import { VideoPlayer } from '../components/learning/VideoPlayer';
import { Skeleton } from '../components/ui/Skeleton';

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

export function DailyLessonScreen({ onBack, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { questions, alreadyCompleted, loading, error } = useDailyLesson(TIMEZONE);
  const streak = useStreak();

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerPayload[]>([]);
  const [failedIndices, setFailedIndices] = useState<number[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [results, setResults] = useState<SubmitLessonResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showingVideo, setShowingVideo] = useState(false);

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

  // Cleanup de timers al desmontar
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // Animacion de entrada en intro
  useEffect(() => {
    if (phase === 'intro') {
      introOpacity.setValue(0);
      introScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(introOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(introScale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
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
    setSubmitting(true);
    setSubmitError(null);
    const res = await submitDailyLesson(session?.access_token, TIMEZONE, answersToSend);
    if (res.ok && 'session' in res) {
      setResults(res as SubmitLessonResponse);
      setPhase('results');
    } else {
      setSubmitError('error' in res ? res.error : 'Error al enviar');
      setPhase('results');
    }
    setSubmitting(false);
  }, [session?.access_token]);

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
        // Fin de preguntas
        if (updatedFailed.length > 0) {
          setPhase('review');
          setReviewIndex(0);
          animateProgressTo(0);
        } else {
          doSubmit(updatedAnswers);
        }
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

  const startQuestionOrVideo = useCallback((index: number) => {
    const q = questions[index];
    if (q?.has_video && q.video_url) {
      setShowingVideo(true);
    } else {
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }
  }, [questions]);

  const handleVideoEnd = useCallback(() => {
    setShowingVideo(false);
    questionStartTime.current = Date.now();
  }, []);

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

        {/* Question con fade */}
        <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
          <ScrollView
            contentContainerStyle={[styles.questionContent, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
          >
            <QuestionCard
              key={`${qIndex}-${isReview ? 'r' : 'q'}`}
              question={question}
              onAnswered={isReview ? handleReviewAnswered : handleQuestionAnswered}
            />
          </ScrollView>
        </Animated.View>

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
    const title = pct >= 80 ? 'Excelente!' : pct >= 60 ? 'Bien hecho!' : 'Sigue practicando!';

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
          <Text style={styles.resultsSubtitle}>Leccion completada</Text>

          <View style={styles.metricsCard}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{results.session.score}</Text>
              <Text style={styles.metricLabel}>PUNTOS</Text>
            </View>
            <View style={[styles.metricItem, styles.metricXp]}>
              <Text style={styles.metricValueXp}>{results.session.xp_earned}</Text>
              <Text style={styles.metricLabel}>XP</Text>
            </View>
            <View style={[styles.metricItem, styles.metricCorrect]}>
              <Text style={styles.metricValueCorrect}>
                {results.session.correct_count}/{results.session.total_count}
              </Text>
              <Text style={styles.metricLabel}>CORRECTAS</Text>
            </View>
          </View>

          {results.streak.current > 0 && (
            <View style={styles.streakResultCard}>
              <Ionicons name="flame" size={20} color="#F97316" />
              <View style={styles.streakResultInfo}>
                <Text style={styles.streakResultValue}>{results.streak.current} dias</Text>
                <Text style={styles.streakResultLabel}>Racha actual</Text>
              </View>
              {results.streak.xp_bonus > 0 && (
                <View style={styles.bonusBadge}>
                  <Text style={styles.bonusText}>+{results.streak.xp_bonus} XP bonus</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen</Text>
            {results.results.map((r, i) => (
              <View key={r.question_id} style={styles.summaryRow}>
                <View style={[styles.summaryIcon, r.correct ? styles.summaryIconCorrect : styles.summaryIconIncorrect]}>
                  <Ionicons name={r.correct ? 'checkmark' : 'close'} size={14} color={r.correct ? '#10B981' : '#EF4444'} />
                </View>
                <Text style={styles.summaryText} numberOfLines={1}>Pregunta {i + 1}</Text>
                <Text style={styles.summaryPoints}>{r.points} pts</Text>
              </View>
            ))}
          </View>

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
  introIconWrap: { marginBottom: 24 },
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, gap: 12, width: '100%', marginBottom: 16,
  },
  streakResultInfo: { flex: 1 },
  streakResultValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  streakResultLabel: { color: '#6B7280', fontSize: 11 },
  bonusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(241,143,52,0.1)', borderWidth: 1, borderColor: 'rgba(241,143,52,0.2)' },
  bonusText: { color: '#F18F34', fontSize: 11, fontWeight: '700' },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 16, width: '100%', marginBottom: 24,
  },
  summaryTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  summaryIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryIconCorrect: { backgroundColor: 'rgba(16,185,129,0.2)' },
  summaryIconIncorrect: { backgroundColor: 'rgba(239,68,68,0.2)' },
  summaryText: { flex: 1, color: '#9CA3AF', fontSize: 12 },
  summaryPoints: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  continueButton: { width: '100%' },
  continueGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  continueText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
