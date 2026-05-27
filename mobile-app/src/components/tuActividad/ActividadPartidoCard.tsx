import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PartidoItem } from '../../screens/PartidosScreen';
import { theme } from '../../theme';

type ActividadPartidoCardProps = {
  partido: PartidoItem;
  onPress?: () => void;
};

export function ActividadPartidoCard({ partido, onPress }: ActividadPartidoCardProps) {
  const modeLabel = partido.mode === 'competitivo' ? 'Competitivo' : 'Amistoso';
  const modeColor = partido.mode === 'competitivo' ? theme.auth.accent : '#38bdf8';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.topRow}>
        <LinearGradient
          colors={['rgba(241,143,52,0.2)', 'rgba(233,95,50,0.1)']}
          style={styles.iconBox}
        >
          <Ionicons name="trophy-outline" size={20} color={theme.auth.accent} />
        </LinearGradient>
        <View style={styles.main}>
          <Text style={styles.venue} numberOfLines={1}>
            {partido.venue}
          </Text>
          <Text style={styles.dateTime} numberOfLines={1}>
            {partido.dateTime}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#6b7280" />
      </View>
      <View style={styles.metaRow}>
        <View style={[styles.badge, { borderColor: `${modeColor}40` }]}>
          <Text style={[styles.badgeText, { color: modeColor }]}>{modeLabel}</Text>
        </View>
        {partido.courtName ? (
          <Text style={styles.metaText} numberOfLines={1}>
            {partido.courtName}
          </Text>
        ) : null}
        <Text style={styles.metaText}>{partido.duration}</Text>
      </View>
    </Pressable>
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
  cardPressed: { opacity: 0.9 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, minWidth: 0 },
  venue: { fontSize: 15, fontWeight: '600', color: '#fff' },
  dateTime: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingLeft: 52,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  metaText: { fontSize: 12, color: theme.auth.textMuted },
});
