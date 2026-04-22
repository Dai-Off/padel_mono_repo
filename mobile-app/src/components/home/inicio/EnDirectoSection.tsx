import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { PartidoItem } from '../../../screens/PartidosScreen';
import { ACCENT } from './constants';
import { DASH, dash } from './dash';
import {
  androidReadableText,
  androidSectionHeading,
  androidSectionSubline,
} from './textStyles';
import { LivePingRing } from './LivePingRing';
import { INICIO_ENTER_EASING } from './inicioMotion';
import { ScalePressable } from './ScalePressable';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Evita que Android parta el título y solo pinte «En». */
const TITLE_EN_DIRECTO = 'En\u00A0Directo';

const CARD_W = 280;

type Props = {
  partidos: PartidoItem[];
  loading?: boolean;
  onPartidoPress?: (partido: PartidoItem) => void;
  onOpenPartidos?: () => void;
};

function splitDateTime(dateTime: string): { date: string; time: string } {
  const parts = dateTime.split(' · ');
  if (parts.length >= 2) {
    return {
      date: parts[0]?.trim() || DASH,
      time: parts[1]?.trim() || DASH,
    };
  }
  const t = dateTime.trim();
  return { date: t || DASH, time: DASH };
}

function filledSlots(p: PartidoItem): number {
  return p.players.filter((x) => !x.isFree).length;
}

function EnDirectoLiveCard({
  p,
  onPartidoPress,
}: {
  p: PartidoItem;
  onPartidoPress?: (partido: PartidoItem) => void;
}) {
  const imgScale = useRef(new Animated.Value(1)).current;

  const bumpImg = (to: number, ms: number) => {
    Animated.timing(imgScale, {
      toValue: to,
      duration: ms,
      easing: INICIO_ENTER_EASING,
      useNativeDriver: true,
    }).start();
  };

  const { date, time } = splitDateTime(p.dateTime);
  const modeLabel = p.mode === 'competitivo' ? 'Competitivo' : 'Partido';
  const filled = filledSlots(p);
  const badge = filled === 1 ? '1 jugador' : `${filled} jugadores`;

  return (
    <ScalePressable
      pressedScale={0.985}
      style={styles.card}
      onPress={() => onPartidoPress?.(p)}
      onPressIn={() => bumpImg(1.08, 420)}
      onPressOut={() => bumpImg(1, 280)}
    >
      <View style={styles.imgWrap}>
        {p.venueImage ? (
          <AnimatedImage
            source={{ uri: p.venueImage }}
            style={[styles.img, { transform: [{ scale: imgScale }] }]}
            resizeMode="cover"
          />
        ) : (
          <Animated.View
            style={[
              styles.img,
              styles.placeholderImg,
              { transform: [{ scale: imgScale }] },
            ]}
          >
            <Ionicons name="image-outline" size={40} color="#6b7280" />
          </Animated.View>
        )}
        <LinearGradient
          colors={[
            'transparent',
            'rgba(0,0,0,0.45)',
            'rgba(0,0,0,0.85)',
          ]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.livePill}>
          <LivePingRing size={10} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.badgeTop}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
        <View style={styles.iconCorner}>
          <Ionicons name="people" size={22} color="#fff" />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{modeLabel}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {dash(p.venue)}
        </Text>
        <View style={styles.placeRow}>
          <Ionicons name="location" size={14} color="#9ca3af" />
          <Text style={styles.place}>{dash(p.location)}</Text>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color="#9ca3af"
            />
            <Text style={styles.metaText}>{date}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons
              name="time-outline"
              size={14}
              color="#9ca3af"
            />
            <Text style={styles.metaText}>{time}</Text>
          </View>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.price}>{dash(p.price)}</Text>
          <Text style={styles.levelHint}>{dash(p.levelRange)}</Text>
          <LinearGradient
            colors={[ACCENT, '#FFA940']}
            style={styles.ctaIcon}
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color="#fff"
              style={styles.ctaArrow}
            />
          </LinearGradient>
        </View>
      </View>
    </ScalePressable>
  );
}

export function EnDirectoSection({
  partidos,
  loading,
  onPartidoPress,
  onOpenPartidos,
}: Props) {
  const insets = useSafeAreaInsets();
  const countLine = loading
    ? 'Buscando partidos en curso…'
    : partidos.length === 0
      ? 'Nadie en pista en este momento'
      : `${partidos.length} partido${partidos.length === 1 ? '' : 's'} en curso`;

  return (
    <View style={styles.section}>
      <View
        style={[
          styles.header,
          Platform.OS === 'android' && styles.headerAndroid,
        ]}
      >
        <View
          style={[
            styles.headerTextBlock,
            Platform.OS === 'android' && styles.headerTextBlockAndroid,
          ]}
        >
          <View style={styles.titleRow}>
            <LivePingRing size={12} />
            <View style={styles.titleTextShell}>
              <Text
                style={[
                  styles.h2,
                  Platform.OS === 'android' && styles.h2Android,
                ]}
                numberOfLines={2}
                {...(Platform.OS === 'android'
                  ? { textBreakStrategy: 'simple' as const }
                  : {})}
              >
                {TITLE_EN_DIRECTO}
              </Text>
            </View>
          </View>
          <Text style={styles.sub}>{countLine}</Text>
        </View>
      </View>
      {partidos.length > 0 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingRight: 12 + insets.right },
        ]}
      >
          {partidos.map((p) => (
            <EnDirectoLiveCard key={p.id} p={p} onPartidoPress={onPartidoPress} />
          ))}
      </ScrollView>
      ) : (
        <View style={styles.fullWidthRow}>
          {loading ? (
            <View
              style={[styles.emptyStateOuter, styles.skeletonCard]}
              accessibilityRole="progressbar"
            >
              <View style={styles.skeletonImg}>
                <ActivityIndicator size="small" color={ACCENT} />
              </View>
              <View style={styles.skeletonBody}>
                <View style={styles.skeletonLineShort} />
                <View style={styles.skeletonLineLong} />
                <View style={styles.skeletonLineMed} />
              </View>
            </View>
          ) : (
            <ScalePressable
              onPress={() => onOpenPartidos?.()}
              accessibilityRole="button"
              accessibilityLabel="Ver partidos abiertos"
              pressedScale={0.99}
              style={({ pressed }) => [
                styles.emptyStateOuter,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyGradient}
              >
                <View style={styles.emptyIconWrap}>
                  <Ionicons
                    name="radio-outline"
                    size={36}
                    color="rgba(241, 143, 52, 0.85)"
                  />
                </View>
                <Text
                  style={styles.emptyTitle}
                  {...(Platform.OS === 'android'
                    ? { textBreakStrategy: 'simple' as const }
                    : {})}
                >
                  No hay partidos en directo
                </Text>
                <Text
                  style={styles.emptySubtitle}
                  {...(Platform.OS === 'android'
                    ? { textBreakStrategy: 'simple' as const }
                    : {})}
                >
                  Ahora mismo no hay ningún partido dentro de su horario.{'\n'}
                  Cuando alguien esté jugando, lo mostraremos aquí.
                </Text>
                <View style={styles.emptyCtaWrap}>
                  <Text style={styles.emptyCtaText}>
                    Explorar partidos <Text style={styles.emptyCtaChevronText}>›</Text>
                  </Text>
                </View>
              </LinearGradient>
            </ScalePressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Misma columna que el resto del inicio (sin márgenes negativos: evita desbordes). */
  section: {
    alignSelf: 'stretch',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  /** Alineación título en Android (misma idea que otras secciones). */
  headerAndroid: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: '100%',
    paddingVertical: 2,
  },
  headerTextBlock: {
    flex: 1,
    alignSelf: 'stretch',
    paddingRight: 8,
  },
  /** Android: sin minWidth:0 (evita que flex comprima el texto a solo «En»). */
  headerTextBlockAndroid: {
    flexGrow: 1,
    width: '100%',
    minWidth: '100%',
    maxWidth: '100%',
    paddingRight: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'nowrap',
    width: '100%',
  },
  /** Toma el espacio tras el ping; sin minWidth:0 para no recortar el texto en Android. */
  titleTextShell: {
    flex: 1,
    justifyContent: 'center',
  },
  h2: androidSectionHeading({
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  }),
  h2Android: {
    width: '100%',
    flexShrink: 0,
  },
  sub: androidSectionSubline({
    fontSize: 14,
    color: '#6b7280',
    marginTop: 6,
  }),
  scroll: {
    flexDirection: 'row',
    gap: 16,
    paddingLeft: 0,
    paddingBottom: 8,
  },
  /** Misma anchura útil que las demás secciones (columna del ScrollView padre). */
  fullWidthRow: {
    width: '100%',
    paddingBottom: 8,
    alignSelf: 'stretch',
  },
  card: {
    width: CARD_W,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardFullWidth: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  /** Sin width fijo 280: en Android si no gana el merge, el texto del CTA se recorta. */
  emptyStateOuter: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pressed: { opacity: 0.95 },
  imgWrap: {
    height: 160,
    position: 'relative',
  },
  img: { width: '100%', height: '100%' },
  placeholderImg: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  liveText: androidReadableText({
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  }),
  badgeTop: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: ACCENT,
  },
  badgeText: androidReadableText({
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  }),
  iconCorner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  body: { padding: 16 },
  typePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  typePillText: androidReadableText({
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }),
  cardTitle: androidReadableText({
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  }),
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  place: androidReadableText({ fontSize: 12, color: '#9ca3af' }),
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: androidReadableText({
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  }),
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  price: androidReadableText({ fontSize: 18, fontWeight: '700', color: ACCENT }),
  levelHint: androidReadableText({
    fontSize: 12,
    color: '#6b7280',
    flex: 1,
  }),
  footerMuted: androidReadableText({
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  }),
  ctaIcon: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: { transform: [{ rotate: '45deg' }] },
  skeletonCard: {
    justifyContent: 'flex-start',
  },
  skeletonImg: {
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  skeletonBody: {
    padding: 16,
    gap: 10,
  },
  skeletonLineShort: {
    height: 10,
    width: '40%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonLineLong: {
    height: 12,
    width: '88%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  skeletonLineMed: {
    height: 10,
    width: '65%',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  emptyGradient: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    minHeight: 220,
    justifyContent: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(241, 143, 52, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: androidReadableText({
    fontSize: 17,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 8,
    lineHeight: 22,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        flexShrink: 1,
        width: '100%' as const,
      },
      default: {},
    }),
  }),
  emptySubtitle: androidReadableText({
    fontSize: 13,
    lineHeight: 20,
    color: '#9ca3af',
    marginBottom: 16,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        flexShrink: 1,
        width: '100%' as const,
      },
      default: {},
    }),
  }),
  emptyCtaWrap: {
    alignSelf: 'stretch',
    width: '100%',
  },
  /** Sin androidReadableText aquí: evita interacciones raras con medición en fila (Android). */
  emptyCtaText: Platform.select({
    ios: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: ACCENT,
    },
    default: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: ACCENT,
      includeFontPadding: false,
    },
  }),
  emptyCtaChevronText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: ACCENT,
  },
});
