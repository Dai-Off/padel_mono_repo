import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DASH } from './dash';
import { androidReadableText } from './textStyles';
import { ScalePressable } from './ScalePressable';
import { useAmbientTheme } from '../../../hooks/useAmbientTheme';
import { OPENWEATHER_API_KEY } from '../../../config';

/** Coincide con `HomeScreen` / `MainApp` (tabs inferiores). */
export type HomeNavigateTab = 'pistas' | 'partidos' | 'torneos';

type Props = {
  onNavigateToTab?: (tab: HomeNavigateTab) => void;
  onCoursesPress?: () => void;
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
  onCoursesPress,
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
    'torneo disponible',
    'torneos disponibles'
  );

  const theme = useAmbientTheme(OPENWEATHER_API_KEY);
  const color1 = `rgb(${theme.orb1Color})`;
  const color2 = `rgb(${theme.orb2Color})`;
  const color3 = `rgb(${theme.orb3Color})`;
  
  // Opacidades ultra-bajas para un difuminado real
  const washOpacity1 = 0.18; 
  const washOpacity2 = 0.02;

  return (
    <View style={styles.grid}>
      <ScalePressable
        onPress={() => onNavigateToTab?.('partidos')}
        pressedScale={0.985}
        style={({ pressed }) => [styles.rowWide, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={[`rgba(${theme.orb1Color},${washOpacity1})`, `rgba(${theme.orb1Color},${washOpacity2})`, 'transparent']}
          locations={[0, 0.4, 0.9]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.iconLg}>
          <Ionicons name="people" size={26} color={color1} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.h3}>Buscar Partido</Text>
          <Text style={styles.p}>Únete a partidos cerca de ti</Text>
          <Text style={[styles.dataLine, { color: color1 }]}>{buscarSub}</Text>
        </View>
        <Ionicons name="arrow-up" size={22} color="#6b7280" style={styles.arrowUp} />
      </ScalePressable>

      <View style={styles.halfRow}>
        <View style={styles.halfSlot}>
          <ScalePressable
            onPress={() => onNavigateToTab?.('pistas')}
            pressedScale={0.985}
            style={({ pressed }) => [styles.halfCard, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={[`rgba(${theme.orb2Color},${washOpacity1})`, `rgba(${theme.orb2Color},${washOpacity2})`, 'transparent']}
              locations={[0, 0.4, 0.9]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 0.8 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.rowSm}>
              <View style={styles.iconSm}>
                <Ionicons name="location" size={22} color={color2} />
              </View>
              <View style={styles.textColSm}>
                <Text style={styles.h3sm}>Pistas</Text>
                <Text style={styles.p}>Reserva tu club</Text>
                <Text style={[styles.dataLineSm, { color: color1 }]}>{pistasSub}</Text>
              </View>
            </View>
          </ScalePressable>
        </View>
        <View style={styles.halfSlot}>
          <ScalePressable
            onPress={() => onCoursesPress?.()}
            pressedScale={0.985}
            style={({ pressed }) => [styles.halfCard, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={[`rgba(${theme.orb3Color},${washOpacity1})`, `rgba(${theme.orb3Color},${washOpacity2})`, 'transparent']}
              locations={[0, 0.4, 0.9]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 0.8 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.rowSm}>
              <View style={styles.iconSm}>
                <Ionicons name="school" size={22} color={color3} />
              </View>
              <View style={styles.textColSm}>
                <Text style={styles.h3sm}>Clases</Text>
                <Text style={styles.p}>Mejora tu juego</Text>
                <Text style={styles.dataLineSm}>{DASH}</Text>
              </View>
            </View>
          </ScalePressable>
        </View>
      </View>

      <ScalePressable
        onPress={() => onNavigateToTab?.('torneos')}
        pressedScale={0.985}
        style={({ pressed }) => [styles.rowWide, pressed && styles.pressed]}
      >
        <LinearGradient
          colors={[`rgba(${theme.orb1Color},${washOpacity1})`, `rgba(${theme.orb1Color},${washOpacity2})`, 'transparent']}
          locations={[0, 0.4, 0.9]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.iconLg}>
          <Ionicons name="trophy" size={26} color={color1} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.h3}>Torneos</Text>
          <Text style={styles.p}>Compite y gana premios</Text>
          <Text style={[styles.dataLine, { color: color1 }]}>{torneosSub}</Text>
        </View>
        <Ionicons name="arrow-up" size={22} color="#6b7280" style={styles.arrowUp} />
      </ScalePressable>
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
  // Eliminamos estilos de cornerWash fijos
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
  }),
  dataLineSm: androidReadableText({
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  }),
  arrowUp: { transform: [{ rotate: '45deg' }] },
  halfRow: { flexDirection: 'row', gap: 16 },
  /** `flex:1` en el slot: el `ScalePressable` envuelve con `Animated.View` sin flex. */
  halfSlot: { flex: 1, minWidth: 0 },
  halfCard: {
    ...cardBase,
    padding: 16,
    minHeight: 100,
    width: '100%',
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
