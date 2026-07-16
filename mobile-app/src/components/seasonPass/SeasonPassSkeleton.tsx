import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

const PAD = 20;
const TRACK_COL_W = 88; // = TRACK_COL_W de SeasonPassScreen
const THUMB = 52; // = thumbSize de LevelTrackColumn

/**
 * Skeleton estructural de la pantalla del pase: se muestra solo en la primera
 * carga en frío (sin caché persistido; con warm start ni aparece). Imita la
 * disposición real — chip de temporada, título, card de nivel, tabs y track
 * de recompensas — con las mismas dimensiones, para que la transición
 * skeleton → contenido no salte de layout. Mismo patrón que HomeSkeleton.
 */
export function SeasonPassSkeleton() {
  return (
    <View style={styles.root}>
      {/* Chip de temporada */}
      <View style={styles.center}>
        <Skeleton width={150} height={28} borderRadius={14} variant="dark" />
      </View>

      {/* Título + subtítulo */}
      <View style={[styles.center, styles.titleBlock]}>
        <Skeleton width={220} height={24} borderRadius={8} variant="dark" />
        <Skeleton width={170} height={13} borderRadius={6} variant="dark" />
      </View>

      {/* Card de nivel: hints + números grandes, barra de progreso y fila elite */}
      <View style={styles.levelCard}>
        <View style={styles.levelTop}>
          <View style={styles.levelTopCol}>
            <Skeleton width={90} height={11} borderRadius={5} variant="dark" />
            <Skeleton width={72} height={34} borderRadius={8} variant="dark" />
          </View>
          <View style={[styles.levelTopCol, { alignItems: 'flex-end' }]}>
            <Skeleton width={110} height={11} borderRadius={5} variant="dark" />
            <Skeleton width={88} height={26} borderRadius={8} variant="dark" />
          </View>
        </View>
        <Skeleton height={10} borderRadius={5} variant="dark" style={{ marginTop: 16 }} />
        <Skeleton width={140} height={11} borderRadius={5} variant="dark" style={{ marginTop: 10 }} />
        <Skeleton height={54} borderRadius={14} variant="dark" style={{ marginTop: 14 }} />
      </View>

      {/* Tabs premios / misiones */}
      <View style={styles.tabsRow}>
        <Skeleton height={38} borderRadius={12} variant="dark" style={styles.tabCell} />
        <Skeleton height={38} borderRadius={12} variant="dark" style={styles.tabCell} />
      </View>

      {/* Leyenda del track */}
      <View style={styles.legendRow}>
        <Skeleton width={90} height={12} borderRadius={6} variant="dark" />
        <Skeleton width={70} height={12} borderRadius={6} variant="dark" />
      </View>

      {/* Track horizontal: columnas de nivel (thumb elite, línea, thumb free) */}
      <View style={styles.trackRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.trackCol}>
            <Skeleton width={THUMB} height={THUMB} borderRadius={14} variant="dark" />
            <Skeleton width={56} height={9} borderRadius={4} variant="dark" style={{ marginTop: 6 }} />
            <View style={styles.trackLineWrap}>
              <Skeleton height={4} borderRadius={2} variant="dark" />
            </View>
            <Skeleton width={THUMB} height={THUMB} borderRadius={14} variant="dark" />
            <Skeleton width={56} height={9} borderRadius={4} variant="dark" style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 64, // deja sitio al back FAB (top: 8) como el hero real
    paddingHorizontal: PAD,
  },
  center: {
    alignItems: 'center',
  },
  titleBlock: {
    marginTop: 14,
    gap: 8,
  },
  levelCard: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
  },
  levelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  levelTopCol: {
    gap: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  tabCell: {
    flex: 1,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
  },
  // Clipa las columnas que no caben: imita el scroll horizontal del track.
  trackRow: {
    flexDirection: 'row',
    marginTop: 14,
    overflow: 'hidden',
  },
  trackCol: {
    width: TRACK_COL_W,
    alignItems: 'center',
  },
  trackLineWrap: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    height: THUMB - 14,
  },
});
