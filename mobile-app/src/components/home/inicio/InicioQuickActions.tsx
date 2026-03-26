import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from './constants';
import { DASH } from './dash';
import { androidReadableText } from './textStyles';

/** Coincide con `HomeScreen` / `MainApp` (tabs inferiores). */
export type HomeNavigateTab = 'pistas' | 'partidos' | 'torneos';

type Props = {
  onNavigateToTab?: (tab: HomeNavigateTab) => void;
  /** Partidos abiertos (API). */
  openMatchesCount?: number | null;
  /** Pistas / recuentos desde API home. */
  courtsFree?: number | null;
  tournamentsCount?: number | null;
  loading?: boolean;
};

function countLine(
  loading: boolean | undefined,
  value: number | null | undefined,
  singular: string,
  plural: string
): string {
  if (loading) return DASH;
  if (value == null || Number.isNaN(value)) return DASH;
  const n = Math.max(0, Math.floor(value));
  return `${n} ${n === 1 ? singular : plural}`;
}

export function InicioQuickActions({
  onNavigateToTab,
  openMatchesCount,
  courtsFree,
  tournamentsCount,
  loading,
}: Props) {
  const buscarSub = countLine(
    loading,
    openMatchesCount,
    'partido abierto',
    'partidos abiertos'
  );
  const pistasSub = countLine(loading, courtsFree, 'pista libre', 'pistas libres');
  const torneosSub = countLine(
    loading,
    tournamentsCount,
    'torneo',
    'torneos'
  );

  return (
    <View style={styles.grid}>
      <Pressable
        onPress={() => onNavigateToTab?.('partidos')}
        style={({ pressed }) => [styles.rowWide, pressed && styles.pressed]}
      >
        <View style={styles.blobOrange} />
        <View style={styles.iconLg}>
          <Ionicons name="people" size={26} color={ACCENT} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.h3}>Buscar Partido</Text>
          <Text style={styles.p}>Únete a partidos cerca de ti</Text>
          <Text style={styles.dataLine}>{buscarSub}</Text>
        </View>
        <Ionicons name="arrow-up" size={22} color="#6b7280" style={styles.arrowUp} />
      </Pressable>

      <View style={styles.halfRow}>
        <Pressable
          onPress={() => onNavigateToTab?.('pistas')}
          style={({ pressed }) => [styles.halfCard, pressed && styles.pressed]}
        >
          <View style={styles.blobBlue} />
          <View style={styles.rowSm}>
            <View style={styles.iconSm}>
              <Ionicons name="location" size={22} color="#60a5fa" />
            </View>
            <View style={styles.textColSm}>
              <Text style={styles.h3sm}>Pistas</Text>
              <Text style={styles.p}>Reserva tu club</Text>
              <Text style={styles.dataLineSm}>{pistasSub}</Text>
            </View>
          </View>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.halfCard, pressed && styles.pressed]}>
          <View style={styles.blobPurple} />
          <View style={styles.rowSm}>
            <View style={styles.iconSm}>
              <Ionicons name="school" size={22} color="#c084fc" />
            </View>
            <View style={styles.textColSm}>
              <Text style={styles.h3sm}>Clases</Text>
              <Text style={styles.p}>Mejora tu juego</Text>
              <Text style={styles.dataLineSm}>{DASH}</Text>
            </View>
          </View>
        </Pressable>
      </View>

      <Pressable
        onPress={() => onNavigateToTab?.('torneos')}
        style={({ pressed }) => [styles.rowWide, pressed && styles.pressed]}
      >
        <View style={styles.blobAmber} />
        <View style={styles.iconLg}>
          <Ionicons name="trophy" size={26} color="#fbbf24" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.h3}>Torneos</Text>
          <Text style={styles.p}>Compite y gana premios</Text>
          <Text style={styles.dataLine}>{torneosSub}</Text>
        </View>
        <Ionicons name="arrow-up" size={22} color="#6b7280" style={styles.arrowUp} />
      </Pressable>
    </View>
  );
}

const cardBase = {
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.1)',
  borderRadius: 24,
  overflow: 'hidden' as const,
};

const styles = StyleSheet.create({
  grid: { gap: 16, width: '100%' },
  pressed: { opacity: 0.92 },
  rowWide: {
    ...cardBase,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    width: '100%',
  },
  blobOrange: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(241,143,52,0.2)',
  },
  blobBlue: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
  blobPurple: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  blobAmber: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(245,158,11,0.2)',
  },
  iconLg: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  h3: androidReadableText({
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  }),
  p: androidReadableText({
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  }),
  dataLine: androidReadableText({
    fontSize: 11,
    fontWeight: '600',
    color: ACCENT,
  }),
  dataLineSm: androidReadableText({
    fontSize: 10,
    fontWeight: '600',
    color: ACCENT,
    marginTop: 2,
  }),
  arrowUp: { transform: [{ rotate: '45deg' }] },
  halfRow: { flexDirection: 'row', gap: 16 },
  halfCard: {
    ...cardBase,
    flex: 1,
    padding: 16,
    minHeight: 100,
  },
  rowSm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconSm: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColSm: { flex: 1, minWidth: 0 },
  h3sm: androidReadableText({
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  }),
});
