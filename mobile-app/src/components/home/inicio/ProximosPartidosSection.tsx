import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { PartidoItem } from '../../../screens/PartidosScreen';
import { PartidoOpenCard } from '../../partido/PartidoOpenCard';
import { INICIO_PAD_H } from './constants';
import { INICIO_ENTER_EASING } from './inicioMotion';
import { androidReadableText } from './textStyles';

const CARD_RADIUS = 12;
/** Máximo por slide; el real se acota al ancho de pantalla menos padding del home. */
const CAROUSEL_CARD_W_MAX = 300;
/** Aire entre el borde útil y la tarjeta (evita recorte en pantallas estrechas). */
const CAROUSEL_INNER_PAD = 12;

/** Equiv. Tailwind: bg-gradient-to-br from-[#F18F34]/8 via-transparent to-transparent */
const GRADIENT_BR_ORANGE_FADE = {
  colors: [
    'rgba(241, 143, 52, 0.08)',
    'rgba(241, 143, 52, 0)',
    'rgba(241, 143, 52, 0)',
  ] as const,
  locations: [0, 0.45, 1] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

type Props = {
  items: PartidoItem[];
  loading?: boolean;
  onPartidoPress?: (partido: PartidoItem) => void;
};

function subtitleLine(count: number): string {
  if (count === 1) return '1 reserva confirmada';
  return `${count} reservas confirmadas`;
}

/**
 * Capa absolute inset-0 como en web (hover allí = opacity-100; aquí siempre visible).
 * elevation > card para que en Android no quede debajo del elevation del PartidoOpenCard.
 */
function CarouselItemEnter({
  index,
  width,
  children,
}: {
  index: number;
  width: number;
  children: ReactNode;
}) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    p.setValue(0);
    Animated.timing(p, {
      toValue: 1,
      delay: index * 56,
      duration: 400,
      easing: INICIO_ENTER_EASING,
      useNativeDriver: true,
    }).start();
  }, [index, p]);

  return (
    <Animated.View
      style={[
        styles.carouselItem,
        {
          width,
          opacity: p,
          transform: [
            {
              translateX: p.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ProximoCard({
  item,
  onPress,
  fullWidth,
}: {
  item: PartidoItem;
  onPress: () => void;
  fullWidth: boolean;
}) {
  return (
    <View style={[styles.cardShell, fullWidth && styles.cardShellFull]}>
      <PartidoOpenCard item={item} onPress={onPress} fullWidth={fullWidth} />
      <LinearGradient
        pointerEvents="none"
        colors={[...GRADIENT_BR_ORANGE_FADE.colors]}
        locations={[...GRADIENT_BR_ORANGE_FADE.locations]}
        start={GRADIENT_BR_ORANGE_FADE.start}
        end={GRADIENT_BR_ORANGE_FADE.end}
        style={styles.cardGlowOverlay}
      />
    </View>
  );
}

export function ProximosPartidosSection({
  items,
  loading,
  onPartidoPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const usableW = windowW - INICIO_PAD_H * 2;
  /** Una reserva: card a todo el ancho útil del Inicio. Dos o más: ancho tipo carrusel (como antes). */
  const carouselCardW = Math.min(
    CAROUSEL_CARD_W_MAX,
    Math.max(200, usableW - CAROUSEL_INNER_PAD),
  );
  const singleCardW = Math.max(200, usableW);
  const cardWidth =
    !loading && items.length === 1 ? singleCardW : carouselCardW;

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>Próximos partidos</Text>
          <Text style={styles.subtitle}>
            {loading && items.length === 0
              ? 'Cargando…'
              : subtitleLine(items.length)}
          </Text>
        </View>
      </View>

      {loading && items.length === 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          removeClippedSubviews={false}
          scrollEnabled={false}
          style={styles.carouselScroll}
          contentContainerStyle={[
            styles.carouselContent,
            { paddingRight: 12 + insets.right },
          ]}
        >
          <CarouselItemEnter index={0} width={carouselCardW}>
            <Pressable style={[styles.skeletonCard, { width: carouselCardW }]} disabled>
              <LinearGradient
                colors={[...GRADIENT_BR_ORANGE_FADE.colors]}
                locations={[...GRADIENT_BR_ORANGE_FADE.locations]}
                start={GRADIENT_BR_ORANGE_FADE.start}
                end={GRADIENT_BR_ORANGE_FADE.end}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.skeletonLineLg} />
              <View style={styles.skeletonLineSm} />
            </Pressable>
          </CarouselItemEnter>
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          removeClippedSubviews={false}
          scrollEnabled={items.length > 1}
          style={styles.carouselScroll}
          contentContainerStyle={[
            styles.carouselContent,
            {
              paddingRight:
                items.length === 1 ? insets.right : 12 + insets.right,
            },
          ]}
        >
          {items.map((item, index) => (
            <CarouselItemEnter key={item.id} index={index} width={cardWidth}>
              <ProximoCard
                item={item}
                fullWidth={items.length === 1}
                onPress={() => onPartidoPress?.(item)}
              />
            </CarouselItemEnter>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignSelf: 'stretch',
    width: '100%',
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTextCol: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
  title: {
    ...androidReadableText({
      fontSize: 20,
      fontWeight: '900',
      color: '#ffffff',
      letterSpacing: -0.3,
    }),
    ...Platform.select({
      android: {
        includeFontPadding: false,
        width: '100%' as const,
        flexShrink: 0,
      },
      default: {},
    }),
  },
  subtitle: {
    ...androidReadableText({
      fontSize: 12,
      color: '#6b7280',
      marginTop: 2,
      fontWeight: '500',
    }),
    ...Platform.select({
      android: {
        includeFontPadding: false,
        width: '100%' as const,
        flexShrink: 0,
      },
      default: {},
    }),
  },
  carouselScroll: {
    overflow: 'visible',
    /** iOS: ScrollView horizontal dentro de ScrollView vertical a veces mide altura 0 sin mínimo. */
    ...Platform.select({
      ios: { minHeight: 180 },
      default: {},
    }),
  },
  carouselContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingLeft: 0,
    paddingTop: 6,
    paddingBottom: 10,
  },
  carouselItem: {
    flexShrink: 0,
    overflow: 'visible',
  },
  cardShell: {
    position: 'relative',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  cardShellFull: {
    width: '100%',
    alignSelf: 'stretch',
  },
  cardGlowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
    ...Platform.select({
      ios: { zIndex: 2 },
      android: {
        zIndex: 2,
        elevation: 10,
      },
      default: {},
    }),
  },
  skeletonCard: {
    minHeight: 120,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    padding: 16,
    justifyContent: 'center',
    gap: 10,
  },
  skeletonLineLg: {
    height: 14,
    width: '72%',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonLineSm: {
    height: 10,
    width: '44%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
