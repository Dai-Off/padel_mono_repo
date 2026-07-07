import { useCallback, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CourtReservation } from '../api/bookings';
import {
  cancelCourtReservation,
  fetchCourtReservationCancelPreview,
  type CourtReservationCancelPreview,
} from '../api/bookings';
import { ClubInfoSheet } from '../components/partido/ClubInfoSheet';
import { SafeScrollView } from '../components/ui/SafeScrollView';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { formatPartidoDateTimeLabel } from '../lib/clubTimeZone';
import type { PartidoItem } from './PartidosScreen';
import { isFeatureHidden } from '../config';

const BG = '#0F0F0F';
const ACCENT = '#F18F34';
const HERO_H = 224;

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

type TabId = 'info' | 'club';

type Props = {
  reservation: CourtReservation;
  onBack: () => void;
  onCancelled?: () => void;
};

function formatDurationMinutes(
  startIso: string,
  endIso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '—';
  return t('common.durationMin', { minutes: mins });
}

function buildCancelMessage(
  t: (key: string) => string,
  preview: CourtReservationCancelPreview | null,
): string {
  const noRefund = preview?.ok === true && preview.refund_eligible === false;
  const base = noRefund
    ? t('partidos.courtReservationCancelBodyNoRefund')
    : t('partidos.courtReservationCancelBody');
  const policyText = preview?.policy_message?.trim();
  if (noRefund && policyText) {
    return `${base}\n\n${policyText}`;
  }
  return base;
}

function openInMaps(venue: string, location?: string | null) {
  const address = location ? `${venue}, ${location}` : venue;
  const encoded = encodeURIComponent(address.trim());
  const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  Linking.openURL(url).catch(() => {});
}

function reservationToPartidoStub(
  reservation: CourtReservation,
  dateTime: string,
  duration: string,
  price: string,
  heroUri: string,
): PartidoItem {
  const clubName = reservation.club_name ?? '';
  const courtName = reservation.court_name ?? '';
  return {
    id: reservation.id,
    dateTime,
    mode: 'amistoso',
    typeLabel: '',
    levelRange: '',
    players: [],
    venue: clubName || courtName || '—',
    location: clubName,
    price,
    pricePerPlayer: price,
    totalPriceCents: reservation.total_price_cents,
    duration,
    courtName: courtName || undefined,
    venueImage: heroUri,
    venueAddress: clubName || undefined,
  };
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconBox}>
        <Ionicons name={icon} size={18} color="#9ca3af" />
      </View>
      <View style={styles.detailRowBody}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={styles.detailRowValue}>{value}</Text>
      </View>
    </View>
  );
}

/** Detalle de reserva privada — mismo layout que partidos, sin join ni jugadores. */
export function CourtReservationDetailScreen({
  reservation,
  onBack,
  onCancelled,
}: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ComponentRef<typeof SafeScrollView>>(null);
  const sectionY = useRef({ info: 0, club: 0 });

  const [previewLoading, setPreviewLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [clubInfoVisible, setClubInfoVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('info');

  const primaryHeroUri = useMemo(() => pickPlaceholderUri(reservation.id), [reservation.id]);
  const heroFallbackUri = useMemo(
    () => pickPlaceholderUri(`${reservation.id}-fb`),
    [reservation.id],
  );
  const [heroUri, setHeroUri] = useState(primaryHeroUri);

  const isPending = reservation.status === 'pending_payment';
  const isUpcoming = new Date(reservation.end_at).getTime() > Date.now();
  const canRequestRefund = Boolean(session?.access_token) && isUpcoming;
  const refundBtnBusy = previewLoading || cancelBusy;

  const dateTime = formatPartidoDateTimeLabel(reservation.start_at);
  const duration = formatDurationMinutes(reservation.start_at, reservation.end_at, t);
  const price =
    reservation.total_price_cents > 0
      ? `${(reservation.total_price_cents / 100).toFixed(2)} €`
      : '—';
  const clubName = reservation.club_name ?? '—';
  const courtLine = reservation.court_name ?? '—';
  const statusLabel = isPending
    ? t('partidos.courtReservationStatusPending')
    : t('partidos.courtReservationStatusConfirmed');

  const partidoStub = useMemo(
    () => reservationToPartidoStub(reservation, dateTime, duration, price, heroUri),
    [reservation, dateTime, duration, price, heroUri],
  );

  const bottomReserve = insets.bottom + (canRequestRefund ? 96 : 24);

  const scrollToTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const y = sectionY.current[tab];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  const handleRequestRefund = useCallback(() => {
    if (refundBtnBusy) return;
    const token = session?.access_token;
    if (!token) {
      Alert.alert(t('alerts.login.title'), t('alerts.privateCancel.title'));
      return;
    }

    void (async () => {
      setPreviewLoading(true);
      try {
        const preview = await fetchCourtReservationCancelPreview(reservation.id, token);
        const message = buildCancelMessage(t, preview.ok ? preview : null);

        Alert.alert(t('alerts.privateCancel.title'), message, [
          { text: t('common.no'), style: 'cancel' },
          {
            text: t('partidos.courtReservationRefundButton'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setCancelBusy(true);
                try {
                  const r = await cancelCourtReservation(reservation.id, token);
                  if (r.ok) {
                    const doneMessage = r.refundEligible
                      ? t('alerts.privateCancel.done')
                      : t('alerts.privateCancel.doneNoRefund');
                    onCancelled?.();
                    onBack();
                    Alert.alert(t('alerts.ready.title'), doneMessage);
                    return;
                  }
                  const extra =
                    r.refund_errors?.length ? `\n\n${r.refund_errors.slice(0, 3).join('\n')}` : '';
                  Alert.alert(t('alerts.privateCancel.fail'), `${r.error}${extra}`);
                } finally {
                  setCancelBusy(false);
                }
              })();
            },
          },
        ]);
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, [refundBtnBusy, session?.access_token, reservation.id, onBack, onCancelled, t]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomReserve }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        bottomOffset={Math.max(insets.bottom, 16) + 96}
      >
        <View>
          <View style={styles.heroWrap}>
            <Image
              source={{ uri: heroUri }}
              style={styles.heroImg}
              resizeMode="cover"
              onError={() => {
                if (heroUri !== heroFallbackUri) setHeroUri(heroFallbackUri);
              }}
            />
            <LinearGradient
              colors={['transparent', 'rgba(15,15,15,0.55)', BG]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroTopBar, { paddingTop: 12 }]}>
              <Pressable
                style={({ pressed }) => [styles.heroCircleBtn, pressed && styles.pressed]}
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.heroBottom}>
              <View style={styles.heroBadgesRow}>
                <View style={[styles.matchKindBadge, styles.badgeReservation]}>
                  <Ionicons name="lock-closed" size={10} color="#fff" />
                  <Text style={styles.matchKindBadgeText}>{t('partidos.yourReservation')}</Text>
                </View>
                <View style={styles.badgePadel}>
                  <Text style={styles.badgePadelText}>{t('common.sportPadel')}</Text>
                </View>
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {clubName}
              </Text>
              <View style={styles.heroLocRow}>
                <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroLocText} numberOfLines={1}>
                  {courtLine}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.tabsOuter}>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {(
                [
                  ['info', t('partidos.detailTabInfo')],
                  ['club', t('common.clubFallback')],
                ] as const
              ).map(([id, label]) => (
                <Pressable
                  key={id}
                  onPress={() => scrollToTab(id)}
                  style={({ pressed }) => [
                    styles.tabPill,
                    activeTab === id && styles.tabPillActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.tabPillText, activeTab === id && styles.tabPillTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.info = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionPad}>
              <View style={styles.glassCard}>
                <Text style={styles.cardTitle}>{t('partidos.detailMatchDetails')}</Text>
                <View style={styles.statusPillRow}>
                  <View style={[styles.statusPill, isPending && styles.statusPillPending]}>
                    <Text style={[styles.statusPillText, isPending && styles.statusPillTextPending]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                {reservation.total_price_cents > 0 ? (
                  <View style={styles.priceHighlight}>
                    <Text style={styles.priceHighlightLabel}>
                      {t('partidos.courtReservationTotalPrice')}
                    </Text>
                    <Text style={styles.priceHighlightValue}>{price}</Text>
                  </View>
                ) : null}
                <DetailRow icon="calendar-outline" label={t('partidos.detailDate')} value={dateTime} />
                <DetailRow
                  icon="time-outline"
                  label={t('partidos.detailDuration')}
                  value={duration}
                />
                <DetailRow icon="information-circle-outline" label={t('partidos.detailCourt')} value={courtLine} />
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                    onPress={() => openInMaps(clubName, courtLine)}
                  >
                    <View style={styles.actionIconFill}>
                      <Ionicons name="navigate" size={22} color="#fff" />
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      {t('partidos.createLocation')}
                    </Text>
                  </Pressable>
                  {!isFeatureHidden('reservationDetail.contactActions') && (
                    <>
                      <Pressable
                        style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                        onPress={() => Alert.alert(t('alerts.web.title'), t('alerts.web.body'))}
                      >
                        <View style={styles.actionIconOutline}>
                          <Ionicons name="globe-outline" size={22} color="rgba(255,255,255,0.6)" />
                        </View>
                        <Text style={styles.actionLabel} numberOfLines={2}>
                          {t('alerts.web.title')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                        onPress={() => Alert.alert(t('alerts.phone.title'), t('alerts.phone.body'))}
                      >
                        <View style={styles.actionIconOutline}>
                          <Ionicons name="call-outline" size={22} color="rgba(255,255,255,0.6)" />
                        </View>
                        <Text style={styles.actionLabel} numberOfLines={2}>
                          {t('alerts.phone.title')}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>

          <View
            onLayout={(e) => {
              sectionY.current.club = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionPad}>
              <Pressable
                style={({ pressed }) => [styles.clubRow, pressed && styles.pressed]}
                onPress={() => setClubInfoVisible(true)}
              >
                <Image source={{ uri: heroUri }} style={styles.clubThumb} />
                <View style={styles.clubRowBody}>
                  <Text style={styles.clubRowTitle} numberOfLines={1}>
                    {clubName}
                  </Text>
                  <Text style={styles.clubRowSub} numberOfLines={2}>
                    {courtLine}
                  </Text>
                </View>
                <View style={styles.clubRowMap}>
                  <Ionicons name="location" size={18} color="#fff" />
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeScrollView>

      {canRequestRefund ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.refundCta,
              pressed && !refundBtnBusy && styles.pressed,
              refundBtnBusy && styles.refundCtaBusy,
            ]}
            onPress={handleRequestRefund}
            disabled={refundBtnBusy}
            accessibilityRole="button"
            accessibilityLabel={t('partidos.courtReservationRefundButton')}
          >
            {refundBtnBusy ? (
              <ActivityIndicator color="#f87171" />
            ) : (
              <>
                <Ionicons name="arrow-undo-outline" size={20} color="#f87171" />
                <Text style={styles.refundCtaText}>{t('partidos.courtReservationRefundButton')}</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      <ClubInfoSheet
        visible={clubInfoVisible}
        onClose={() => setClubInfoVisible(false)}
        partido={partidoStub}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  heroWrap: {
    height: HERO_H,
    width: '100%',
    position: 'relative',
    backgroundColor: '#000',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: HERO_H,
  },
  heroTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  heroBadgesRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  matchKindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchKindBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeReservation: {
    backgroundColor: 'rgba(241,143,52,0.9)',
  },
  badgePadel: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgePadelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  heroLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLocText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  tabsOuter: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabPillActive: {
    backgroundColor: ACCENT,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  sectionPad: {
    paddingHorizontal: 16,
    gap: 12,
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  statusPillRow: {
    flexDirection: 'row',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
  },
  statusPillPending: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34d399',
  },
  statusPillTextPending: {
    color: '#fbbf24',
  },
  priceHighlight: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 143, 52, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.22)',
    gap: 4,
  },
  priceHighlightLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
  },
  priceHighlightValue: {
    fontSize: 22,
    fontWeight: '800',
    color: ACCENT,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  detailIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRowBody: { flex: 1, minWidth: 0 },
  detailRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 2,
  },
  detailRowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIconFill: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconOutline: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textAlign: 'center',
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  clubThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
  clubRowBody: { flex: 1, minWidth: 0 },
  clubRowTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  clubRowSub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  clubRowMap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  refundCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  refundCtaBusy: {
    opacity: 0.88,
  },
  refundCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f87171',
  },
  pressed: { opacity: 0.88 },
});
