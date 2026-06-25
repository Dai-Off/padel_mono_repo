import { StyleSheet, View } from 'react-native';

type PagerDotsProps = {
  count: number;
  activeIndex: number;
};

/** Indicadores de página (mismo estilo que el carrusel del Home). */
export function PagerDots({ count, activeIndex }: PagerDotsProps) {
  if (count <= 1) return null;

  return (
    <View style={styles.dotsRow} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i === activeIndex && styles.dotActive]}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === activeIndex }}
        />
      ))}
    </View>
  );
}

/** Tres puntos en columna: pista de que hay más contenido al hacer scroll vertical. */
export function VerticalScrollHint() {
  return (
    <View style={styles.verticalHint} pointerEvents="none">
      <View style={styles.dot} />
      <View style={[styles.dot, styles.dotMid]} />
      <View style={[styles.dot, styles.dotActive]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 20,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  verticalHint: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    marginBottom: 4,
  },
  dotMid: {
    opacity: 0.45,
  },
});
