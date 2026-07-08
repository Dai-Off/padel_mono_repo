import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useVideoPreloader } from '../hooks/useVideoPreloader';
import { useHomeData } from '../contexts/HomeDataContext';
import { submitDailyLesson, submitLessonFeedback, fetchTodayResults, fetchLocalizedDailyQuestions, type AnswerPayload, type SubmitLessonResponse, type QuestionArea, type DailyLessonQuestion } from '../api/dailyLessons';
import { loadProgress, saveProgress, clearProgress, type DailyLessonProgress } from '../lib/dailyLessonStorage';
import { fetchMyCoachAssessment } from '../api/coachAssessment';
import { QuestionCard } from '../components/learning/QuestionCard';
import { VideoPlayer } from '../components/learning/VideoPlayer';
import { IconGlow } from '../components/ui/IconGlow';
import { LessonImpactRadar, type SkillValues } from '../components/learning/LessonImpactRadar';
import { MissionCelebrationCard } from '../components/seasonPass/MissionCelebrationCard';
import { useTranslation } from '../i18n';

type Props = {
  onBack: () => void;
  onComplete: () => void;
  // Si el usuario no tiene completado el cuestionario de nivelación, esta
  // pantalla se bloquea y el botón "Empezar cuestionario" llama a este callback
  // para llevar al perfil con el modal de onboarding abierto.
  onOpenOnboarding?: () => void;
  /** Abre el pase de temporada (cierra la lección). CTA de la card de resultados. */
  onOpenSeasonPass?: () => void;
};

type Phase = 'intro' | 'questions' | 'review' | 'results';

import { CLUB_IANA_TIMEZONE } from '../lib/clubTimeZone';

const TIMEZONE = CLUB_IANA_TIMEZONE;

// Clave de día calendario en una zona horaria (YYYY-MM-DD). Mismo criterio que
// la card de la Home para decidir si la última lección cae "hoy".
function calendarDayKeyInTimeZone(isoOrNow: Date | string, timeZone: string): string {
  const d = typeof isoOrNow === 'string' ? new Date(isoOrNow) : isoOrNow;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ¿La última lección completada cae hoy en la zona del club? Se usa con la señal
// cacheada (HomeData) para pintar la variante correcta del intro al instante,
// sin esperar al fetch.
function isLessonCompletedToday(lastLessonIso: string | null, timeZone: string): boolean {
  if (lastLessonIso == null || String(lastLessonIso).trim() === '') return false;
  const keyDone = calendarDayKeyInTimeZone(lastLessonIso, timeZone);
  if (!keyDone) return false;
  return keyDone === calendarDayKeyInTimeZone(new Date(), timeZone);
}

const AREA_LABEL_KEYS: Record<string, { labelKey: 'areaTechnique' | 'areaTactics' | 'areaPhysical' | 'areaVocabulary'; color: string; bg: string; border: string }> = {
  technique: { labelKey: 'areaTechnique', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
  tactics: { labelKey: 'areaTactics', color: '#A855F7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)' },
  physical: { labelKey: 'areaPhysical', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)' },
  mental_vocabulary: { labelKey: 'areaVocabulary', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
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

// Umbrales de racha → boost global de SP (sincronizados con el boost engine
// del backend: rachas 3/8/21/46 → +15/30/50/70%).
const STREAK_THRESHOLDS = [3, 8, 21, 46] as const;
const STREAK_BOOST_PCTS = [15, 30, 50, 70] as const;

/** Días que faltan para el siguiente escalón de boost y su %. null si ya al máximo. */
function getNextBoostInfo(current: number): { days: number; pct: number } | null {
  for (let i = 0; i < STREAK_THRESHOLDS.length; i += 1) {
    if (current < STREAK_THRESHOLDS[i]) {
      return { days: STREAK_THRESHOLDS[i] - current, pct: STREAK_BOOST_PCTS[i] };
    }
  }
  return null; // ya en el máximo
}

function getQuestionPreview(q: DailyLessonQuestion, t: (key: string, params?: Record<string, string | number>) => string): string {
  const c = q.content as Record<string, unknown>;
  if (q.type === 'match_columns') return t('learning.questionPreviewMatch');
  if (q.type === 'order_sequence') {
    return typeof c.instruction === 'string' && c.instruction
      ? c.instruction
      : t('learning.questionPreviewOrder');
  }
  if (typeof c.question === 'string' && c.question.trim()) return c.question;
  if (typeof c.statement === 'string' && c.statement.trim()) return c.statement;
  return t('learning.questionPreviewDefault');
}

export function DailyLessonScreen({ onBack, onComplete, onOpenOnboarding, onOpenSeasonPass }: Props) {
  const { t, locale } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { questions: hookQuestions, alreadyCompleted, loading, error, requiresOnboarding, notEnoughQuestions } = useDailyLesson(TIMEZONE);
  const streak = useStreak(TIMEZONE);
  // Señal cacheada (app-level, misma que la card de la Home) de si la lección
  // de hoy ya está completada. Permite pintar la variante correcta del intro
  // desde el primer frame mientras el fetch carga en background.
  const { streak: homeStreak } = useHomeData();

  // Preguntas que se muestran. Por defecto vienen del hook (el algoritmo de
  // selección de hoy). Se sobreescriben en dos casos:
  //  - "Ver resultados": preguntas exactas que ya respondió en su sesión de hoy.
  //  - "Continuar lección" (resume): preguntas guardadas en AsyncStorage cuando
  //    el usuario salió a mitad de la lección. Locked-in para no permitir
  //    rerollear preguntas mal respondidas.
  const [historicQuestions, setHistoricQuestions] = useState<DailyLessonQuestion[] | null>(null);
  const questions = historicQuestions ?? hookQuestions;

  // Snapshot de progreso guardado en local. Si existe, en la intro mostramos
  // "Continuar lección" en vez de "Empezar".
  const [pendingResume, setPendingResume] = useState<DailyLessonProgress | null>(null);

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerPayload[]>([]);
  const [failedIndices, setFailedIndices] = useState<number[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [results, setResults] = useState<SubmitLessonResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showingVideo, setShowingVideo] = useState(false);
  // UI optimista del intro: true si el usuario pulsó "Empezar" antes de que
  // llegara el fetch. Muestra spinner en el botón y arranca al cargar.
  const [pendingStart, setPendingStart] = useState(false);
  const [baseSkills, setBaseSkills] = useState<SkillValues>(DEFAULT_SKILLS);
  const [questionVotes, setQuestionVotes] = useState<Record<string, 'up' | 'down' | null>>({});

  // Cambio de idioma: re-entregamos LAS MISMAS preguntas ya traducidas (por id),
  // conservando orden, ids y progreso. No rebaraja ni reinicia la lección y
  // funciona en cualquier fase. El backend localiza por ids, así que la
  // respuesta correcta (índices/booleans) y el orden no cambian.
  // Secuencia para descartar respuestas obsoletas: si el idioma cambia varias
  // veces seguidas, solo se aplica la última petición lanzada (evita carreras).
  const relocalizeSeqRef = useRef(0);
  // Idioma con el que se cargó la lección del hook (hookQuestions). El hook NO se
  // recarga al cambiar de idioma (para no rebarajar), así que guardamos su idioma
  // para saber si hay que re-localizar al arrancar/repetir una lección.
  const hookLocaleRef = useRef(locale);

  const relocalizeByIds = useCallback(
    async (ids: string[]) => {
      const token = session?.access_token;
      if (!token || ids.length === 0) return;
      const seq = ++relocalizeSeqRef.current;
      const res = await fetchLocalizedDailyQuestions(token, ids, locale);
      // Si entretanto se lanzó otra re-localización (idioma cambiado de nuevo),
      // descartamos esta respuesta para no pisar la más reciente.
      if (seq !== relocalizeSeqRef.current) return;
      if (res.ok && res.questions.length === ids.length) {
        setHistoricQuestions(res.questions);
      }
    },
    [session?.access_token, locale],
  );

  const prevLocaleRef = useRef(locale);
  useEffect(() => {
    if (prevLocaleRef.current === locale) return;
    prevLocaleRef.current = locale;
    const ids = questions.map((q) => q.id);
    if (ids.length > 0) void relocalizeByIds(ids);
  }, [locale, questions, relocalizeByIds]);

  // Precarga de vídeos: bufferiza el vídeo actual y el siguiente por adelantado
  // (incluido el primero durante la intro, ya que activeQIndex=0) para eliminar
  // el frame negro al mostrarlos.
  const videoUrls = useMemo(
    () => questions.map((q) => (q.has_video && q.video_url ? q.video_url : null)),
    [questions],
  );
  const activeQIndex = phase === 'review' ? (failedIndices[reviewIndex] ?? 0) : currentIndex;
  const { getPlayer } = useVideoPreloader(videoUrls, activeQIndex);

  // Refs para envío bulk de votos like/dislike. Mantenemos el state actual en
  // un ref para poder leerlo desde cleanup de useEffect sin closures stale.
  const questionVotesRef = useRef(questionVotes);
  useEffect(() => { questionVotesRef.current = questionVotes; }, [questionVotes]);
  // Flag para no enviar dos veces (al cambiar de fase + al desmontar).
  const votesFlushedRef = useRef(false);
  const tokenRef = useRef<string | null | undefined>(undefined);
  useEffect(() => { tokenRef.current = session?.access_token; }, [session?.access_token]);

  const flushLessonVotes = useCallback(() => {
    if (votesFlushedRef.current) return;
    const votes = Object.entries(questionVotesRef.current)
      .filter(([, v]) => v === 'up' || v === 'down')
      .map(([question_id, vote]) => ({ question_id, vote: vote as 'up' | 'down' }));
    if (votes.length === 0) return;
    votesFlushedRef.current = true;
    submitLessonFeedback(tokenRef.current, votes);
  }, []);

  // Disparo del bulk cuando el usuario sale de la fase results (por ejemplo
  // pulsando "Continuar" o "Repasar fallos"). También al desmontar la pantalla
  // por completo (back del SO, navegación lateral, etc.).
  const lastPhaseRef = useRef(phase);
  useEffect(() => {
    if (lastPhaseRef.current === 'results' && phase !== 'results') {
      flushLessonVotes();
    }
    lastPhaseRef.current = phase;
  }, [phase, flushLessonVotes]);
  useEffect(() => () => { flushLessonVotes(); }, [flushLessonVotes]);

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
  const glowOpacity = useRef(new Animated.Value(0.8)).current;

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
            Animated.timing(glowScale, { toValue: 1.12, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(glowScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(glowOpacity, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0.6, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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

  // Hidratar progreso local al montar. Si el usuario tiene una sesión a
  // medias guardada (sin haber completado las 5), la ofrecemos como "Continuar".
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    loadProgress(uid, TIMEZONE).then((snap) => {
      if (snap && snap.answers.length < snap.questions.length) {
        setPendingResume(snap);
      }
    });
  }, [session?.user?.id]);

  // Si el backend dice que ya está completa (otro dispositivo, otra ruta), el
  // snapshot local queda obsoleto: lo limpiamos para no ofrecer "Continuar"
  // sobre una lección que ya cerró por otra vía.
  useEffect(() => {
    const uid = session?.user?.id;
    if (alreadyCompleted && uid) {
      clearProgress(uid, TIMEZONE);
      setPendingResume(null);
    }
  }, [alreadyCompleted, session?.user?.id]);

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
    // Sea cual sea el resultado del submit, el snapshot local ya no aporta:
    // o la lección se completó, o falló y al reabrir queremos que el usuario
    // pueda intentarlo de nuevo desde cero (sin "Continuar" colgado).
    if (session?.user?.id) {
      clearProgress(session.user.id, TIMEZONE);
    }
    setPendingResume(null);

    // Si ya completó hoy, mostrar resultados locales sin llamar al backend
    if (alreadyCompleted) {
      const correctCount = answersToSend.filter((_, i) => !failedIndices.includes(i)).length;
      const totalScore = correctCount * 100;
      setResults({
        ok: true,
        session: { id: 'repeat', correct_count: correctCount, total_count: answersToSend.length, score: totalScore, completed_at: new Date().toISOString() },
        streak: {
          current: streak.currentStreak,
          longest: streak.longestStreak,
        },
        shared_streaks: [],
        season_pass: null,
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
      setSubmitError(('error' in res && res.error) ? res.error : t('learning.dailyLessonSubmitError'));
      setPhase('results');
    }
    setSubmitting(false);
  }, [session?.access_token, session?.user?.id, alreadyCompleted, failedIndices, streak.currentStreak, streak.longestStreak, t]);

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

    // Guard contra doble-disparo: si el usuario hace doble-tap rápido en
    // Confirmar antes de que React procese el setState que deshabilita el
    // botón, el handler puede ejecutarse dos veces sincrónicas con el mismo
    // question_id. Eso provocaba 6 filas en el resumen (5 + 1 duplicada) y
    // un warning de React por keys repetidas.
    if (answers.some((a) => a.question_id === q.id)) return;

    const newAnswer: AnswerPayload = {
      question_id: q.id,
      selected_answer: selectedAnswer,
      response_time_ms: elapsed,
    };

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);

    const updatedFailed = correct ? failedIndices : [...failedIndices, currentIndex];
    setFailedIndices(updatedFailed);

    // Guardar snapshot tras cada respuesta. Si el usuario sale, "Continuar"
    // restaurará exactamente este estado en el próximo arranque.
    if (session?.user?.id) {
      saveProgress(session.user.id, TIMEZONE, {
        questions,
        answers: updatedAnswers,
        failedIndices: updatedFailed,
        currentIndex: currentIndex + 1,
        startedAt: new Date().toISOString(),
      });
    }

    showFlash(correct);

    // Cancelar timer anterior si existe
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    // Delay antes de avanzar a la siguiente pregunta.
    // - Tipos sencillos (test_classic, true_false, etc.): 2200 ms basta para
    //   leer el feedback y el flash de acierto/fallo.
    // - Puzzle: la animación de confirmation_frame puede durar 1500 ms o más,
    //   y además hay que leer la explicación. Calculamos
    //   max(2200, duration_ms_del_confirm_de_la_opcion_elegida + 2500) para
    //   dar tiempo a ver la jugada completa + leer.
    let advanceDelayMs = 2200;
    if (q.type === 'puzzle') {
      const content = q.content as {
        options?: { id: number; confirmation_frame?: { duration_ms?: number } }[];
      };
      const optionId = (selectedAnswer as { option_id?: number })?.option_id;
      const opt = content?.options?.find((o) => o.id === optionId);
      const confirmDur = opt?.confirmation_frame?.duration_ms ?? 1500;
      advanceDelayMs = Math.max(2200, confirmDur + 2500);
    }

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
    }, advanceDelayMs);
  }, [currentIndex, questions, answers, failedIndices, showFlash, fadeQuestion, animateProgressTo, doSubmit, startQuestionOrVideo, session?.user?.id]);

  const handleReviewAnswered = useCallback((_correct: boolean, selectedAnswer: unknown) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);

    // Mismo cálculo de delay que en handleQuestionAnswered: puzzle necesita más
    // tiempo para que se vea la animación de confirm + se lea la explicación.
    const q = questions[failedIndices[reviewIndex]];
    let advanceDelayMs = 2200;
    if (q?.type === 'puzzle') {
      const content = q.content as {
        options?: { id: number; confirmation_frame?: { duration_ms?: number } }[];
      };
      const optionId = (selectedAnswer as { option_id?: number })?.option_id;
      const opt = content?.options?.find((o) => o.id === optionId);
      const confirmDur = opt?.confirmation_frame?.duration_ms ?? 1500;
      advanceDelayMs = Math.max(2200, confirmDur + 2500);
    }

    advanceTimer.current = setTimeout(() => {
      const nextReview = reviewIndex + 1;
      if (nextReview < failedIndices.length) {
        fadeQuestion(() => {
          setReviewIndex(nextReview);
          animateProgressTo(nextReview / failedIndices.length);
          startQuestionOrVideo(failedIndices[nextReview]);
        });
      } else {
        // Repaso terminado. Las respuestas del repaso son solo práctica — la
        // lección ya se envió al backend al terminar el primer paso. Volver a
        // submit dispararía "Ya completaste la lección de hoy". Solo volvemos
        // a la pantalla de resultados (los resultados originales siguen en state).
        fadeQuestion(() => {
          setPhase('results');
        });
      }
    }, advanceDelayMs);
  }, [reviewIndex, failedIndices, questions, fadeQuestion, animateProgressTo, startQuestionOrVideo]);

  const handleVideoEnd = useCallback(() => {
    setTimeout(() => {
      contentOpacity.setValue(1);
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }, 50);
  }, [contentOpacity]);

  // Carga los resultados de la sesión de hoy y va directo a la pantalla de
  // resultados. Reconstruye también `questions` y `failedIndices` para que la
  // pantalla y el botón "Repasar fallos" funcionen idénticos al flujo normal.
  const handleViewResults = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetchTodayResults(session?.access_token, TIMEZONE);
      if (!res.ok) {
        setSubmitError(('error' in res && res.error) ? res.error : t('learning.dailyLessonResultsLoadError'));
        setSubmitting(false);
        return;
      }
      // Las preguntas históricas reemplazan a las del hook (puede que el
      // algoritmo elija otras hoy al repetir).
      setHistoricQuestions(res.questions);
      // failedIndices se reconstruye desde los results (posiciones donde correct=false).
      const failed = res.results
        .map((r, i) => (r.correct ? -1 : i))
        .filter((i) => i >= 0);
      setFailedIndices(failed);
      setResults(res);
      setPhase('results');
    } catch {
      setSubmitError(t('learning.dailyLessonResultsLoadError'));
    } finally {
      setSubmitting(false);
    }
  }, [session?.access_token, t]);

  // Arranque real de la lección (asume preguntas ya cargadas).
  const startLessonNow = useCallback(() => {
    setPendingStart(false);
    setPhase('questions');
    setCurrentIndex(0);
    setAnswers([]);
    setFailedIndices([]);
    setReviewIndex(0);
    setResults(null);
    setSubmitError(null);
    // Si veníamos de "Ver resultados", limpiamos las preguntas históricas
    // para que la repetición use las del hook (algoritmo del día).
    setHistoricQuestions(null);
    // Si había progreso guardado (raro: solo si el usuario tira "Empezar" en
    // vez de "Continuar"; hoy no exponemos esa vía, pero por defensa).
    setPendingResume(null);
    animateProgressTo(0);
    // Guardar snapshot inicial. Si el usuario sale ahora mismo, al volver verá
    // "Continuar" con las preguntas del hook ya cacheadas.
    if (session?.user?.id && hookQuestions.length > 0 && !alreadyCompleted) {
      saveProgress(session.user.id, TIMEZONE, {
        questions: hookQuestions,
        answers: [],
        failedIndices: [],
        currentIndex: 0,
        startedAt: new Date().toISOString(),
      });
    }
    // Mostrar video si la primera pregunta tiene uno
    const firstQ = questions[0];
    if (firstQ?.has_video && firstQ.video_url) {
      setShowingVideo(true);
    } else {
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }
    // Si el idioma cambió desde que se cargó la lección del hook, re-entregamos
    // las MISMAS preguntas (mismos ids) ya traducidas al idioma actual. Sin esto,
    // arrancar/repetir tras cambiar idioma en la intro jugaría en el idioma viejo.
    if (hookLocaleRef.current !== locale && hookQuestions.length > 0) {
      void relocalizeByIds(hookQuestions.map((q) => q.id));
    }
  }, [animateProgressTo, session?.user?.id, hookQuestions, alreadyCompleted, questions, locale, relocalizeByIds]);

  // UI optimista: si el usuario pulsa "Empezar" antes de que llegue el fetch,
  // marcamos la intención y mostramos spinner; el efecto de abajo arranca en
  // cuanto las preguntas están listas.
  const handleStart = useCallback(() => {
    if (loading || questions.length === 0) {
      setPendingStart(true);
      return;
    }
    startLessonNow();
  }, [loading, questions.length, startLessonNow]);

  useEffect(() => {
    if (!pendingStart || loading) return;
    if (questions.length > 0) {
      startLessonNow();
    } else {
      // No hay lección disponible (error/sin preguntas): la pantalla ya muestra
      // ese estado, así que solo limpiamos la intención.
      setPendingStart(false);
    }
  }, [pendingStart, loading, questions.length, startLessonNow]);

  // Reanudar una lección a medias: usa las preguntas y respuestas guardadas.
  // No se permite volver atrás en las preguntas ya contestadas (anti-cheat).
  const handleResume = () => {
    if (!pendingResume) return;
    setHistoricQuestions(pendingResume.questions);
    setAnswers(pendingResume.answers);
    setFailedIndices(pendingResume.failedIndices);
    setCurrentIndex(pendingResume.currentIndex);
    setReviewIndex(0);
    setResults(null);
    setSubmitError(null);
    setPhase('questions');
    animateProgressTo(pendingResume.currentIndex / pendingResume.questions.length);
    const q = pendingResume.questions[pendingResume.currentIndex];
    if (q?.has_video && q.video_url) {
      setShowingVideo(true);
    } else {
      setShowingVideo(false);
      questionStartTime.current = Date.now();
    }
    // El progreso guardado conserva las preguntas en el idioma con que se inició.
    // Si el idioma cambió mientras estaba guardada, re-entregamos las MISMAS
    // preguntas (mismo orden/ids) ya traducidas al idioma actual.
    prevLocaleRef.current = locale;
    void relocalizeByIds(pendingResume.questions.map((rq) => rq.id));
  };

  // Nota: no hay gate de loading a pantalla completa. El intro se renderiza al
  // instante (UI optimista) y el fetch carga en background; los estados de
  // borde (onboarding / sin preguntas / error) solo aplican cuando el fetch ya
  // resolvió (todos son false mientras loading).

  // ---------------------------------------------------------------------------
  // RENDER: Bloqueado por falta de cuestionario de nivelación
  // ---------------------------------------------------------------------------
  if (requiresOnboarding) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.lockedContainer}>
          {/* Icono superior: candado grande en doble círculo gris/apagado.
              Doble círculo = halo exterior translúcido + círculo interior con
              borde y fondo. La paleta gris transmite "bloqueado/inactivo". */}
          <View style={styles.lockOuterCircle}>
            <View style={styles.lockInnerCircle}>
              <Ionicons name="lock-closed" size={42} color="#9CA3AF" />
            </View>
          </View>

          {/* Icono feature: identifica la sección sin gritar. Naranja pequeño
              debajo del candado para conservar el código de color de marca. */}
          <View style={styles.featureIconBadge}>
            <Ionicons name="flame" size={14} color="#F18F34" />
          </View>

          <Text style={styles.lockedTitle}>{t('onboarding.hardBlockDailyLessonTitle')}</Text>
          <Text style={styles.lockedSubtitle}>
            {t('onboarding.hardBlockDailyLessonSub')}
          </Text>

          <View style={styles.lockedBullets}>
            {(['0', '1', '2'] as const).map((idx) => (
              <View key={idx} style={styles.lockedBullet}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.lockedBulletText}>
                  {t(`onboarding.hardBlockDailyLessonBullets.${idx}`)}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => onOpenOnboarding?.()}
            disabled={!onOpenOnboarding}
            style={styles.lockedCta}
          >
            <LinearGradient
              colors={['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.lockedCtaGradient}
            >
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={styles.lockedCtaText}>{t('onboarding.discoverLevel')}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
            <Text style={styles.cancelText}>{t('onboarding.notNow')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: No hay suficientes preguntas para una lección completa
  // ---------------------------------------------------------------------------
  if (notEnoughQuestions) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.lockedContainer}>
          <View style={styles.lockedIconWrap}>
            <View style={styles.lockedIconGlow}>
              <IconGlow color="#F18F34" size={150} intensity={0.45} />
            </View>
            <LinearGradient colors={['#F18F34', '#d97706']} style={styles.lockedIconCircle}>
              <Ionicons name="hourglass-outline" size={44} color="#FFFFFF" />
            </LinearGradient>
          </View>

          <Text style={styles.lockedTitle}>{t('learning.dailyLessonNotAvailableTitle')}</Text>
          <Text style={styles.lockedSubtitle}>
            {t('learning.dailyLessonNotAvailableSub')}
          </Text>

          <Pressable onPress={onBack} style={styles.lockedCta}>
            <LinearGradient
              colors={['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.lockedCtaGradient}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />
              <Text style={styles.lockedCtaText}>{t('common.back')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!loading && (error || questions.length === 0)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.errorText}>{error ?? t('learning.dailyLessonNoQuestions')}</Text>
          <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
            <Text style={styles.cancelText}>{t('common.back')}</Text>
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
    // Variante "ya completada": mientras carga usamos la señal cacheada de la
    // Home para no parpadear; cuando el fetch resuelve, manda el valor real.
    const showCompleted = loading ? isLessonCompletedToday(homeStreak.lastCompleted, TIMEZONE) : alreadyCompleted;

    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Animated.ScrollView
          contentContainerStyle={styles.introContent}
          style={{ opacity: introOpacity, transform: [{ scale: introScale }] }}
        >
          <View style={styles.introIconWrap}>
            <Animated.View style={[
              styles.introGlow,
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}>
              <IconGlow color={showCompleted ? '#10B981' : '#F18F34'} size={300} />
            </Animated.View>
            <LinearGradient
              colors={showCompleted ? ['#10B981', '#059669'] : ['#F18F34', '#FFB347']}
              style={styles.introIcon}
            >
              <Ionicons name={showCompleted ? 'reload' : 'flame'} size={48} color="#fff" />
            </LinearGradient>
          </View>

          {showCompleted && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark" size={12} color="#10B981" />
              <Text style={styles.completedBadgeText}>{t('learning.dailyLessonCompletedToday')}</Text>
            </View>
          )}

          <Text style={styles.introTitle}>
            {showCompleted ? t('learning.dailyLessonRepeatTitle') : t('learning.dailyLessonTodayTitle')}
          </Text>
          <Text style={styles.introSubtitle}>
            {showCompleted ? t('learning.dailyLessonRepeatSub') : t('learning.dailyLessonTodaySub')}
          </Text>

          {/* Zona de metadatos (racha + temas). Reserva una altura estable para
              que, al llegar los datos, aparezcan en su sitio sin desplazar el
              botón ni recentrar la vista. Sin skeleton: durante la carga el
              espacio queda vacío y el contenido aparece cuando está listo. */}
          <View style={styles.introMeta}>
            {streak.currentStreak > 0 && (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={16} color="#F97316" />
                <Text style={styles.streakText}>{t('learning.dailyLessonStreakDays', { count: streak.currentStreak })}</Text>
              </View>
            )}

            {areas.length > 0 && (
              <View style={styles.topicBadges}>
                {areas.map((area) => {
                  const info = AREA_LABEL_KEYS[area];
                  if (!info) return null;
                  return (
                    <View key={area} style={[styles.topicBadge, { backgroundColor: info.bg, borderColor: info.border }]}>
                      <Text style={[styles.topicBadgeText, { color: info.color }]}>{t(`learning.${info.labelKey}`)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Si la lección ya está hecha, ofrecemos también "Ver resultados"
              (recupera la sesión de hoy sin tener que repetir). El botón
              principal pasa a "Repetir lección" para mantener la jerarquía
              visual del CTA principal en cualquier estado. */}
          {showCompleted && (
            <Pressable
              onPress={handleViewResults}
              disabled={submitting || loading}
              style={styles.startButton}
            >
              <View style={styles.viewResultsButton}>
                <Ionicons name="stats-chart" size={20} color="#10B981" />
                <Text style={styles.viewResultsText}>
                  {submitting ? t('common.loadingEllipsis') : t('learning.dailyLessonViewResults')}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Si hay una sesión a medias guardada en local (el usuario salió a
              mitad), el CTA principal pasa a "Continuar lección (N/5)". Sin
              opción de "Empezar de nuevo" — eso eliminaría el anti-cheat. */}
          {pendingResume && !showCompleted ? (
            <Pressable onPress={handleResume} style={styles.startButton}>
              <LinearGradient
                colors={['#F18F34', '#C46A20']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startGradient}
              >
                <Ionicons name="play-forward" size={20} color="#fff" />
                <Text style={styles.startText}>
                  {t('learning.dailyLessonContinue', {
                    current: pendingResume.answers.length,
                    total: pendingResume.questions.length,
                  })}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={handleStart} disabled={pendingStart} style={styles.startButton}>
              <LinearGradient
                colors={showCompleted ? ['#10B981', '#059669'] : ['#F18F34', '#C46A20']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startGradient}
              >
                {pendingStart ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.startText}>{t('learning.dailyLessonStarting')}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name={showCompleted ? 'reload' : 'play'} size={20} color="#fff" />
                    <Text style={styles.startText}>
                      {showCompleted ? t('learning.dailyLessonRepeat') : t('learning.dailyLessonStart')}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          <Pressable onPress={onBack} hitSlop={8} style={styles.cancelButton}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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
    // El puzzle se renderiza sin ScrollView: ocupa exactamente el alto disponible
    // y su cancha absorbe el espacio sobrante (nunca hace falta scroll). El resto
    // de tipos mantienen el ScrollView por si su contenido excede la pantalla.
    const isPuzzle = question?.type === 'puzzle';
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
            preloadedPlayer={getPlayer(question.video_url)}
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
                <Text style={styles.reviewBadgeText}>{t('learning.dailyLessonReviewBadge')}</Text>
              </View>
            )}
            <Text style={styles.counterText}>{counter}</Text>
          </View>
        </View>

        {/* Question con fade — oculta mientras se muestra video */}
        {!showingVideo && (
          <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
            {isPuzzle ? (
              // flexGrow:1 → rellena la pantalla cuando todo cabe (sin scroll);
              // si un título muy largo no entra ni con la cancha al mínimo,
              // entonces (y solo entonces) permite scroll.
              <ScrollView
                contentContainerStyle={[styles.questionContent, styles.questionContentFill, { paddingBottom: insets.bottom + 16 }]}
                showsVerticalScrollIndicator={false}
              >
                <QuestionCard
                  key={`${qIndex}-${isReview ? 'r' : 'q'}`}
                  question={question}
                  onAnswered={isReview ? handleReviewAnswered : handleQuestionAnswered}
                  onReplayVideo={question.has_video && question.video_url ? () => setShowingVideo(true) : undefined}
                />
              </ScrollView>
            ) : (
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
            )}
          </Animated.View>
        )}

        {submitting && <SubmittingOverlay />}
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
              <Text style={styles.cancelText}>{t('common.back')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!results) return null;

    const pct = Math.round((results.session.correct_count / results.session.total_count) * 100);
    const title = pct >= 80 ? t('learning.dailyLessonResultExcellent') : pct >= 60 ? t('learning.dailyLessonResultGood') : t('learning.dailyLessonResultKeepGoing');

    // Delta por area de esta sesion (1 pto por acierto en la skill correspondiente)
    const deltas: SkillValues = { technical: 0, physical: 0, mental: 0, tactical: 0 };
    questions.forEach((q, idx) => {
      const r = results.results[idx];
      if (r?.correct) {
        deltas[AREA_TO_SKILL[q.area]] += 1;
      }
    });

    const nextBoost = getNextBoostInfo(results.streak.current);

    const toggleVote = (questionId: string, vote: 'up' | 'down') => {
      // Mutuamente excluyente: re-pulsar el mismo botón lo desmarca; pulsar
      // el opuesto cambia el voto. Los votos se mandan en bulk al salir de la
      // pantalla de results (ver flushLessonVotes arriba).
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
          <Text style={styles.resultsSubtitle}>{t('learning.dailyLessonCompleted')}</Text>

          <View style={styles.metricsCard}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{pct}%</Text>
              <Text style={styles.metricLabel}>{t('learning.dailyLessonScore')}</Text>
            </View>
            <View style={[styles.metricItem, styles.metricCorrect]}>
              <Text style={styles.metricValueCorrect}>
                {results.session.correct_count}/{results.session.total_count}
              </Text>
              <Text style={styles.metricLabel}>{t('learning.dailyLessonCorrect')}</Text>
            </View>
          </View>

          {/* Recompensa como misión del pase (plan §6.7): sustituye a la
              antigua métrica de XP. Puede haber más de una (p. ej. la fija de
              lección + una semanal/mensual de lecciones que cayó con esta).
              Al repasar/reabrir una lección ya hecha hoy no hay grant nuevo
              (season_pass = null): mostramos la lección en modo "ya completada"
              para dejar claro que su progreso ya cuenta. */}
          <View style={styles.missionCelebrations}>
            {(results.season_pass?.completed_missions?.length ?? 0) > 0 ? (
              <>
                {results.season_pass!.completed_missions.map((m, i) => (
                  <MissionCelebrationCard
                    key={m.slug}
                    icon={m.icon}
                    title={m.title}
                    spGranted={m.sp_granted}
                    delay={i * 150}
                  />
                ))}
                {results.season_pass!.level_up && (
                  <View style={styles.levelUpBanner}>
                    <Ionicons name="arrow-up-circle" size={18} color="#FBBF24" />
                    <Text style={styles.levelUpText}>
                      {t('home.seasonPass.levelUpBanner', { level: results.season_pass!.level_up.to })}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <MissionCelebrationCard
                icon="📚"
                title={t('home.dailyLesson.title')}
                spGranted={0}
                alreadyDone
              />
            )}
            {onOpenSeasonPass && (
              <Pressable
                onPress={onOpenSeasonPass}
                style={({ pressed }) => [styles.seasonPassLinkBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.seasonPassLinkTxt}>{t('learning.dailyLessonViewInPass')}</Text>
                <Ionicons name="arrow-forward" size={14} color="#F18F34" />
              </Pressable>
            )}
          </View>

          <LessonImpactRadar baseSkills={baseSkills} deltas={deltas} />

          {(results.streak.current > 0 || nextBoost !== null) && (
            <View style={styles.streakResultCard}>
              <View style={styles.streakResultTop}>
                <Ionicons name="flame" size={20} color="#F97316" />
                <View style={styles.streakResultInfo}>
                  <Text style={styles.streakResultValue}>{t('learning.dailyLessonStreakDaysLabel', { count: results.streak.current })}</Text>
                  <Text style={styles.streakResultLabel}>{t('learning.dailyLessonStreakCurrent')}</Text>
                </View>
                {(results.season_pass?.boost_applied ?? 0) > 0 && (
                  <View style={styles.boostBadge}>
                    <Text style={styles.boostBadgeText}>
                      {t('home.seasonPass.boostApplied', {
                        pct: Math.round((results.season_pass?.boost_applied ?? 0) * 100),
                      })}
                    </Text>
                  </View>
                )}
              </View>
              {nextBoost !== null && (
                <View style={styles.nextBonusRow}>
                  <Ionicons name="trending-up-outline" size={12} color="#F18F34" />
                  <Text style={styles.nextBonusText}>
                    {t('learning.dailyLessonNextBoost', {
                      pct: nextBoost.pct,
                      count: nextBoost.days,
                      daysLabel: nextBoost.days === 1 ? t('learning.dailyLessonDayOne') : t('learning.dailyLessonDayMany'),
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t('learning.dailyLessonSummaryTitle')}</Text>
            {results.results.map((r, i) => {
              const q = questions[i];
              const preview = q ? getQuestionPreview(q, t) : t('learning.questionPreviewDefault');
              const vote = questionVotes[r.question_id] ?? null;
              return (
                // Key con índice como sufijo para no crashear si hubiese
                // duplicados de question_id (defensivo).
                <View key={`${r.question_id}-${i}`} style={styles.summaryRow}>
                  <View style={[styles.summaryIcon, r.correct ? styles.summaryIconCorrect : styles.summaryIconIncorrect]}>
                    <Ionicons name={r.correct ? 'checkmark' : 'close'} size={14} color={r.correct ? '#10B981' : '#EF4444'} />
                  </View>
                  <Text style={styles.summaryText} numberOfLines={2}>
                    <Text style={styles.summaryIndex}>{i + 1}. </Text>
                    {preview}
                  </Text>
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
                // Resetear opacidad y limpiar timer pendiente. Si no, al
                // entrar la segunda vez al repaso el contenido se ve "apagado"
                // (fadeQuestion del repaso anterior dejó valores intermedios).
                contentOpacity.setValue(1);
                if (advanceTimer.current) clearTimeout(advanceTimer.current);
                setShowingVideo(false);
                setReviewIndex(0);
                setPhase('review');
                animateProgressTo(0);
                startQuestionOrVideo(failedIndices[0]);
              }}
              style={styles.continueButton}
            >
              <View style={styles.reviewButton}>
                <Ionicons name="reload" size={18} color="#F18F34" />
                <Text style={styles.reviewButtonText}>{t('learning.dailyLessonReviewFailures', { count: failedIndices.length })}</Text>
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
              <Text style={styles.continueText}>{t('learning.dailyLessonContinueBtn')}</Text>
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
// SubmittingOverlay
// Pantalla de carga al enviar los resultados al backend. Se muestra tras
// confirmar la última pregunta, mientras se calcula la sesión.
// Diseño coherente con la estética del resto de la app (orange brand,
// fondo casi negro, card con borde sutil y glow del color de marca).
// ---------------------------------------------------------------------------

function SubmittingOverlay() {
  const { t } = useTranslation();
  // Anillo exterior pulsante (scale + opacity sinusoidal).
  const pulse = useRef(new Animated.Value(0)).current;
  // Rotación continua del icono interior.
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    spinLoop.start();
    return () => { pulseLoop.stop(); spinLoop.stop(); };
  }, [pulse, spin]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.15] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.submittingOverlay}>
      <View style={styles.submittingCard}>
        <View style={styles.submittingIconWrap}>
          {/* Glow estático suave detrás del icono */}
          <View style={styles.submittingGlow} />
          {/* Anillo pulsante naranja */}
          <Animated.View
            style={[
              styles.submittingPulseRing,
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]}
          />
          {/* Icono que rota dentro de un círculo del color de marca */}
          <LinearGradient
            colors={['#F18F34', '#d97706']}
            style={styles.submittingIcon}
          >
            <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <Ionicons name="sync" size={28} color="#FFFFFF" />
            </Animated.View>
          </LinearGradient>
        </View>

        <Text style={styles.submittingTitle}>{t('learning.dailyLessonSubmittingTitle')}</Text>
        <Text style={styles.submittingSubtitle}>{t('learning.dailyLessonSubmittingSub')}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F0F' },
  flash: { ...StyleSheet.absoluteFillObject, zIndex: 10 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 12 },

  // Pantalla bloqueada por falta de cuestionario de nivelación.
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  // Tamaño explícito (150) para contener el halo radial sin recorte. El icono
  // (88) queda centrado y el contenido inferior se acerca con marginBottom bajo.
  lockedIconWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    marginBottom: 8,
  },
  lockedIconGlow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Doble círculo gris/apagado para el icono de candado superior. El anillo
  // exterior es translúcido (halo neutro), el interior tiene borde para dar la
  // sensación de "compartimento cerrado". Sin gradiente: queremos que la única
  // nota de color sea el feature badge debajo.
  lockOuterCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(156,163,175,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(156,163,175,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockInnerCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(31,41,55,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(156,163,175,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Badge pequeño debajo del candado que identifica la feature (flame para
  // lección diaria, people para IA afinidad). Color de marca para mantener el
  // hilo visual aunque el candado sea gris.
  featureIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  lockedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  lockedSubtitle: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  lockedBullets: {
    alignSelf: 'stretch',
    gap: 10,
    marginBottom: 28,
  },
  lockedBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockedBulletText: {
    color: '#E5E7EB',
    fontSize: 13,
    flex: 1,
  },
  lockedCta: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 12,
  },
  lockedCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  lockedCtaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },

  // Intro
  introContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  // El wrap tiene tamaño explícito (240) para CONTENER el halo radial y que no
  // se recorte (en Android los hijos absolutos que exceden el padre se cortan).
  // El marginBottom negativo compensa el alto extra para que el título quede
  // cerca del icono (el texto se solapa con la cola tenue del halo, sin problema).
  introIconWrap: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center', overflow: 'visible', marginBottom: -70 },
  introGlow: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  introIcon: { width: 96, height: 96, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
    backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', marginBottom: 12,
  },
  completedBadgeText: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  introTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  introSubtitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 8 },
  // Altura reservada para racha + temas: evita el salto/recentrado cuando
  // llegan los datos en la carga optimista. Cabe la racha + una fila de temas.
  introMeta: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)',
  },
  streakText: { color: '#FB923C', fontSize: 14, fontWeight: '700' },
  topicBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  topicBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  topicBadgeText: { fontSize: 11, fontWeight: '700' },
  startButton: { width: '100%', maxWidth: 280, marginBottom: 16 },
  startGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  // Botón secundario "Ver resultados" (solo aparece si ya completaste hoy).
  // Variante outline en verde para diferenciarlo del CTA principal "Repetir".
  viewResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  viewResultsText: { color: '#10B981', fontWeight: '700', fontSize: 16 },
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
  // Para puzzles (contentContainerStyle de un ScrollView): rellena el viewport
  // cuando el contenido cabe (sin scroll) y crece para scrollear solo si no
  // cabe. La cancha absorbe el espacio sobrante.
  questionContentFill: { flexGrow: 1 },
  // Overlay al enviar resultados al backend. Fondo casi negro (consistente con
  // el resto de la app) con card central y spinner animado en color de marca.
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,15,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 20,
  },
  submittingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 28,
    borderRadius: 24,
    backgroundColor: 'rgba(20,20,22,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  submittingIconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  submittingGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F18F34',
    opacity: 0.18,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 25,
  },
  submittingPulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#F18F34',
  },
  submittingIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  submittingSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
  },

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
  missionCelebrations: { alignSelf: 'stretch', gap: 10, marginBottom: 16 },
  seasonPassLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.22)',
  },
  seasonPassLinkTxt: { color: '#F18F34', fontSize: 13, fontWeight: '700' },
  boostBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(241,143,52,0.1)', borderWidth: 1, borderColor: 'rgba(241,143,52,0.2)' },
  boostBadgeText: { color: '#F18F34', fontSize: 11, fontWeight: '700' },
  levelUpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderColor: 'rgba(251,191,36,0.3)',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  levelUpText: { color: '#FBBF24', fontSize: 14, fontWeight: '800' },
  metricCorrect: { backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.12)' },
  metricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
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
  summaryIndex: { color: '#FB923C', fontWeight: '700' },
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
