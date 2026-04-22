import { Children, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { INICIO_PAD_H } from './constants';

/** Misma altura fija que `WidgetCarousel` en X7 `InicioScreen.tsx` (`height: '160px'`). */
export const INICIO_WIDGET_CAROUSEL_HEIGHT = 160;

type Props = {
  children: ReactNode;
};

/**
 * Carrusel de widgets como en X7: **altura 160px**, swipe horizontal con `pagingEnabled`.
 * Sin puntos de paginación (el prototipo no los muestra).
 */
export function InicioWidgetsCarousel({ children }: Props) {
  const { width: windowW } = useWindowDimensions();
  const pageW = Math.max(1, windowW - INICIO_PAD_H * 2);
  const slides = Children.toArray(children);

  return (
    <View style={[styles.wrap, { height: INICIO_WIDGET_CAROUSEL_HEIGHT }]}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        bounces={false}
        style={[styles.scroll, { height: INICIO_WIDGET_CAROUSEL_HEIGHT }]}
        contentContainerStyle={styles.scrollContent}
      >
        {slides.map((slide, i) => (
          <View
            key={i}
            style={[
              styles.page,
              { width: pageW, height: INICIO_WIDGET_CAROUSEL_HEIGHT },
            ]}
          >
            {slide}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    flexShrink: 0,
    overflow: 'hidden',
  },
});
