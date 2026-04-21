import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { ACCENT } from './constants';
import { androidReadableText } from './textStyles';
import { useStreak } from '../../../hooks/useDailyLesson';
import { ScalePressable } from './ScalePressable';

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const BONUS_LEVELS = [
  { label: 'x0.5', minDays: 0, color: '#9CA3AF' },
  { label: 'x1', minDays: 7, color: '#FB923C' },
  { label: 'x1.5', minDays: 14, color: '#FDBA74' },
  { label: 'x2', minDays: 30, color: '#FCD34D' },
] as const;

type Props = {
  onPress?: () => void;
  /**
   * `carousel`: misma altura fija que `WidgetCarousel` X7 (160px), sin línea extra de XP.
   */
  variant?: 'default' | 'carousel';
  /** Sincronizado con `MainApp`: se incrementa al cerrar la lección para volver a pedir racha al API. */
  streakRefreshKey?: number;
};

/** Misma fecha civil que usa el backend con `?timezone=` (clave YYYY-MM-DD). */
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

function isLessonCompletedToday(lastLessonIso: string | null, timeZone: string): boolean {
  if (lastLessonIso == null || String(lastLessonIso).trim() === '') return false;
  const keyDone = calendarDayKeyInTimeZone(lastLessonIso, timeZone);
  if (!keyDone) return false;
  return keyDone === calendarDayKeyInTimeZone(new Date(), timeZone);
}

/** L=0 … D=6 en la zona de la lección (alineado al servidor). */
function mondayFirstWeekdayIndexInZone(timeZone: string, ref: Date = new Date()): number {
  const long = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(ref);
  const map: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  return map[long] ?? ((ref.getDay() + 6) % 7);
}

/** Halo naranja (equiv. `blur-md bg-orange-500` en X7 `DailyLessonWidget`). */
function DailyLessonIconBackdropSvg() {
  const gid = useId().replace(/:/g, '_');
  const gradId = `dl_glow_${gid}`;
  const size = 78;
  const r = size / 2;
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={gradId} cx="40%" cy="36%" rx="58%" ry="58%">
          <Stop offset="0%" stopColor="rgb(249,115,22)" stopOpacity={0.52} />
          <Stop offset="48%" stopColor="rgb(241,143,52)" stopOpacity={0.18} />
          <Stop offset="100%" stopColor="rgb(241,143,52)" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${gradId})`} />
    </Svg>
  );
}

function getBonusLevelLabel(streak: number): { label: string; color: string } {
  for (let i = BONUS_LEVELS.length - 1; i >= 0; i--) {
    const L = BONUS_LEVELS[i];
    if (streak >= L.minDays) return { label: L.label, color: L.color };
  }
  return { label: BONUS_LEVELS[0].label, color: BONUS_LEVELS[0].color };
}

function getMultiplierLabel(multiplier: number): string | null {
  if (multiplier <= 0) return null;
  return `x${(1 + multiplier).toFixed(1)} XP`;
}

function getDayStatus(
  dayIndex: number,
  todayIndex: number,
  currentStreak: number,
  completedToday: boolean,
): 'completed' | 'completed_today' | 'today' | 'missed' | 'future' {
  if (dayIndex > todayIndex) return 'future';
  if (dayIndex === todayIndex) return completedToday ? 'completed_today' : 'today';
  const daysAgo = todayIndex - dayIndex;
  const streakCovers = completedToday ? daysAgo < currentStreak : daysAgo <= currentStreak;
  return streakCovers ? 'completed' : 'missed';
}

function loopLinear01(value: Animated.Value, durationMs: number, onDone: () => void) {
  value.setValue(0);
  Animated.timing(value, {
    toValue: 1,
    duration: durationMs,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start(({ finished }) => {
    if (finished) onDone();
  });
}

export function DailyLessonCard({
  onPress,
  variant = 'default',
  streakRefreshKey = 0,
}: Props) {
  const isCarousel = variant === 'carousel';
  const { currentStreak, multiplier, lastCompleted, loading } = useStreak(
    TIMEZONE,
    streakRefreshKey,
  );
  const [cardW, setCardW] = useState(0);

  const glowPhase = useRef(new Animated.Value(0)).current;
  const bgMorph = useRef(new Animated.Value(0)).current;
  const shimmerPhase = useRef(new Animated.Value(0)).current;
  const flameMotion = useRef(new Animated.Value(0)).current;
  const ctaNudge = useRef(new Animated.Value(0)).current;

  const dayEnterRef = useRef<Animated.Value[] | null>(null);
  if (!dayEnterRef.current) {
    dayEnterRef.current = WEEK_LABELS.map(() => new Animated.Value(0));
  }
  const dayEnter = dayEnterRef.current;

  const now = new Date();
  const todayIndex = mondayFirstWeekdayIndexInZone(TIMEZONE, now);
  const completedToday = isLessonCompletedToday(lastCompleted, TIMEZONE);

  const multiplierLabel = getMultiplierLabel(multiplier);
  const bonusFromStreak = getBonusLevelLabel(currentStreak);

  /** Fondo: pulso tipo Motion (~5s easeInOut 0↔1). */
  useEffect(() => {
    let alive = true;
    const half = 2500;
    const run = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(bgMorph, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bgMorph, {
          toValue: 0,
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
      bgMorph.stopAnimation();
    };
  }, [bgMorph, completedToday]);

  /** Brillo horizontal (4s sweep + 3s pausa). */
  useEffect(() => {
    let alive = true;
    const sweepMs = 4000;
    const pauseMs = 3000;
    const runSweep = () => {
      if (!alive) return;
      shimmerPhase.setValue(0);
      Animated.timing(shimmerPhase, {
        toValue: 1,
        duration: sweepMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !alive) return;
        setTimeout(() => {
          if (alive) runSweep();
        }, pauseMs);
      });
    };
    runSweep();
    return () => {
      alive = false;
      shimmerPhase.stopAnimation();
    };
  }, [shimmerPhase]);

  /** Halo icono: opacity + scale 2s (0.2–0.4 / 0.9–1.1). */
  useEffect(() => {
    let alive = true;
    const half = 1000;
    const run = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(glowPhase, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPhase, {
          toValue: 0,
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
      glowPhase.stopAnimation();
    };
  }, [glowPhase]);

  /** Llama: scale + rotación ~2s. */
  useEffect(() => {
    if (completedToday) {
      flameMotion.stopAnimation();
      flameMotion.setValue(0);
      return;
    }
    let alive = true;
    const run = () => {
      if (!alive) return;
      loopLinear01(flameMotion, 2000, () => {
        if (alive) run();
      });
    };
    run();
    return () => {
      alive = false;
      flameMotion.stopAnimation();
    };
  }, [completedToday, flameMotion]);

  /** CTA “Empezar”: x 0→3→0 en 1.5s. */
  useEffect(() => {
    if (completedToday) {
      ctaNudge.stopAnimation();
      ctaNudge.setValue(0);
      return;
    }
    let alive = true;
    const run = () => {
      if (!alive) return;
      Animated.sequence([
        Animated.timing(ctaNudge, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ctaNudge, {
          toValue: 0,
          duration: 750,
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
      ctaNudge.stopAnimation();
    };
  }, [completedToday, ctaNudge]);

  /** Grilla semanal: spring escalonado (delay i * 40ms). */
  useEffect(() => {
    if (loading) return;
    dayEnter.forEach((v) => v.setValue(0));
    Animated.stagger(
      40,
      dayEnter.map((v) =>
        Animated.spring(v, {
          toValue: 1,
          friction: 8,
          tension: 300,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [loading, dayEnter]);

  const glowOpacity = useMemo(
    () =>
      glowPhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.2, 0.4, 0.2],
      }),
    [glowPhase]
  );

  const glowScale = useMemo(
    () =>
      glowPhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.9, 1.1, 0.9],
      }),
    [glowPhase]
  );

  const overlayOpacity = useMemo(
    () =>
      bgMorph.interpolate({
        inputRange: [0, 1],
        outputRange: [0.1, 0.42],
      }),
    [bgMorph]
  );

  const shimmerTx = useMemo(() => {
    if (cardW <= 0) return shimmerPhase.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });
    const w = cardW * 0.4;
    return shimmerPhase.interpolate({
      inputRange: [0, 1],
      outputRange: [-w * 1.2, cardW + w],
    });
  }, [cardW, shimmerPhase]);

  const flameScale = useMemo(
    () =>
      flameMotion.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.15, 1],
      }),
    [flameMotion]
  );

  const flameRotate = useMemo(
    () =>
      flameMotion.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: ['0deg', '5deg', '0deg', '-5deg', '0deg'],
      }),
    [flameMotion]
  );

  const ctaTx = useMemo(
    () =>
      ctaNudge.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 3, 0],
      }),
    [ctaNudge]
  );

  /** Igual que X7 widget (estado animado rojo/naranja), sin rama verde. */
  const baseGradient = ['rgba(227,30,36,0.15)', 'rgba(15,15,15,0.95)', 'rgba(249,115,22,0.1)'] as const;
  const morphGradient = ['rgba(249,115,22,0.1)', 'rgba(227,30,36,0.18)', 'rgba(15,15,15,0.95)'] as const;

  const onCardLayout = (e: LayoutChangeEvent) => {
    setCardW(e.nativeEvent.layout.width);
  };

  return (
    <ScalePressable
      onPress={onPress}
      pressedScale={0.98}
      style={({ pressed }) => [
        styles.wrap,
        isCarousel && styles.wrapCarousel,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[styles.wrapInner, isCarousel && styles.wrapInnerCarousel]}
        onLayout={onCardLayout}
      >
        <LinearGradient
          colors={baseGradient}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]} pointerEvents="none">
          <LinearGradient
            colors={morphGradient}
            locations={[0, 0.4, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {cardW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmerStrip,
              {
                width: cardW * 0.4,
                transform: [{ translateX: shimmerTx }],
              },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}

        {Platform.OS === 'ios' ? (
          <BlurView intensity={24} tint="dark" style={[StyleSheet.absoluteFill, styles.blur]} />
        ) : null}
        <View style={styles.glassBorder} />

        <View
          style={[
            styles.inner,
            isCarousel && styles.innerCarousel,
            Platform.OS === 'android' && !isCarousel && styles.innerAndroid,
            Platform.OS === 'android' && isCarousel && styles.innerCarouselAndroid,
          ]}
        >
          <View style={[styles.topRow, isCarousel && styles.topRowCarousel]}>
            <View style={styles.leftCluster}>
              <View style={styles.iconCol}>
                <Animated.View
                  collapsable={false}
                  pointerEvents="none"
                  style={[
                    styles.iconBackdropAnim,
                    { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                  ]}
                >
                  <DailyLessonIconBackdropSvg />
                </Animated.View>
                <LinearGradient
                  colors={['#f97316', ACCENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBox}
                >
                  {completedToday ? (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  ) : (
                    <Animated.View
                      collapsable={false}
                      style={{
                        transform: [{ scale: flameScale }, { rotate: flameRotate }],
                      }}
                    >
                      <Ionicons name="flame" size={18} color="#fff" />
                    </Animated.View>
                  )}
                </LinearGradient>
              </View>
              <View style={styles.titleCol}>
                <Text style={styles.title}>Lección diaria</Text>
                <Text style={styles.subtitle}>Racha semanal</Text>
                {!isCarousel && multiplierLabel ? (
                  <Text style={styles.subtitleXp}>{multiplierLabel}</Text>
                ) : null}
              </View>
            </View>

            {completedToday ? (
              <View style={styles.hechaBadge}>
                <Ionicons name="checkmark-circle" size={12} color={ACCENT} />
                <Text style={styles.hechaText}>Hecha</Text>
              </View>
            ) : (
              <Animated.View
                collapsable={false}
                style={[styles.ctaRow, { transform: [{ translateX: ctaTx }] }]}
              >
                <Text style={styles.ctaInline}>Empezar</Text>
                <Ionicons name="chevron-forward" size={14} color={ACCENT} />
              </Animated.View>
            )}
          </View>

          <View style={[styles.streakRow, isCarousel && styles.streakRowCarousel]}>
            {currentStreak > 0 ? (
              <View style={styles.streakInline}>
                <Ionicons name="flame" size={10} color="#FB923C" />
                <Text style={styles.streakText}>{currentStreak} días de racha</Text>
              </View>
            ) : null}
            <Text style={[styles.bonusText, { color: bonusFromStreak.color }]}>
              Bonus {bonusFromStreak.label}
            </Text>
          </View>

          <View style={[styles.daysRow, isCarousel && styles.daysRowCarousel]}>
            {WEEK_LABELS.map((label, i) => {
              const status = getDayStatus(i, todayIndex, currentStreak, completedToday);
              const enter = dayEnter[i];
              const colStyle = {
                opacity: enter,
                transform: [
                  {
                    scale: enter.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  },
                ],
              };
              return (
                <Animated.View
                  key={label}
                  style={[styles.dayCol, isCarousel && styles.dayColCarousel, colStyle]}
                >
                  <Text style={[styles.dayLabel, i === todayIndex && { color: '#fff' }]}>{label}</Text>
                  <View
                    style={[
                      styles.dayCell,
                      isCarousel && styles.dayCellCarousel,
                      (status === 'completed' || status === 'completed_today') && styles.dayCellCompleted,
                      status === 'today' && styles.dayCellToday,
                    ]}
                  >
                    {(status === 'completed' || status === 'completed_today') && (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    )}
                    {status === 'today' && (
                      <Ionicons name="book-outline" size={12} color="#9CA3AF" />
                    )}
                    {status === 'future' && (
                      <Ionicons name="lock-closed" size={10} color="#374151" />
                    )}
                    {status === 'missed' && <View style={styles.missedDot} />}
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </View>
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
    minHeight: 160,
  },
  wrapCarousel: {
    height: 160,
    maxHeight: 160,
    minHeight: 160,
  },
  wrapInner: {
    flex: 1,
    minHeight: 160,
    borderRadius: 24,
    overflow: 'hidden',
  },
  wrapInnerCarousel: {
    height: 160,
    maxHeight: 160,
    minHeight: 160,
  },
  pressed: { opacity: 0.95 },
  blur: { opacity: 0.85 },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  shimmerStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.3,
  },
  inner: { padding: 16, position: 'relative', zIndex: 2, flex: 1, justifyContent: 'space-between' },
  innerCarousel: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  innerCarouselAndroid: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingRight: 16,
  },
  innerAndroid: {
    paddingRight: 24,
    paddingLeft: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  topRowCarousel: {
    marginBottom: 4,
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  iconCol: { position: 'relative', marginRight: 10 },
  iconBackdropAnim: {
    position: 'absolute',
    left: -16,
    top: -16,
    width: 78,
    height: 78,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: androidReadableText({
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  }),
  subtitle: androidReadableText({
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  }),
  subtitleXp: androidReadableText({
    marginTop: 2,
    fontSize: 9,
    fontWeight: '600',
    color: '#9CA3AF',
  }),
  hechaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.28)',
    flexShrink: 0,
  },
  hechaText: androidReadableText({
    fontSize: 10,
    fontWeight: '900',
    color: ACCENT,
  }),
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  ctaInline: androidReadableText({
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  }),
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  streakRowCarousel: {
    marginBottom: 4,
    gap: 10,
  },
  streakInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakText: androidReadableText({
    fontSize: 10,
    fontWeight: '700',
    color: '#FB923C',
  }),
  bonusText: androidReadableText({
    fontSize: 10,
    fontWeight: '700',
  }),
  daysRow: {
    flexDirection: 'row',
    gap: 4,
  },
  daysRowCarousel: {
    gap: 4,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dayColCarousel: {
    gap: 2,
  },
  dayLabel: androidReadableText({
    fontSize: 9,
    fontWeight: '700',
    color: '#4b5563',
  }),
  dayCell: {
    width: '100%',
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellCarousel: {
    height: 32,
    borderRadius: 8,
  },
  /** `bg-orange-500` en X7 (Tailwind orange-500 = #f97316). */
  dayCellCompleted: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  /** `bg-white/[0.08] border-white/[0.15] ring-[#F18F34]/40` → borde acento visible. */
  dayCellToday: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(241,143,52,0.4)',
    borderWidth: 1,
  },
  missedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
  },
});
