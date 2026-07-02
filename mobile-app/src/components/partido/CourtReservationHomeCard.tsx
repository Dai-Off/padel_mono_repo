import { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { CourtReservation } from '../../api/bookings';
import { formatPartidoDateTimeLabel } from '../../lib/clubTimeZone';
import { useTranslation } from '../../i18n';
import {
  HOME_ACTIVITY_CARD_MIN_HEIGHT,
  HOME_ACTIVITY_COL_GAP,
  HOME_ACTIVITY_LEFT_COL_HEIGHT,
  HOME_ACTIVITY_ROW_GAP,
  HOME_ACTIVITY_SLOTS_HEIGHT,
  HOME_ACTIVITY_THUMB_SIZE,
} from '../home/inicio/homeActivityCardLayout';

const PLACEHOLDER_URIS = [
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400&h=300&fit=crop',
];

function pickPlaceholderUri(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return PLACEHOLDER_URIS[h % PLACEHOLDER_URIS.length];
}

function splitDateTime(dateTime: string): { datePart: string; timePart: string } {
  const parts = dateTime.split(' · ');
  if (parts.length >= 2) {
    return {
      datePart: parts[0]?.trim() ?? '',
      timePart: parts[1]?.trim() ?? '',
    };
  }
  return { datePart: dateTime, timePart: '' };
}

function durationMinutes(startAt: string, endAt: string): number {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

function durationHuman(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h} hora${h > 1 ? 's' : ''} ${m} minutos`;
}

type Props = {
  item: CourtReservation;
  onPress: () => void;
  fullWidth?: boolean;
};

/** Tarjeta de reserva privada alineada visualmente con PartidoOpenCard. */
export function CourtReservationHomeCard({ item, onPress, fullWidth }: Props) {
  const { t } = useTranslation();

  const primaryUri = pickPlaceholderUri(item.id);
  const fallbackUri = pickPlaceholderUri(`${item.id}-fb`);
  const [thumbUri, setThumbUri] = useState(primaryUri);

  useEffect(() => {
    setThumbUri(pickPlaceholderUri(item.id));
  }, [item.id]);

  const isPast = new Date(item.end_at).getTime() < Date.now();
  const isPending = item.status === 'pending_payment';
  const durationMin = durationMinutes(item.start_at, item.end_at);
  const dateTimeLabel = formatPartidoDateTimeLabel(item.start_at);
  const { datePart, timePart } = splitDateTime(dateTimeLabel);
  const venueTitle = item.club_name?.trim() || t('common.clubFallback');
  const courtLabel = item.court_name?.trim() || '—';
  const priceMain =
    item.total_price_cents > 0 ? `${(item.total_price_cents / 100).toFixed(2)} €` : '—';

  const phaseLabel = isPast
    ? t('partidos.statusFinished')
    : t('partidos.statusUpcoming');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardFullWidth,
        styles.cardReservation,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardBorder} pointerEvents="none" />
      <View style={styles.inner}>
        <View style={styles.mainRow}>
          <View style={styles.leftCol}>
            <View style={styles.thumbWrap}>
              <Image
                source={{ uri: thumbUri }}
                style={styles.thumb}
                resizeMode="cover"
                onError={() => {
                  if (thumbUri !== fallbackUri) setThumbUri(fallbackUri);
                }}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.42)', 'transparent']}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.thumbOverlay}
              />
              <View
                style={[
                  styles.thumbPhasePill,
                  isPast && styles.thumbPhasePillPast,
                ]}
              >
                <Text
                  style={[
                    styles.thumbPhasePillText,
                    isPast && styles.thumbPhasePillTextPast,
                  ]}
                >
                  {phaseLabel}
                </Text>
              </View>
              <View style={styles.priceTag}>
                <Text style={styles.priceLine}>
                  <Text style={styles.priceMain}>{priceMain}</Text>
                  {durationMin > 0 ? (
                    <Text style={styles.priceSub}>/{durationHuman(durationMin)}</Text>
                  ) : null}
                </Text>
              </View>
            </View>
            <View style={styles.slotsPlaceholder} />
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {venueTitle}
            </Text>
            <View style={styles.visibilityBadge}>
              <Ionicons name="bookmark-outline" size={11} color="#F18F34" />
              <Text style={styles.visibilityBadgeTxt}>{t('partidos.yourReservation')}</Text>
            </View>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text style={styles.dateTxt} numberOfLines={1}>
                {datePart}
              </Text>
              {timePart ? (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.timeTxt}>{timePart}</Text>
                </>
              ) : null}
            </View>
            <View style={styles.badgesColumn}>
              <View style={[styles.badge, styles.badgeBand]}>
                <Text style={styles.badgeTxt}>{courtLabel}</Text>
              </View>
              <View style={[styles.badge, styles.badgeBand]}>
                <Text style={styles.badgeTxt}>
                  {isPending
                    ? t('partidos.courtReservationStatusPending').toUpperCase()
                    : t('partidos.courtReservationStatusConfirmed').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    minHeight: HOME_ACTIVITY_CARD_MIN_HEIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  cardFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  cardReservation: {
    borderColor: 'rgba(241, 143, 52, 0.35)',
  },
  pressed: { opacity: 0.92 },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inner: {
    padding: 12,
    position: 'relative',
    zIndex: 2,
    flex: 1,
  },
  mainRow: {
    flexDirection: 'row',
    gap: HOME_ACTIVITY_ROW_GAP,
    alignItems: 'flex-start',
    flex: 1,
  },
  leftCol: {
    width: HOME_ACTIVITY_THUMB_SIZE,
    gap: HOME_ACTIVITY_COL_GAP,
  },
  slotsPlaceholder: {
    width: HOME_ACTIVITY_THUMB_SIZE,
    height: HOME_ACTIVITY_SLOTS_HEIGHT,
  },
  thumbWrap: {
    width: HOME_ACTIVITY_THUMB_SIZE,
    height: HOME_ACTIVITY_THUMB_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  thumb: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbPhasePill: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 24, 18, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.55)',
  },
  thumbPhasePillPast: {
    backgroundColor: 'rgba(36, 20, 8, 0.9)',
    borderColor: 'rgba(251, 146, 60, 0.62)',
  },
  thumbPhasePillText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#ecfdf5',
    textTransform: 'uppercase',
    lineHeight: 10,
  },
  thumbPhasePillTextPast: {
    color: '#ffedd5',
  },
  priceTag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  priceLine: { lineHeight: 14 },
  priceMain: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
  },
  priceSub: {
    fontSize: 9,
    color: '#d1d5db',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    minWidth: 0,
    minHeight: HOME_ACTIVITY_LEFT_COL_HEIGHT,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
  },
  visibilityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(241, 143, 52, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.35)',
  },
  visibilityBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F18F34',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  dateTxt: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    flexShrink: 1,
  },
  dot: { fontSize: 12, color: '#4b5563' },
  timeTxt: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  badgesColumn: {
    flexDirection: 'column',
    alignSelf: 'stretch',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  badgeBand: {
    alignSelf: 'stretch',
  },
  badgeTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d1d5db',
    textTransform: 'uppercase',
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
});
