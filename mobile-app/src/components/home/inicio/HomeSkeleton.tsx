import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../ui/Skeleton';
import { INICIO_STACK_GAP } from './constants';
import {
  INICIO_WIDGET_CAROUSEL_DOTS_H,
  INICIO_WIDGET_CAROUSEL_HEIGHT,
} from './InicioWidgetsCarousel';

/**
 * Skeleton de la pantalla Home. Imita la disposición real de cada sección
 * (próximos partidos, widget carousel, accesos rápidos, IA afinidad,
 * misiones, en directo) con bloques grises pulsantes.
 *
 * Se muestra durante la primera carga del Home mientras llegan los datos del
 * `HomeDataContext`. En cargas posteriores no se ve — el context devuelve
 * cache instantáneo.
 *
 * Dimensiones aproximadas a las del contenido real para que la transición
 * skeleton → contenido no salte de altura ni de layout.
 */
export function HomeSkeleton() {
  return (
    <View style={styles.stack}>
      {/* Mis partidos: 2 cards horizontales. */}
      <View style={styles.matchesRow}>
        <Skeleton height={120} variant="dark" borderRadius={16} style={styles.matchCard} />
        <Skeleton height={120} variant="dark" borderRadius={16} style={styles.matchCard} />
      </View>

      {/* Widget carousel (lección diaria + season pass + liga). */}
      <View>
        <Skeleton height={INICIO_WIDGET_CAROUSEL_HEIGHT} variant="dark" borderRadius={24} />
        <View style={styles.carouselDots}>
          <Skeleton width={6} height={6} variant="dark" borderRadius={3} />
          <Skeleton width={5} height={5} variant="dark" borderRadius={2.5} />
          <Skeleton width={5} height={5} variant="dark" borderRadius={2.5} />
        </View>
      </View>

      {/* Quick actions: grid 2x2 de tarjetas pequeñas. */}
      <View style={styles.quickGrid}>
        <Skeleton height={110} variant="dark" borderRadius={20} style={styles.quickCell} />
        <Skeleton height={110} variant="dark" borderRadius={20} style={styles.quickCell} />
      </View>
      <View style={styles.quickGrid}>
        <Skeleton height={110} variant="dark" borderRadius={20} style={styles.quickCell} />
        <Skeleton height={110} variant="dark" borderRadius={20} style={styles.quickCell} />
      </View>

      {/* IA Afinidad: card horizontal alta. */}
      <Skeleton height={96} variant="dark" borderRadius={24} />

      {/* Misiones: header + lista de 2 items. */}
      <View>
        <Skeleton width={120} height={18} variant="dark" borderRadius={6} />
        <View style={styles.missionsList}>
          <Skeleton height={72} variant="dark" borderRadius={16} />
          <Skeleton height={72} variant="dark" borderRadius={16} style={{ marginTop: 8 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: INICIO_STACK_GAP,
  },
  matchesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  matchCard: {
    flex: 1,
  },
  carouselDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: INICIO_WIDGET_CAROUSEL_DOTS_H,
    marginTop: 2,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickCell: {
    flex: 1,
  },
  missionsList: {
    marginTop: 10,
  },
});
