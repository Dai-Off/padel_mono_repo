import { useMemo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CourtReservation } from '../../../api/bookings';
import { INICIO_PAD_H } from './constants';
import { androidReadableText } from './textStyles';
import { formatLocale, useTranslation } from '../../../i18n';

const CARD_RADIUS = 12;
const CAROUSEL_CARD_W_MAX = 300;
const CAROUSEL_INNER_PAD = 12;

type Props = {
  items: CourtReservation[];
  loading?: boolean;
  onReservationPress?: (reservation: CourtReservation) => void;
};

function formatWhen(iso: string, numberLocale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(numberLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CourtReservationCard({
  item,
  onPress,
  fullWidth,
  numberLocale,
}: {
  item: CourtReservation;
  onPress: () => void;
  fullWidth: boolean;
  numberLocale: string;
}) {
  const { t } = useTranslation();
  const title = [item.court_name, item.club_name].filter(Boolean).join(' · ');
  const price =
    item.total_price_cents > 0
      ? `${(item.total_price_cents / 100).toFixed(2)} €`
      : '—';
  const isPending = item.status === 'pending_payment';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardFull,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('partidos.yourReservation')}</Text>
        </View>
        <Text style={[styles.status, isPending && styles.statusPending]}>
          {isPending
            ? t('partidos.courtReservationStatusPending')
            : t('partidos.courtReservationStatusConfirmed')}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title || t('common.clubFallback')}
      </Text>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
        <Text style={styles.metaText}>{formatWhen(item.start_at, numberLocale)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="cash-outline" size={14} color="#9ca3af" />
        <Text style={styles.metaText}>{price}</Text>
      </View>
    </Pressable>
  );
}

export function ProximasReservasPistaSection({
  items,
  loading,
  onReservationPress,
}: Props) {
  const { t, locale } = useTranslation();
  const numberLocale = formatLocale(locale);
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();

  const upcomingItems = useMemo(() => {
    const now = Date.now();
    return items
      .filter((item) => new Date(item.end_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [items]);

  const usableW = windowW - INICIO_PAD_H * 2;
  const carouselCardW = Math.min(CAROUSEL_CARD_W_MAX, Math.max(200, usableW - CAROUSEL_INNER_PAD));
  const singleCardW = Math.max(200, usableW);
  const cardWidth = !loading && upcomingItems.length === 1 ? singleCardW : carouselCardW;

  if (!loading && upcomingItems.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={styles.titleHeader}>{t('home.proximasReservasPista.title')}</Text>
          <Text style={styles.subtitle}>
            {loading && upcomingItems.length === 0
              ? t('home.proximasReservasPista.loading')
              : upcomingItems.length === 1
                ? t('home.proximasReservasPista.oneConfirmed')
                : t('home.proximasReservasPista.manyConfirmed', { count: upcomingItems.length })}
          </Text>
        </View>
      </View>

      {loading && upcomingItems.length === 0 ? (
        <View style={[styles.skeletonCard, { width: carouselCardW }]} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          scrollEnabled={upcomingItems.length > 1}
          contentContainerStyle={[
            styles.carouselContent,
            { paddingRight: upcomingItems.length === 1 ? insets.right : 12 + insets.right },
          ]}
        >
          {upcomingItems.map((item) => (
            <View key={item.id} style={{ width: cardWidth }}>
              <CourtReservationCard
                item={item}
                fullWidth={upcomingItems.length === 1}
                numberLocale={numberLocale}
                onPress={() => onReservationPress?.(item)}
              />
            </View>
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
  titleHeader: {
    ...androidReadableText({
      fontSize: 20,
      fontWeight: '900',
      color: '#ffffff',
      letterSpacing: -0.3,
    }),
    ...Platform.select({
      android: { includeFontPadding: false, width: '100%' as const, flexShrink: 0 },
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
      android: { includeFontPadding: false, width: '100%' as const, flexShrink: 0 },
      default: {},
    }),
  },
  carouselContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 10,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    gap: 8,
    minHeight: 132,
  },
  cardFull: {
    width: '100%',
    alignSelf: 'stretch',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(241, 143, 52, 0.18)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F18F34',
  },
  status: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34d399',
  },
  statusPending: {
    color: '#fbbf24',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#d1d5db',
    flex: 1,
  },
  skeletonCard: {
    minHeight: 132,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pressed: { opacity: 0.9 },
});
