import {
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
import { ACCENT, INICIO_PAD_H } from './constants';
import { DASH, dash } from './dash';
import {
  androidReadableText,
  androidSectionHeading,
  androidSectionSubline,
} from './textStyles';

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

export function EnDirectoSection({
  partidos,
  loading,
  onPartidoPress,
  onOpenPartidos,
}: Props) {
  const insets = useSafeAreaInsets();
  const countLine = loading
    ? DASH
    : `${partidos.length} evento${partidos.length === 1 ? '' : 's'} próximo${partidos.length === 1 ? '' : 's'}`;

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
            <View style={styles.pingWrap}>
              <View style={styles.ping} />
              <View style={styles.dot} />
            </View>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingRight: INICIO_PAD_H + insets.right },
        ]}
      >
        {partidos.length > 0 ? (
          partidos.map((p) => {
              const { date, time } = splitDateTime(p.dateTime);
              const modeLabel =
                p.mode === 'competitivo' ? 'Competitivo' : 'Partido';
              const filled = filledSlots(p);
              const badge =
                filled === 1 ? '1 jugador' : `${filled} jugadores`;

              return (
                <Pressable
                  key={p.id}
                  onPress={() => onPartidoPress?.(p)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={styles.imgWrap}>
                    {p.venueImage ? (
                      <Image
                        source={{ uri: p.venueImage }}
                        style={styles.img}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.img, styles.placeholderImg]}>
                        <Ionicons name="image-outline" size={40} color="#6b7280" />
                      </View>
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
                      <View style={styles.pingWrapSm}>
                        <View style={styles.pingSm} />
                        <View style={styles.dotSm} />
                      </View>
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
                </Pressable>
              );
            })
        ) : (
          <Pressable
            onPress={() => onOpenPartidos?.()}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={[styles.imgWrap, styles.placeholderImg]}>
              <Ionicons name="image-outline" size={48} color="#4b5563" />
            </View>
            <View style={styles.body}>
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>{DASH}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {DASH}
              </Text>
              <View style={styles.placeRow}>
                <Ionicons name="location" size={14} color="#9ca3af" />
                <Text style={styles.place}>{DASH}</Text>
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
                  <Text style={styles.metaText}>{DASH}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#9ca3af" />
                  <Text style={styles.metaText}>{DASH}</Text>
                </View>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerMuted}>{DASH}</Text>
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
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: -INICIO_PAD_H,
    alignSelf: 'stretch',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: INICIO_PAD_H,
    paddingBottom: 4,
  },
  /** Más ancho útil para el título (menos padding lateral que iOS). */
  headerAndroid: {
    alignSelf: 'stretch',
    width: '100%',
    minWidth: '100%',
    paddingHorizontal: 8,
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
  pingWrap: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    marginRight: 2,
    flexShrink: 0,
  },
  ping: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    opacity: 0.6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dc2626',
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
    paddingLeft: INICIO_PAD_H,
    paddingBottom: 8,
  },
  card: {
    width: CARD_W,
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
  pingWrapSm: { width: 10, height: 10, justifyContent: 'center' },
  pingSm: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    opacity: 0.6,
  },
  dotSm: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
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
});
