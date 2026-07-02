import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '../../stripe';
import { useAuth } from '../../contexts/AuthContext';
import { useHomeData } from '../../contexts/HomeDataContext';
import { createIntentForNewMatch, confirmPaymentFromClient } from '../../api/payments';
import { sendMatchPlayerInvites } from '../../api/matchInvites';
import { PrivateInvitePlayerPicker, type SelectedInvitePlayer } from './PrivateInvitePlayerPicker';
import { AppKeyboardAvoidingView } from '../ui/AppKeyboardAvoidingView';
import { SafeScrollView } from '../ui/SafeScrollView';
import {
  defaultFriendlyRange,
  FriendlyLevelRangeSection,
} from './FriendlyLevelRangeSection';
import { fetchClubAvailabilityForCreate, OPEN_MATCH_DURATION_MIN } from '../../api/partidoClubs';
import type { ClubDisplay, SlotForCreate } from '../../api/partidoClubs';
import { theme } from '../../theme';
import type { BookingConfirmationData } from '../../screens/BookingConfirmationScreen';
import { resolveSlotStartEndUtc } from '../../lib/bookingSlotTime';
import { clubLocalDateTimeToUtcIso, setClubTimeZone } from '../../lib/clubTimeZone';
import { useSlotPrice } from '../../hooks/useSlotPrice';
import { fetchMyPlayerId } from '../../api/players';
import { formatLocale, useTranslation, type AppLocale } from '../../i18n';

export type LocationType = 'club_wematch' | 'pista_externa';

export type CrearPartidoFlowStep = 'location' | 'clubs' | 'tipo_partido' | 'configurar' | 'pista_externa';

type CrearPartidoLocationSheetProps = {
  /** `fullscreen` = pantalla completa (club + horarios). `modal` = solo “¿Dónde se juega?” (+ pista externa). */
  presentation?: 'modal' | 'fullscreen';
  visible?: boolean;
  /** Paso inicial (p. ej. `clubs` en pantalla completa tras elegir WeMatch en el modal). */
  initialStep?: CrearPartidoFlowStep;
  /** Tipo elegido en el modal antes de abrir pantalla completa de clubes. */
  initialMatchVisibility?: 'public' | 'private';
  /**
   * Si true (solo con `presentation="modal"`): tras elegir tipo de partido llama
   * `onContinueWeMatch` y el padre abre la pantalla completa de clubes.
   */
  modalOnlyWeMatch?: boolean;
  /** Tras elegir tipo en modal; el padre cierra el modal y abre pantalla completa. */
  onContinueWeMatch?: (matchVisibility: 'public' | 'private') => void;
  onClose: () => void;
  onSiguiente: (locationType: LocationType) => void;
  /** Tras pago y confirmación en backend; datos para pantalla de éxito. */
  onPartidoCreado?: (data: BookingConfirmationData) => void;
  organizerPlayerId?: string | null;
  /** Si el jugador no completó la nivelación inicial, la alerta ofrece ir al perfil. */
  onNavigateToCompleteOnboarding?: () => void;
};

type Step = CrearPartidoFlowStep;

type GenderOption = 'any' | 'male' | 'female' | 'mixed';

function slotDurationMin(_slot?: SlotForCreate | null): number {
  return OPEN_MATCH_DURATION_MIN;
}

function slotPriceForDuration(slot: SlotForCreate): string {
  const totalCents = Math.round(slot.minPriceCents * (slotDurationMin(slot) / 60));
  return totalCents >= 100 ? `${(totalCents / 100).toFixed(2)}€` : slot.minPriceFormatted;
}

function buildStartEnd(slot: SlotForCreate): { start_at: string; end_at: string } {
  return resolveSlotStartEndUtc({
    dateStr: slot.dateStr,
    time: slot.time,
    durationMinutes: slotDurationMin(slot),
    startAtUtc: slot.startAtUtc,
    endAtUtc: slot.endAtUtc,
    clubTimezone: slot.clubTimezone,
  });
}

function formatDateTimeForBookingConfirm(
  dateStr: string,
  time: string,
  locale: AppLocale,
  timeZone?: string,
): string {
  const tz = timeZone?.trim() || 'Europe/Madrid';
  const ref = new Date(clubLocalDateTimeToUtcIso(dateStr, '12:00', tz));
  const dayName = ref
    .toLocaleDateString(formatLocale(locale), { timeZone: tz, weekday: 'short' })
    .replace('.', '')
    .toUpperCase();
  const dayNum = parseInt(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' }).format(ref),
    10,
  );
  const month = ref
    .toLocaleDateString(formatLocale(locale), { timeZone: tz, month: 'short' })
    .replace('.', '');
  return `${dayName}, ${dayNum} ${month} · ${time}`;
}

type WeMatchSportFilter = 'padel' | 'tenis' | 'pickleball' | 'otro';
type CerramientoFilter = 'any' | 'indoor' | 'outdoor';

function sportLabelUi(s: string | undefined, t: (key: string) => string): string {
  const k = (s ?? 'padel').toLowerCase();
  const map: Record<string, string> = {
    padel: t('common.sportPadel'),
    tenis: t('common.sportTenis'),
    pickleball: t('common.sportPickleball'),
    otro: t('common.allOption'),
  };
  return map[k] ?? k;
}

function getInitials(fullName?: string | null, email?: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() ?? '';
  }
  return email?.[0]?.toUpperCase() ?? '?';
}

export function CrearPartidoLocationSheet({
  presentation = 'modal',
  visible = true,
  initialStep = 'location',
  initialMatchVisibility = 'public',
  modalOnlyWeMatch = false,
  onContinueWeMatch,
  onClose,
  onSiguiente,
  onPartidoCreado,
  organizerPlayerId: organizerProp,
  onNavigateToCompleteOnboarding,
}: CrearPartidoLocationSheetProps) {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  // Profile compartido (HomeDataContext) — evita un GET /players/me extra
  // cada vez que el usuario pulsa un slot para crear partido.
  const { profile: cachedProfile } = useHomeData();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(initialStep);
  const [selected, setSelected] = useState<LocationType>('club_wematch');
  const [clubs, setClubs] = useState<ClubDisplay[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [filterSport, setFilterSport] = useState<WeMatchSportFilter>('padel');
  const [filterCerramiento, setFilterCerramiento] = useState<CerramientoFilter>('any');
  const [creating, setCreating] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const checkoutDoneRef = useRef(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (presentation === 'modal' && !visible) {
      setStep('location');
      setClubsError(null);
      setCreateError(null);
      setSelectedSlot(null);
      setSelectedClub(null);
      setMatchVisibility('public');
      setCompactModalHeight(null);
    }
  }, [visible, presentation]);

  const [matchVisibility, setMatchVisibility] = useState<'public' | 'private'>(initialMatchVisibility);
  /** Altura natural del paso «ubicación» — la reutilizamos en «tipo de partido». */
  const [compactModalHeight, setCompactModalHeight] = useState<number | null>(null);

  useEffect(() => {
    setMatchVisibility(initialMatchVisibility);
  }, [initialMatchVisibility]);

  const [resolvedOrganizerId, setResolvedOrganizerId] = useState<string | null>(
    organizerProp ?? cachedProfile?.id ?? null,
  );

  useEffect(() => {
    if (organizerProp) {
      setResolvedOrganizerId(organizerProp);
      return;
    }
    if (cachedProfile?.id) {
      setResolvedOrganizerId(cachedProfile.id);
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setResolvedOrganizerId(null);
      return;
    }
    let cancelled = false;
    void fetchMyPlayerId(token).then((id) => {
      if (!cancelled) setResolvedOrganizerId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [organizerProp, cachedProfile?.id, session?.access_token]);

  const orgId = resolvedOrganizerId;

  const sportFilterOptions: { id: WeMatchSportFilter; label: string }[] = [
    { id: 'padel', label: t('common.sportPadel') },
    { id: 'tenis', label: t('common.sportTenis') },
    { id: 'pickleball', label: t('common.sportPickleball') },
    { id: 'otro', label: t('common.allOption') },
  ];

  const loadClubs = useCallback(async () => {
    setClubsLoading(true);
    setClubsError(null);
    try {
      const indoor =
        filterCerramiento === 'indoor' ? true : filterCerramiento === 'outdoor' ? false : undefined;
      const data = await fetchClubAvailabilityForCreate(session?.access_token, {
        sport: filterSport,
        indoor,
      });
      setClubs(data);
    } catch {
      setClubsError(t('common.connectionErrorServer'));
      setClubs([]);
    } finally {
      setClubsLoading(false);
    }
  }, [session?.access_token, filterSport, filterCerramiento, t]);

  useEffect(() => {
    const active = presentation === 'fullscreen' || visible;
    const onClubsStep = step === 'clubs';
    const prefetchFromModal = presentation === 'modal' && visible && modalOnlyWeMatch;
    if (active && (onClubsStep || prefetchFromModal)) {
      loadClubs();
    }
  }, [visible, presentation, step, modalOnlyWeMatch, loadClubs]);

  const [pistaReservada, setPistaReservada] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<SlotForCreate | null>(null);
  const [selectedClub, setSelectedClub] = useState<ClubDisplay | null>(null);

  const { priceData, loading: priceLoading } = useSlotPrice({
    clubId: selectedClub?.clubId,
    courtId: selectedSlot?.courtId,
    date: selectedSlot?.dateStr,
    slot: selectedSlot?.time,
    durationMinutes: slotDurationMin(selectedSlot),
    reservationType: 'open_match',
  });

  const getSlotDisplayPrice = () => {
    if (priceLoading) return t('common.loadingEllipsis');
    if (priceData && priceData.total_price_cents > 0) {
      return `${(priceData.total_price_cents / 100).toFixed(2)}€`;
    }
    return selectedSlot ? slotPriceForDuration(selectedSlot) : '—';
  };

  const organizerElo = cachedProfile?.eloRating ?? null;
  const [restrictByLevel, setRestrictByLevel] = useState(false);
  const [eloMin, setEloMin] = useState(() => defaultFriendlyRange(organizerElo).eloMin);
  const [eloMax, setEloMax] = useState(() => defaultFriendlyRange(organizerElo).eloMax);
  const [gender, setGender] = useState<GenderOption>('any');
  const [onboardingCheckPending, setOnboardingCheckPending] = useState(false);
  const [pendingInvitePlayers, setPendingInvitePlayers] = useState<SelectedInvitePlayer[]>([]);

  const handleSlotPress = useCallback(
    async (slot: SlotForCreate, club: ClubDisplay) => {
      const token = session?.access_token;
      if (!token) {
        setCreateError(t('alerts.createMatch.login'));
        return;
      }
      let playerId = orgId;
      if (!playerId) {
        playerId = cachedProfile?.id ?? (await fetchMyPlayerId(token));
        if (playerId) setResolvedOrganizerId(playerId);
      }
      if (!playerId) {
        setCreateError(t('alerts.createMatch.profileNotFound'));
        return;
      }

      if (cachedProfile && cachedProfile.onboardingCompleted === false) {
        Alert.alert(
          t('alerts.onboarding.phase2'),
          t('alerts.onboarding.selectOne'),
          [
            { text: t('common.no'), style: 'cancel' },
            onNavigateToCompleteOnboarding
              ? {
                  text: t('partidos.createNext'),
                  onPress: () => onNavigateToCompleteOnboarding(),
                }
              : { text: t('common.understood'), style: 'default' },
          ],
        );
        return;
      }

      setCreateError(null);
      if (slot.clubTimezone?.trim()) {
        setClubTimeZone(slot.clubTimezone.trim());
      }
      setSelectedSlot(slot);
      setSelectedClub(club);
      const range = defaultFriendlyRange(cachedProfile?.eloRating ?? null);
      setRestrictByLevel(false);
      setEloMin(range.eloMin);
      setEloMax(range.eloMax);
      setGender('any');
      setPendingInvitePlayers([]);
      checkoutDoneRef.current = false;
      setCheckoutDone(false);
      setStep('configurar');
    },
    [orgId, session?.access_token, cachedProfile?.id, cachedProfile, onNavigateToCompleteOnboarding, t],
  );

  const handleCheckout = useCallback(async () => {
    if (!selectedSlot || !selectedClub || creating || checkoutDoneRef.current) return;
    const token = session?.access_token;
    if (!token) {
      Alert.alert(t('alerts.login.title'), t('alerts.createMatch.login'));
      return;
    }
    let playerId = orgId;
    if (!playerId) {
      playerId = cachedProfile?.id ?? (await fetchMyPlayerId(token));
      if (playerId) setResolvedOrganizerId(playerId);
    }
    if (!playerId) {
      Alert.alert(t('alerts.error.title'), t('alerts.createMatch.profileNotFound'));
      return;
    }
    if (priceLoading) {
      Alert.alert(t('alerts.error.title'), t('alerts.createMatch.calculatingPrice'));
      return;
    }

    if (!priceData || priceData.total_price_cents <= 0) {
      setCreating(false);
      setCreateError(t('search.clubPriceError'));
      return;
    }

    setCreating(true);
    setCreateError(null);
    const { start_at, end_at } = buildStartEnd(selectedSlot);

    const intentRes = await createIntentForNewMatch(
      {
        court_id: selectedSlot.courtId,
        organizer_player_id: playerId,
        start_at,
        end_at,
        total_price_cents: priceData.total_price_cents,
        pay_full: false,
        visibility: matchVisibility,
        competitive: false,
        gender,
        elo_min: restrictByLevel ? eloMin : null,
        elo_max: restrictByLevel ? eloMax : null,
      },
      token
    );
    if (!intentRes.ok || !intentRes.clientSecret) {
      setCreating(false);
      const errMsg = intentRes.error ?? t('common.paymentStartError');
      if (errMsg.includes('esa hora') || errMsg.includes('otro horario')) {
        Alert.alert(t('alerts.scheduleConflict.title'), t('alerts.scheduleConflict.body'));
        setStep('clubs');
      } else {
        setCreateError(errMsg);
      }
      return;
    }

    const returnURL = Linking.createURL('stripe-redirect');
    const { error: initErr } = await initPaymentSheet({
      paymentIntentClientSecret: intentRes.clientSecret,
      merchantDisplayName: 'WeMatch Padel',
      returnURL,
    });
    if (initErr) {
      setCreating(false);
      setCreateError(t('common.paymentConfiguredError'));
      return;
    }

    const { error: presentErr } = await presentPaymentSheet();
    if (presentErr) {
      setCreating(false);
      if (__DEV__) {
        console.warn('[Stripe presentPaymentSheet]', presentErr.code, presentErr.message);
      }
      if (presentErr.code === 'Canceled') {
        setCreateError(t('common.paymentCanceled'));
      } else {
        setCreateError(t('common.paymentProcessError'));
      }
      return;
    }

    const confirmRes = await confirmPaymentFromClient(
      intentRes.paymentIntentId!,
      token
    );
    if (!confirmRes.ok) {
      setCreating(false);
      setCreateError(t('common.paymentConfirmBookingError'));
      return;
    }

    checkoutDoneRef.current = true;
    setCheckoutDone(true);
    setCreating(false);

    const currentPriceFormatted = getSlotDisplayPrice();

    const createdMatchId =
      confirmRes.match &&
      typeof confirmRes.match === 'object' &&
      'id' in confirmRes.match &&
      typeof (confirmRes.match as { id: unknown }).id === 'string'
        ? (confirmRes.match as { id: string }).id
        : undefined;

    const playerIdsToInvite = pendingInvitePlayers.map((p) => p.id);

    const confirmation: BookingConfirmationData = {
      courtName: selectedSlot.courtName,
      clubName: selectedClub.clubName,
      dateTimeFormatted: formatDateTimeForBookingConfirm(
        selectedSlot.dateStr,
        selectedSlot.time,
        locale,
        selectedSlot.clubTimezone,
      ),
      duration: t('common.durationMin', { minutes: slotDurationMin(selectedSlot) }),
      priceFormatted: currentPriceFormatted,
      matchVisibility,
      clubId: selectedClub.clubId,
      courtId: selectedSlot.courtId,
      date: selectedSlot.dateStr,
      slot: selectedSlot.time,
      durationMinutes: slotDurationMin(selectedSlot),
      matchId: createdMatchId,
    };
    /** Cierra el flujo y muestra confirmación antes de enviar invitaciones (evita doble pago si el envío tarda). */
    if (onPartidoCreado) {
      onPartidoCreado(confirmation);
    } else {
      onClose();
    }

    if (matchVisibility === 'private' && createdMatchId && playerIdsToInvite.length > 0) {
      void sendMatchPlayerInvites(createdMatchId, playerIdsToInvite, token);
    }
  }, [
    selectedSlot,
    selectedClub,
    restrictByLevel,
    eloMin,
    eloMax,
    gender,
    orgId,
    session?.access_token,
    initPaymentSheet,
    presentPaymentSheet,
    onPartidoCreado,
    onClose,
    matchVisibility,
    priceData,
    priceLoading,
    pendingInvitePlayers,
    t,
    locale,
  ]);

  const handleSiguiente = () => {
    if (step === 'tipo_partido') {
      if (modalOnlyWeMatch && onContinueWeMatch) {
        onContinueWeMatch(matchVisibility);
        return;
      }
      setStep('clubs');
      return;
    }
    if (selected === 'club_wematch') {
      setMatchVisibility('public');
      setStep('tipo_partido');
    } else if (selected === 'pista_externa') {
      setStep('pista_externa');
    } else {
      onSiguiente(selected);
    }
  };

  /** Paso ubicación, clubes, tipo de partido o configurar: cromado oscuro (auth) unificado */
  const matchFlowDark =
    step === 'location' || step === 'clubs' || step === 'tipo_partido' || step === 'configurar';

  const isModal = presentation === 'modal';
  const tallStep = step === 'clubs' || step === 'configurar' || step === 'pista_externa';
  const isCompactModalStep = isModal && (step === 'location' || step === 'tipo_partido');

  const sheetBodyStyle = [
    styles.sheet,
    matchFlowDark && styles.sheetLocation,
    !isModal && styles.sheetFullscreen,
    isCompactModalStep && step === 'tipo_partido' && compactModalHeight != null && { height: compactModalHeight },
    { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) },
    !isModal && tallStep && styles.sheetFullscreenTall,
  ];

  const handleCompactModalLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      if (!isModal || step !== 'location') return;
      const next = Math.round(e.nativeEvent.layout.height);
      setCompactModalHeight((prev) => (prev === next ? prev : next));
    },
    [isModal, step],
  );

  const sheetElement = (
          <View style={sheetBodyStyle} onLayout={handleCompactModalLayout}>
          {isModal && (
            <View style={[styles.handle, matchFlowDark && styles.handleLocation]} />
          )}
          <View
            style={[
              styles.header,
              (step === 'pista_externa' || step === 'configurar') && styles.headerPista,
              step === 'configurar' && styles.headerConfig,
              step === 'clubs' && presentation === 'fullscreen' && styles.headerClubsFullscreenWrap,
            ]}
          >
            {step === 'configurar' ? (
              <>
                <Pressable
                  onPress={() => {
                    setStep('clubs');
                    setSelectedSlot(null);
                    setSelectedClub(null);
                    setCreateError(null);
                    loadClubs();
                  }}
                  style={({ pressed }) => [
                    styles.headerConfigCloseBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Ionicons name="chevron-back" size={22} color={theme.auth.text} />
                </Pressable>
                <Text style={styles.headerConfigTitle} numberOfLines={1}>
                  {t('partidos.detailMatchDetails')}
                </Text>
                <View style={styles.headerConfigRightSpacer} />
              </>
            ) : step === 'clubs' && presentation === 'fullscreen' ? (
              <View style={styles.headerClubsFullscreen}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.headerClubsBackBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Ionicons name="arrow-back" size={20} color={theme.auth.text} />
                </Pressable>
                <View style={styles.headerClubsTitleWrap}>
                  <Text style={styles.headerClubsTitle} numberOfLines={2}>
                    Encontrar nuevos partidos
                  </Text>
                </View>
                <View style={styles.headerClubsRightSpacer} />
              </View>
            ) : step === 'clubs' ? (
              <Pressable
                onPress={() => {
                  setStep('tipo_partido');
                  setCreateError(null);
                }}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={24} color={theme.auth.text} />
                <Text style={[styles.backLabel, styles.backLabelOnDark]}>{t('partidos.createBack')}</Text>
              </Pressable>
            ) : step === 'pista_externa' ? (
              <Pressable
                onPress={() => setStep('location')}
                style={({ pressed }) => [styles.headerBackOnly, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
              </Pressable>
            ) : (
              <Text style={[styles.headerTitle, styles.headerTitleLocation]}>
                {step === 'tipo_partido'
                  ? t('partidos.createMatchTypeScreenSub')
                  : t('partidos.sheetWhereTitle')}
              </Text>
            )}
            {step !== 'pista_externa' &&
              step !== 'configurar' &&
              !(step === 'clubs' && presentation === 'fullscreen') && (
            <View style={styles.headerActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  matchFlowDark && styles.iconButtonLocation,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('partidos.detailTabInfo')}
              >
                <Ionicons name="information-circle-outline" size={20} color="#9ca3af" />
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.iconButton,
                  matchFlowDark && styles.iconButtonLocation,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={20} color="#9ca3af" />
              </Pressable>
            </View>
            )}
          </View>

          {step === 'clubs' && presentation === 'fullscreen' && (
            <View style={styles.clubsFiltersColumn}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.clubsFiltersScrollRow}
                contentContainerStyle={styles.clubsFiltersRow}
              >
                <View style={styles.clubsFilterIconBtn}>
                  <Ionicons name="location-outline" size={16} color={theme.auth.textMuted} />
                </View>
                {sportFilterOptions.map((opt) => {
                  const selected = filterSport === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setFilterSport(opt.id)}
                      style={({ pressed }) => [
                        styles.clubsFilterChipStatic,
                        selected && styles.clubsFilterChipSelected,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={styles.clubsFilterChipText}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.clubsFiltersScrollRow}
                contentContainerStyle={styles.clubsFiltersRow}
              >
                {(
                  [
                    { id: 'any' as const, label: t('common.sportAll') },
                    { id: 'indoor' as const, label: t('common.interior') },
                    { id: 'outdoor' as const, label: t('common.outdoor') },
                  ] as const
                ).map((opt) => {
                  const selected = filterCerramiento === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setFilterCerramiento(opt.id)}
                      style={({ pressed }) => [
                        styles.clubsFilterChipStatic,
                        selected && styles.clubsFilterChipSelected,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={styles.clubsFilterChipText}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.clubsFilterChipStatic} accessibilityRole="text">
                  <Text style={styles.clubsFilterChipTextMuted}>
                    {t(clubs.length === 1 ? 'common.clubFoundOne' : 'common.clubFoundMany', { count: clubs.length })}
                  </Text>
                </View>
              </ScrollView>
            </View>
          )}

          {step === 'pista_externa' ? (
            <ScrollView
              style={styles.pistaScroll}
              contentContainerStyle={styles.pistaContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.nuevoPartidoTitle}>{t('partidos.createNewMatch')}</Text>

              <View style={styles.sportCard}>
                <Text style={styles.sportEmoji}>🎾</Text>
                <Text style={styles.sportLabel}>{t('partidos.createSportPadel')}</Text>
              </View>

              <Pressable style={({ pressed }) => [styles.formButton, styles.formButtonSelected, pressed && styles.pressed]}>
                <Ionicons name="people-outline" size={20} color="#9ca3af" />
                <Text style={styles.formButtonLabel}>{t('partidos.createFormatDouble')}</Text>
                <View style={styles.avatarsRow}>
                  <View style={[styles.avatar, { zIndex: 10 }]}>
                    <Text style={styles.avatarText}>
                      {session?.user ? getInitials(session.user.user_metadata?.full_name, session.user.email) : '?'}
                    </Text>
                  </View>
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Ionicons name="add" size={12} color="#9ca3af" />
                  </View>
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Ionicons name="add" size={12} color="#9ca3af" />
                  </View>
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Ionicons name="add" size={12} color="#9ca3af" />
                  </View>
                </View>
              </Pressable>

              <Pressable style={({ pressed }) => [styles.formButton, pressed && styles.pressed]}>
                <Ionicons name="time-outline" size={20} color="#9ca3af" />
                <View style={styles.formButtonBody}>
                  <Text style={styles.formButtonLabel}>{t('partidos.createDateTime')}</Text>
                  <Text style={styles.formButtonSub}>{t('partidos.createDateTimeSub')}</Text>
                </View>
                <Ionicons name="add" size={20} color="#9ca3af" />
              </Pressable>

              <Pressable style={({ pressed }) => [styles.formButton, styles.formButtonLast, pressed && styles.pressed]}>
                <Ionicons name="location-outline" size={20} color="#9ca3af" />
                <Text style={styles.formButtonLabelGray}>{t('partidos.createLocation')}</Text>
                <Ionicons name="add" size={20} color="#9ca3af" />
              </Pressable>

              <Text style={styles.detallesTitle}>{t('partidos.createDetailsTitle')}</Text>

              <Pressable style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}>
                <Text style={styles.detailEmoji}>🏆</Text>
                <Text style={styles.detailLabel}>{t('partidos.createMatchType')}</Text>
                <View style={styles.detailRight}>
                  <Text style={styles.detailValue}>{t('common.competitive')}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              </Pressable>

              <View style={styles.detailRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#9ca3af" />
                <Text style={styles.detailLabel}>{t('partidos.createMarkCourtReserved')}</Text>
                <Switch
                  value={pistaReservada}
                  onValueChange={setPistaReservada}
                  trackColor={{ false: '#e5e7eb', true: theme.auth.accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" />
                <Text style={styles.detailLabel}>{t('partidos.createMarkPrivate')}</Text>
                <View style={styles.detailRight}>
                  <Switch
                    value={matchVisibility === 'private'}
                    onValueChange={(v) => setMatchVisibility(v ? 'private' : 'public')}
                    trackColor={{ false: '#e5e7eb', true: theme.auth.accent }}
                    thumbColor="#fff"
                  />
                  <Pressable style={styles.infoButton}>
                    <Ionicons name="information-circle-outline" size={20} color="#d1d5db" />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.crearPartidoButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('partidos.createMatchBtn')}
              >
                <Text style={styles.crearPartidoButtonText}>{t('partidos.createMatchBtn')}</Text>
              </Pressable>
            </ScrollView>
          ) : step === 'configurar' && selectedSlot && selectedClub ? (
            <AppKeyboardAvoidingView style={styles.configurarWrap}>
              <SafeScrollView
                style={styles.pistaScroll}
                contentContainerStyle={styles.configurarContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bottomOffset={Math.max(insets.bottom, 16) + 72}
              >
                <View style={styles.configMatchTypeBadge}>
                  <Ionicons
                    name={matchVisibility === 'private' ? 'lock-closed' : 'globe-outline'}
                    size={14}
                    color={theme.auth.accent}
                  />
                  <Text style={styles.configMatchTypeBadgeText}>
                    {matchVisibility === 'private'
                      ? t('partidos.createPrivateLabel')
                      : t('partidos.createPublicLabel')}
                  </Text>
                </View>

                <View style={styles.configSection}>
                  <Text style={styles.configSectionTitle}>{t('partidos.createFriendlySection')}</Text>
                  <Text style={styles.configFriendlyNote}>
                    Los partidos públicos no afectan tu ELO. Para ranked 2v2 usá Liga / matchmaking.
                  </Text>
                  <FriendlyLevelRangeSection
                    restrictByLevel={restrictByLevel}
                    onRestrictByLevelChange={setRestrictByLevel}
                    eloMin={eloMin}
                    eloMax={eloMax}
                    onEloMinChange={setEloMin}
                    onEloMaxChange={setEloMax}
                  />
                </View>

                <View style={styles.configSection}>
                  <Text style={styles.configSectionTitle}>{t('partidos.createGenderSection')}</Text>
                  {[
                    { value: 'any' as GenderOption, label: t('partidos.moreFiltersAllPlayers'), sub: t('partidos.moreFiltersAllPlayers') },
                    { value: 'male' as GenderOption, label: t('partidos.moreFiltersMenOnly'), sub: t('partidos.moreFiltersMenOnlySub') },
                    { value: 'female' as GenderOption, label: t('partidos.moreFiltersWomenOnly'), sub: t('partidos.moreFiltersWomenOnlySub') },
                    { value: 'mixed' as GenderOption, label: t('partidos.moreFiltersMixed'), sub: t('partidos.moreFiltersMixedSub') },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={({ pressed }) => [styles.configGenderRow, pressed && styles.pressed]}
                      onPress={() => setGender(opt.value)}
                    >
                      <View style={[styles.configRadio, gender === opt.value && styles.configRadioSelected]}>
                        {gender === opt.value && <View style={styles.configRadioDot} />}
                      </View>
                      <View style={styles.configGenderTextWrap}>
                        <Text style={styles.configGenderLabel}>{opt.label}</Text>
                        <Text style={styles.configGenderSub}>{opt.sub}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {matchVisibility === 'private' ? (
                  <View style={styles.configSection}>
                    <Text style={styles.configSectionTitle}>{t('partidos.createPrivateInvitesSection')}</Text>
                    <Text style={styles.configFriendlyNote}>
                      {t('partidos.createPrivateInvitesPrePay')}
                    </Text>
                    <PrivateInvitePlayerPicker
                      selected={pendingInvitePlayers}
                      onSelectedChange={setPendingInvitePlayers}
                      accessToken={session?.access_token}
                      excludePlayerIds={orgId ? [orgId] : []}
                    />
                  </View>
                ) : null}

                <View style={styles.configClubCard}>
                  {selectedClub.imageUrl ? (
                    <Image source={{ uri: selectedClub.imageUrl }} style={styles.configClubImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.configClubImage, styles.configClubImagePlaceholder]} />
                  )}
                  <View style={styles.configClubInfo}>
                    <Text style={styles.configClubName} numberOfLines={1}>{selectedClub.clubName}</Text>
                    <Text style={styles.configCourtLine} numberOfLines={2}>
                      {selectedSlot.courtName} · {sportLabelUi(selectedSlot.courtSport, t)} ·{' '}
                      {selectedSlot.courtIndoor ? t('common.interior') : t('common.outdoor')}
                    </Text>
                    <View style={styles.configClubMeta}>
                      <Ionicons name="time-outline" size={12} color={theme.auth.textMuted} />
                      <Text style={styles.configClubMetaText}>
                        {selectedSlot.dateLabel} • {selectedSlot.time}
                      </Text>
                    </View>
                    <Text style={styles.configClubPrice}>{getSlotDisplayPrice()}</Text>
                  </View>
                </View>

                {createError && (
                  <View style={[styles.createErrorBanner, styles.createErrorBannerDark]}>
                    <Ionicons name="alert-circle" size={18} color="#E31E24" />
                    <Text style={styles.createErrorText}>{createError}</Text>
                  </View>
                )}
              </SafeScrollView>
              <View style={[styles.configurarFooter, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
                <Pressable
                  style={({ pressed }) => [styles.ctaButton, styles.ctaButtonConfig, pressed && styles.pressed]}
                  onPress={handleCheckout}
                  disabled={creating || checkoutDone}
                >
                  <Text style={styles.ctaButtonText}>
                    {creating ? t('common.saving') : checkoutDone ? t('common.paymentDone') : t('partidos.createNext')}
                  </Text>
                </Pressable>
              </View>
            </AppKeyboardAvoidingView>
          ) : step === 'clubs' ? (
            clubsLoading && clubs.length === 0 && !clubsError ? (
              <View style={styles.clubsLoadingWrap}>
                <ActivityIndicator size="small" color={theme.auth.accent} />
                <Text style={styles.clubsLoadingTitle}>{t('partidos.createSearchingCourts')}</Text>
                <Text style={styles.clubsLoadingSub}>{t('common.searchingClubs')}</Text>
              </View>
            ) : clubsError ? (
              <View style={styles.clubsFeedbackWrap}>
                <Ionicons name="cloud-offline-outline" size={36} color={theme.auth.textMuted} />
                <Text style={styles.clubsFeedbackTitle}>{clubsError}</Text>
                <Text style={styles.clubsFeedbackSub}>{t('common.connectionError')}</Text>
                <Pressable
                  style={({ pressed }) => [styles.retryButton, styles.retryButtonApp, pressed && styles.pressed]}
                  onPress={loadClubs}
                >
                  <Text style={styles.retryButtonText}>{t('partidos.createRetry')}</Text>
                </Pressable>
              </View>
            ) : clubs.length === 0 ? (
              <View style={styles.clubsFeedbackWrap}>
                <Ionicons name="business-outline" size={36} color={theme.auth.textMuted} />
                <Text style={styles.clubsFeedbackTitle}>{t('partidos.createNoCourts')}</Text>
                <Text style={styles.clubsFeedbackSub}>{t('partidos.noOpenMatchesHint')}</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.pistaScroll}
                contentContainerStyle={styles.pistaContent}
                showsVerticalScrollIndicator={false}
              >
                {createError && (
                  <View style={[styles.createErrorBanner, styles.createErrorBannerDark]}>
                    <Ionicons name="alert-circle" size={18} color="#E31E24" />
                    <Text style={styles.createErrorText}>{createError}</Text>
                  </View>
                )}
                {clubsLoading ? (
                  <View style={styles.clubsRefreshRow}>
                    <ActivityIndicator size="small" color={theme.auth.accent} />
                    <Text style={styles.clubsRefreshText}>{t('common.searchingClubs')}</Text>
                  </View>
                ) : null}
                <View style={styles.bannerGlass}>
                  <Text style={styles.bannerGlassTitle}>{t('partidos.createAvailabilityBanner')}</Text>
                  <Text style={styles.bannerGlassSub}>
                    Reserva tu plaza y lanza un nuevo Partido Abierto!
                  </Text>
                </View>
                {clubs.map((club) => (
                  <View key={club.clubId} style={styles.clubCardGlass}>
                    <View style={styles.clubHeaderGlass}>
                      {club.imageUrl ? (
                        <Image
                          source={{ uri: club.imageUrl }}
                          style={[styles.clubImage, styles.clubImageGlass]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.clubImage, styles.clubImagePlaceholder, styles.clubImageGlass]} />
                      )}
                      <View style={styles.clubInfo}>
                        <Text style={styles.clubNameGlass} numberOfLines={2}>
                          {club.clubName}
                        </Text>
                        <Text style={styles.clubLocationGlass}>{club.location}</Text>
                      </View>
                    </View>
                    {club.dates.map((d, dateIdx) => (
                      <View
                        key={`${d.dateStr}-${d.label}`}
                        style={[
                          styles.dateSectionGlass,
                          dateIdx === club.dates.length - 1 && styles.dateSectionGlassLast,
                        ]}
                      >
                        <Text style={styles.dateLabelGlass}>{d.label}</Text>
                        {d.slots.length === 0 ? (
                          <Text style={styles.noSlotsTextGlass}>{t('partidos.createNoSlots')}</Text>
                        ) : (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.slotsRow}
                            nestedScrollEnabled
                          >
                            {d.slots.map((slot) => (
                              <Pressable
                                key={`${slot.courtId}-${slot.dateStr}-${slot.time}`}
                                style={({ pressed }) => [
                                  styles.slotButtonGlass,
                                  pressed && styles.slotPressedGlass,
                                  creating && styles.slotDisabled,
                                ]}
                                onPress={() => void handleSlotPress(slot, club)}
                                disabled={creating || onboardingCheckPending}
                              >
                                <Text style={styles.slotTimeGlass}>{slot.time}</Text>
                                <Text style={styles.slotDurationGlass}>{slot.duration}</Text>
                                <Text style={styles.slotMetaGlass} numberOfLines={1}>
                                  {sportLabelUi(slot.courtSport, t)} · {slot.courtIndoor ? t('common.interior') : t('common.outdoor')}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    ))}
                  </View>
                ))}
                <View style={styles.bottomSpacer} />
              </ScrollView>
            )
          ) : step === 'tipo_partido' ? (
            <View style={styles.modalStepBody}>
              <View>
              {([
                {
                  value: 'public' as const,
                  label: t('partidos.createPublicLabel'),
                  sub: t('partidos.createPublicSub'),
                  icon: 'globe-outline' as const,
                },
                {
                  value: 'private' as const,
                  label: t('partidos.createPrivateLabel'),
                  sub: t('partidos.createPrivateSub'),
                  icon: 'lock-closed-outline' as const,
                },
              ]).map((opt, index) => {
                const selected = matchVisibility === opt.value;
                return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.optionCard,
                    styles.optionCardLocation,
                    index === 1 && styles.optionCardLocationSecond,
                    selected && styles.optionCardLocationSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setMatchVisibility(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.optionIconWrap,
                      selected
                        ? styles.optionIconWrapLocationSelected
                        : styles.optionIconWrapLocationNeutral,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={selected ? theme.auth.accent : theme.auth.textMuted}
                    />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, styles.optionTitleLocation]}>{opt.label}</Text>
                    <Text style={[styles.optionDesc, styles.optionDescLocation]}>{opt.sub}</Text>
                  </View>
                </Pressable>
              );
              })}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.ctaButton,
                  styles.ctaButtonLocation,
                  pressed && styles.pressed,
                ]}
                onPress={handleSiguiente}
                accessibilityRole="button"
                accessibilityLabel={t('partidos.createNext')}
              >
                <Text style={[styles.ctaButtonText, styles.ctaButtonTextLocation]}>
                  {t('partidos.createNext')}
                </Text>
              </Pressable>
            </View>
          ) : (
          <>
          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              selected === 'club_wematch' && styles.optionSelected,
              styles.optionCardLocation,
              selected === 'club_wematch' && styles.optionCardLocationSelected,
              pressed && styles.pressed,
            ]}
            onPress={() => setSelected('club_wematch')}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === 'club_wematch' }}
          >
            <View
              style={[
                styles.optionIconWrap,
                step === 'location' &&
                  (selected === 'club_wematch'
                    ? styles.optionIconWrapLocationSelected
                    : styles.optionIconWrapLocationNeutral),
              ]}
            >
              <Ionicons
                name="business-outline"
                size={20}
                color={selected === 'club_wematch' ? theme.auth.accent : theme.auth.textMuted}
              />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, step === 'location' && styles.optionTitleLocation]}>
                En un club WeMatch
              </Text>
              <Text style={[styles.optionDesc, step === 'location' && styles.optionDescLocation]}>
                Elige en que club WeMatch quieres jugar y publica tu partido para que cualquier jugador pueda apuntarse.
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              selected === 'pista_externa' && step !== 'location' && styles.optionSelected,
              step === 'location' && styles.optionCardLocation,
              step === 'location' && styles.optionCardLocationSecond,
              selected === 'pista_externa' && step === 'location' && styles.optionCardLocationSelected,
              styles.optionCardDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => setSelected('pista_externa')}
            disabled={true}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === 'pista_externa' }}
          >
            <View
              style={[
                styles.optionIconWrap,
                step !== 'location' && styles.optionIconGray,
                step === 'location' &&
                  (selected === 'pista_externa'
                    ? styles.optionIconWrapLocationSelected
                    : styles.optionIconWrapLocationNeutral),
              ]}
            >
              <Ionicons
                name="location-outline"
                size={20}
                color={step === 'location' ? '#9ca3af' : '#6b7280'}
              />
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, step === 'location' && styles.optionTitleLocation]}>
                {t('partidos.createExternalCourtTitle')}
              </Text>
              <Text style={[styles.optionDesc, step === 'location' && styles.optionDescLocation]}>
                {t('partidos.createExternalCourtSub')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              step === 'location' && styles.ctaButtonLocation,
              pressed && styles.pressed,
            ]}
            onPress={handleSiguiente}
            accessibilityRole="button"
            accessibilityLabel={t('partidos.createNext')}
          >
            <Text style={[styles.ctaButtonText, step === 'location' && styles.ctaButtonTextLocation]}>{t('partidos.createNext')}</Text>
          </Pressable>
          {step === 'location' && <View style={styles.locationBottomSpacer} />}
          </>
          )}
          </View>
  );

  if (!isModal) {
    return (
      <View style={styles.fullscreenRoot}>
        {sheetElement}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayBackdrop}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
        />
        {sheetElement}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.spacing.lg,
  },
  sheetLocation: {
    backgroundColor: theme.auth.bg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    width: '100%',
    alignSelf: 'stretch',
  },
  modalStepBody: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  /** Pantalla completa: sin forma de bottom sheet */
  sheetFullscreen: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
  },
  sheetFullscreenTall: {
    flex: 1,
  },
  fullscreenRoot: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: theme.auth.bg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  handleLocation: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  /** Pantalla clubes fullscreen — referencia StartMatchFlow (px-5 pt-4 pb-3) */
  headerClubsFullscreenWrap: {
    width: '100%',
    marginBottom: 16,
  },
  headerClubsFullscreen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerClubsBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerClubsTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  headerClubsTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    textAlign: 'center',
  },
  headerClubsRightSpacer: {
    width: 40,
    height: 40,
  },
  clubsFiltersColumn: {
    width: '100%',
    marginBottom: 8,
    gap: 8,
    flexShrink: 0,
  },
  clubsFiltersScrollRow: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  clubsFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 4,
  },
  clubsFilterIconBtn: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    flexShrink: 0,
  },
  clubsFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.auth.accent,
    borderRadius: 12,
    flexShrink: 0,
  },
  /** Chips informativos (no son filtros interactivos). */
  clubsFilterChipStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    flexShrink: 0,
  },
  clubsFilterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.auth.text,
  },
  clubsFilterChipTextMuted: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.auth.textMuted,
  },
  clubsFilterChipSelected: {
    borderColor: theme.auth.accent,
    backgroundColor: 'rgba(241, 143, 52, 0.18)',
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerTitleLocation: {
    color: theme.auth.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonLocation: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    marginBottom: 12,
  },
  optionCardDisabled: {
    opacity: 0.4,
  },
  optionCardLocation: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
  },
  optionCardLocationSelected: {
    borderWidth: 2,
    borderColor: theme.auth.accent,
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
  },
  optionCardLocationSecond: {
    marginBottom: 24,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: '#E31E24',
    backgroundColor: 'rgba(227,30,36,0.05)',
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(227,30,36,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconGray: {
    backgroundColor: '#f9fafb',
  },
  optionIconWrapLocationSelected: {
    backgroundColor: 'rgba(241, 143, 52, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.3)',
  },
  optionIconWrapLocationNeutral: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionEmoji: {
    fontSize: 18,
  },
  optionBody: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  optionTitleLocation: {
    color: theme.auth.text,
  },
  optionDescLocation: {
    color: theme.auth.textMuted,
  },
  ctaButton: {
    backgroundColor: theme.auth.accent,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  ctaButtonConfig: {
    marginTop: 0,
  },
  ctaButtonLocation: {
    backgroundColor: theme.auth.accent,
    marginTop: 0,
  },
  ctaButtonTextLocation: {
    color: '#fff',
    textAlign: 'center',
    width: '100%',
    flexShrink: 0,
  },
  locationBottomSpacer: {
    height: 16,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    includeFontPadding: false,
    width: '100%',
    flexShrink: 0,
  },
  bottomSpacer: {
    height: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBackOnly: {
    padding: 4,
  },
  headerPista: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  /** Header light del paso `configurar` ahora oscuro */
  headerConfig: {
    backgroundColor: theme.auth.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 16,
    marginBottom: 0,
  },
  headerConfigCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerConfigTitle: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    textAlign: 'center',
  },
  headerConfigRightSpacer: {
    width: 40,
    height: 40,
  },
  backLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  backLabelOnDark: {
    color: theme.auth.text,
  },
  clubsWrapper: {
    flex: 1,
    minHeight: 0,
  },
  clubsScrollWrap: {
    flex: 1,
    minHeight: 0,
  },
  clubsScroll: {
    flex: 1,
  },
  clubsContent: {
    paddingBottom: theme.spacing.xl,
  },
  /** Listado clubes — panel tipo glass (referencia StartMatchFlow) */
  bannerGlass: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  bannerGlassTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 2,
  },
  bannerGlassSub: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    lineHeight: theme.lineHeightFor(theme.fontSize.xs),
  },
  clubCardGlass: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  clubHeaderGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  clubImageGlass: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clubNameGlass: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 2,
    lineHeight: theme.lineHeightFor(theme.fontSize.sm),
  },
  clubLocationGlass: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
  },
  dateSectionGlass: {
    marginBottom: 12,
  },
  dateSectionGlassLast: {
    marginBottom: 0,
  },
  dateLabelGlass: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 8,
  },
  slotButtonGlass: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  slotPressedGlass: {
    borderColor: theme.auth.accent,
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
  },
  slotTimeGlass: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.auth.text,
  },
  slotDurationGlass: {
    fontSize: 10,
    color: theme.auth.textMuted,
    marginTop: 2,
  },
  slotMetaGlass: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.auth.textMuted,
    marginTop: 4,
    maxWidth: 72,
    textAlign: 'center',
  },
  noSlotsTextGlass: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    fontStyle: 'italic',
  },
  clubsLoadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 10,
  },
  clubsLoadingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.auth.text,
    marginTop: 4,
  },
  clubsLoadingSub: {
    fontSize: 13,
    color: theme.auth.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  clubsFeedbackWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 10,
  },
  clubsFeedbackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.auth.text,
    textAlign: 'center',
  },
  clubsFeedbackSub: {
    fontSize: 13,
    color: theme.auth.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  clubsRefreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  clubsRefreshText: {
    fontSize: 13,
    color: theme.auth.textMuted,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#E31E24',
    borderRadius: 12,
  },
  retryButtonApp: {
    backgroundColor: theme.auth.accent,
    marginTop: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  createErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(227,30,36,0.1)',
    borderRadius: 12,
    marginBottom: 16,
  },
  createErrorBannerDark: {
    backgroundColor: 'rgba(227, 30, 36, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(227, 30, 36, 0.35)',
  },
  createErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#E31E24',
    fontWeight: '500',
  },
  clubImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  clubImagePlaceholder: {
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubImageEmoji: {
    fontSize: 28,
  },
  clubInfo: {
    flex: 1,
    minWidth: 0,
  },
  slotsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  slotDisabled: {
    opacity: 0.6,
  },
  pistaScroll: {
    flex: 1,
  },
  pistaContent: {
    paddingBottom: theme.spacing.lg,
  },
  nuevoPartidoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  sportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(227,30,36,0.3)',
    borderRadius: 16,
    marginBottom: 12,
  },
  sportEmoji: {
    fontSize: 24,
  },
  sportLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  formButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    marginBottom: 12,
  },
  formButtonSelected: {
    borderWidth: 2,
    borderColor: 'rgba(227,30,36,0.3)',
  },
  formButtonLast: {
    marginBottom: 24,
  },
  formButtonLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  formButtonLabelGray: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  formButtonBody: {
    flex: 1,
  },
  formButtonSub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarEmpty: {
    backgroundColor: '#f3f4f6',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  detallesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailEmoji: {
    fontSize: 18,
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailValue: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoButton: {
    padding: 4,
  },
  crearPartidoButton: {
    backgroundColor: '#E31E24',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  crearPartidoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  pressed: {
    opacity: 0.9,
  },
  configurarWrap: {
    flex: 1,
    minHeight: 0,
  },
  configurarContent: {
    paddingTop: theme.spacing.lg,
    paddingBottom: 100,
  },
  configSection: {
    marginBottom: 20,
  },
  configSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 12,
  },
  configFriendlyNote: {
    fontSize: 12,
    color: theme.auth.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  configMatchTypeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.25)',
    marginBottom: 16,
  },
  configMatchTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.auth.accent,
  },
  configOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  configOptionSelected: {
    borderColor: theme.auth.accent,
    backgroundColor: 'rgba(241,143,52,0.08)',
  },
  configRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  configRadioSelected: {
    borderColor: theme.auth.accent,
  },
  configRadioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.auth.accent,
  },
  configOptionBody: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  configOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: 2,
  },
  configOptionSub: {
    fontSize: 12,
    color: theme.auth.textMuted,
  },
  configGenderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  configGenderTextWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  configGenderLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.auth.text,
  },
  configGenderSub: {
    fontSize: 12,
    color: theme.auth.textMuted,
    marginTop: 2,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  privacyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  privacyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  privacyLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.auth.text,
  },
  privacySub: {
    fontSize: 12,
    color: theme.auth.textMuted,
    marginTop: 2,
  },
  configClubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  configClubImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  configClubImagePlaceholder: { backgroundColor: 'rgba(255,255,255,0.1)' },
  configClubInfo: {
    flex: 1,
    minWidth: 0,
  },
  configClubName: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.auth.text,
  },
  configCourtLine: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.auth.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  configClubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  configClubMetaText: {
    fontSize: 10,
    color: theme.auth.textMuted,
  },
  configClubPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.auth.accent,
    marginTop: 4,
  },
  configurarFooter: {
    width: '100%',
    backgroundColor: theme.auth.bg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
    paddingBottom: 16,
  },
});
