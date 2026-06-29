import { Children, useCallback, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { PagerDots } from '../../ui/PagerDots';
import { INICIO_PAD_H } from './constants';
/** Misma altura fija que `WidgetCarousel` en X7 `InicioScreen.tsx` (`height: '160px'`). */
export const INICIO_WIDGET_CAROUSEL_HEIGHT = 160;
export const INICIO_WIDGET_CAROUSEL_DOTS_H = 20;

type Props = {
  children: ReactNode;
};

/**
 * Carrusel de widgets del Inicio: swipe horizontal con `pagingEnabled` e indicadores.
 */
export function InicioWidgetsCarousel({ children }: Props) {
  const { width: windowW } = useWindowDimensions();
  const pageW = Math.max(1, windowW - INICIO_PAD_H * 2);
  const slides = Children.toArray(children);
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / pageW);
      setActiveIndex(Math.min(Math.max(index, 0), slides.length - 1));
    },
    [pageW, slides.length],
  );

  const showDots = slides.length > 1;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
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
      {showDots ? <PagerDots count={slides.length} activeIndex={activeIndex} /> : null}
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
    flexGrow: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    flexShrink: 0,
    overflow: 'hidden',
  },
});
