import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { CourseEnrollment } from '../../api/schoolCourses';
import { theme } from '../../theme';

const WEEKDAY_ES: Record<string, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
};

type ActividadClaseCardProps = {
  enrollment: CourseEnrollment;
};

export function ActividadClaseCard({ enrollment }: ActividadClaseCardProps) {
  const course = enrollment.course;
  if (!course) return null;

  const daysLabel = (course.days ?? [])
    .map((d) => WEEKDAY_ES[d.weekday] ?? d.weekday)
    .join(', ');
  const timeLabel =
    course.days?.[0] != null
      ? `${course.days[0].start_time} – ${course.days[0].end_time}`
      : '';
  const cancelled = enrollment.status === 'cancelled';

  return (
    <View style={[styles.card, cancelled && styles.cardCancelled]}>
      <View style={styles.topRow}>
        <LinearGradient
          colors={[theme.sidebar.iconVariants.purple.from, theme.sidebar.iconVariants.purple.to]}
          style={styles.iconBox}
        >
          <Ionicons name="school-outline" size={20} color={theme.sidebar.iconVariants.purple.color} />
        </LinearGradient>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            {course.name}
          </Text>
          <Text style={styles.club} numberOfLines={1}>
            {course.club_name}
            {course.club_city ? ` · ${course.club_city}` : ''}
          </Text>
        </View>
        {cancelled ? (
          <View style={styles.statusBadgeMuted}>
            <Text style={styles.statusTextMuted}>Cancelada</Text>
          </View>
        ) : (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Activa</Text>
          </View>
        )}
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="stats-chart-outline" size={14} color={theme.auth.textMuted} />
          <Text style={styles.metaText}>{course.level}</Text>
        </View>
        {daysLabel ? (
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={theme.auth.textMuted} />
            <Text style={styles.metaText}>{daysLabel}</Text>
          </View>
        ) : null}
        {timeLabel ? (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={theme.auth.textMuted} />
            <Text style={styles.metaText}>{timeLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  cardCancelled: { opacity: 0.65 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600', color: '#fff' },
  club: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  statusText: { fontSize: 11, fontWeight: '600', color: '#34d399' },
  statusBadgeMuted: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statusTextMuted: { fontSize: 11, fontWeight: '600', color: theme.auth.textMuted },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingLeft: 52,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: theme.auth.textMuted },
});
