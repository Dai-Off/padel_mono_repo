import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from './constants';
import { androidReadableText } from './textStyles';
import { useStreak } from '../../../hooks/useDailyLesson';

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

type Props = {
  onPress?: () => void;
};

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
  // Dias pasados: si el streak cubre ese dia
  const daysAgo = todayIndex - dayIndex;
  const streakCovers = completedToday ? daysAgo < currentStreak : daysAgo <= currentStreak;
  return streakCovers ? 'completed' : 'missed';
}

export function DailyLessonCard({ onPress }: Props) {
  const { currentStreak, multiplier, lastCompleted, loading } = useStreak(TIMEZONE);

  const now = new Date();
  const todayIndex = (now.getDay() + 6) % 7; // Lunes=0, Domingo=6
  const completedToday = !!lastCompleted &&
    new Date(lastCompleted).toDateString() === now.toDateString();

  const multiplierLabel = getMultiplierLabel(multiplier);

  const gradientColors = completedToday
    ? ['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.06)', 'rgba(47,25,15,0.95)'] as const
    : ['rgba(248,113,23,0.12)', 'rgba(223,30,36,0.22)', 'rgba(47,25,15,0.95)'] as const;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {Platform.OS === 'ios' ? (
        <BlurView intensity={24} tint="dark" style={[StyleSheet.absoluteFill, styles.blur]} />
      ) : null}
      <View style={styles.glassBorder} />
      <View
        style={[
          styles.inner,
          Platform.OS === 'android' && styles.innerAndroid,
        ]}
      >
        {/* Fila superior: icono + titulo + racha */}
        <View style={styles.topRow}>
          <View style={styles.iconCol}>
            <View style={[styles.iconGlow, completedToday && { backgroundColor: 'rgba(16,185,129,0.45)' }]} />
            <LinearGradient
              colors={completedToday ? ['#10B981', '#059669'] : ['#f97316', ACCENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBox}
            >
              <Ionicons name={completedToday ? 'checkmark' : 'flame'} size={28} color="#fff" />
            </LinearGradient>
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.title}>
              {completedToday ? 'Completada!' : 'Leccion diaria'}
            </Text>
            {multiplierLabel && (
              <Text style={styles.subtitle}>
                Bonus: {multiplierLabel}
              </Text>
            )}
          </View>
          <View style={styles.streakCol}>
            {currentStreak > 0 && (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={12} color="#FB923C" />
                <Text style={styles.streakNumber}>{currentStreak}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Grilla semanal */}
        <View style={styles.daysRow}>
          {WEEK_LABELS.map((label, i) => {
            const status = getDayStatus(i, todayIndex, currentStreak, completedToday);
            return (
              <View key={label} style={styles.dayCol}>
                <Text style={[styles.dayLabel, i === todayIndex && { color: '#fff' }]}>{label}</Text>
                <View style={[
                  styles.dayCell,
                  status === 'completed_today' && styles.dayCellCompletedToday,
                  status === 'completed' && styles.dayCellCompleted,
                  status === 'today' && styles.dayCellToday,
                ]}>
                  {(status === 'completed' || status === 'completed_today') && (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  )}
                  {status === 'today' && (
                    <Ionicons name="book-outline" size={12} color="#9CA3AF" />
                  )}
                  {status === 'future' && (
                    <Ionicons name="lock-closed" size={10} color="#374151" />
                  )}
                  {status === 'missed' && (
                    <View style={styles.missedDot} />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer} collapsable={false}>
          <View style={styles.ctaShell} collapsable={false}>
            <Text
              numberOfLines={1}
              textBreakStrategy={Platform.OS === 'android' ? 'simple' : undefined}
              style={[
                styles.cta,
                Platform.OS === 'android' ? styles.ctaAndroid : null,
                completedToday && { color: '#10B981' },
              ]}
            >
              {completedToday ? 'Repetir' : 'Empezar'}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={completedToday ? '#10B981' : ACCENT}
            style={styles.footerIcon}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
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
  inner: { padding: 20, position: 'relative', zIndex: 2 },
  innerAndroid: {
    paddingRight: 30,
    paddingLeft: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconCol: { position: 'relative' },
  iconGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(249,115,22,0.45)',
    left: -4,
    top: -4,
    opacity: 0.6,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, marginLeft: 12, justifyContent: 'center', minWidth: 0 },
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
  streakCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.2)',
  },
  streakNumber: androidReadableText({
    fontSize: 16,
    fontWeight: '900',
    color: '#FB923C',
  }),
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: androidReadableText({
    fontSize: 9,
    fontWeight: '700',
    color: '#4b5563',
  }),
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellCompletedToday: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  dayCellCompleted: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    width: '100%',
  },
  footerIcon: { marginLeft: 6 },
  ctaShell: {
    flexShrink: 0,
    flexGrow: 0,
  },
  cta: androidReadableText({
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
  }),
  ctaAndroid: {
    includeFontPadding: false,
    paddingVertical: 0,
    paddingRight: 4,
    lineHeight: 20,
    flexShrink: 0,
  },
});
