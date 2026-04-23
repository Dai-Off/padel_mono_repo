import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { createIntentForNewMatch, confirmPaymentFromClient } from '../../api/payments';
import { fetchClubAvailabilityForCreate } from '../../api/partidoClubs';
import type { ClubDisplay, SlotForCreate } from '../../api/partidoClubs';
import { theme } from '../../theme';
import type { BookingConfirmationData } from '../../screens/BookingConfirmationScreen';
import { useSlotPrice } from '../../hooks/useSlotPrice';

export type LocationType = 'club_wematch' | 'pista_externa';

export type CrearPartidoFlowStep = 'location' | 'clubs' | 'configurar' | 'pista_externa';

type CrearPartidoLocationSheetProps = {
  /** `fullscreen` = pantalla completa (club + horarios). `modal` = solo “¿Dónde se juega?” (+ pista externa). */
  presentation?: 'modal' | 'fullscreen';
  visible?: boolean;
  /** Paso inicial (p. ej. `clubs` en pantalla completa tras elegir WeMatch en el modal). */
  initialStep?: CrearPartidoFlowStep;
  /**
   * Si true (solo con `presentation="modal"`): al pulsar Siguiente con “WeMatch” no abre clubes aquí;
   * llama `onContinueWeMatch` y el padre abre la pantalla completa de clubes.
   */
  modalOnlyWeMatch?: boolean;
  /** Tras WeMatch + Siguiente en modal; el padre cierra el modal y abre pantalla completa. */
  onContinueWeMatch?: () => void;
  onClose: () => void;
  onSiguiente: (locationType: LocationType) => void;
  /** Tras pago y confirmación en backend; datos para pantalla de éxito. */
  onPartidoCreado?: (data: BookingConfirmationData) => void;
  organizerPlayerId?: string | null;
};

type Step = CrearPartidoFlowStep;

type GenderOption = 'any' | 'male' | 'female' | 'mixed';

const DURATION_MIN = 90;

function slotPriceForDuration(slot: SlotForCreate): string {
  const totalCents = Math.round(slot.minPriceCents * (DURATION_MIN / 60));
  return totalCents >= 100 ? `${(totalCents / 100).toFixed(2)}€` : slot.minPriceFormatted;
}

function buildStartEnd(dateStr: string, time: string): { start_at: string; end_at: string } {
  const start = new Date(`${dateStr}T${time}:00`);
  const end = new Date(start.getTime() + DURATION_MIN * 60 * 1000);
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function formatDateTimeForBookingConfirm(dateStr: string, time: string): string {
  const d = new Date(`${dateStr}T${time}:00`);
  const dayNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const dayName = dayNames[d.getDay()] ?? 'Día';
  const dayNum = d.getDate();
  const month = months[d.getMonth()] ?? '';
  return `${dayName}, ${dayNum} ${month} · ${time}`;
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
  modalOnlyWeMatch = false,
  onContinueWeMatch,
  onClose,
  onSiguiente,
  onPartidoCreado,
  organizerPlayerId: organizerProp,
}: CrearPartidoLocationSheetProps) {
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(initialStep);
  const [selected, setSelected] = useState<LocationType>('club_wematch');
  const [clubs, setClubs] = useState<ClubDisplay[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (presentation === 'modal' && !visible) {
      setStep('location');
      setClubsError(null);
      setCreateError(null);
      setSelectedSlot(null);
      setSelectedClub(null);
    }
  }, [visible, presentation]);

  const orgId = organizerProp ?? null;

  const loadClubs = useCallback(async () => {
    setClubsLoading(true);
    setClubsError(null);
    try {
      const data = await fetchClubAvailabilityForCreate();
      setClubs(data);
    } catch {
      setClubsError('No se pudo cargar la disponibilidad');
      setClubs([]);
    } finally {
      setClubsLoading(false);
    }
  }, []);

  useEffect(() => {
    const active = presentation === 'fullscreen' || visible;
    if (active && step === 'clubs') {
      loadClubs();
    }
  }, [visible, presentation, step, loadClubs]);

  const [pistaReservada, setPistaReservada] = useState(false);
  const [partidoPrivado, setPartidoPrivado] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<SlotForCreate | null>(null);
  const [selectedClub, setSelectedClub] = useState<ClubDisplay | null>(null);

  const { priceData, loading: priceLoading } = useSlotPrice({
    clubId: selectedClub?.clubId,
    courtId: selectedSlot?.courtId,
    date: selectedSlot?.dateStr,
    slot: selectedSlot?.time,
    durationMinutes: DURATION_MIN,
    reservationType: 'open_match',
  });

  const getSlotDisplayPrice = () => {
    if (priceLoading) return 'Calculando...';
    if (priceData && priceData.total_price_cents > 0) {
      return `${(priceData.total_price_cents / 100).toFixed(2)}€`;
    }
    return selectedSlot ? slotPriceForDuration(selectedSlot) : '—';
  };

  const [competitive, setCompetitive] = useState(true);
  const [gender, setGender] = useState<GenderOption>('any');

  const handleSlotPress = useCallback((slot: SlotForCreate, club: ClubDisplay) => {
    if (!orgId) {
      setCreateError('Necesitas iniciar sesión para crear un partido');
      return;
    }
    setCreateError(null);
    setSelectedSlot(slot);
    setSelectedClub(club);
    setCompetitive(true);
    setGender('any');
    setStep('configurar');
  }, [orgId]);

  const handleCheckout = useCallback(async () => {
    if (!selectedSlot || !selectedClub) return;
    if (!orgId || !session?.access_token) return;
    if (priceLoading) {
      Alert.alert('Calculando precio', 'Espera un momento a que terminemos de calcular el precio exacto.');
      return;
    }

    if (!priceData || priceData.total_price_cents <= 0) {
      setCreating(false);
      setCreateError('No se pudo calcular el precio del partido. Por favor, selecciona el horario de nuevo.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    const { start_at, end_at } = buildStartEnd(selectedSlot.dateStr, selectedSlot.time);

    const intentRes = await createIntentForNewMatch(
      {
        court_id: selectedSlot.courtId,
        organizer_player_id: orgId,
        start_at,
        end_at,
        total_price_cents: priceData.total_price_cents,
        visibility: partidoPrivado ? 'private' : 'public',
        competitive,
        gender,
      },
      session.access_token
    );
    if (!intentRes.ok || !intentRes.clientSecret) {
      setCreating(false);
      const errMsg = intentRes.error ?? 'No se pudo iniciar el pago. Inténtalo de nuevo.';
      if (errMsg.includes('esa hora') || errMsg.includes('otro horario')) {
        Alert.alert('Horario no disponible', 'Ya tienes un partido a esa hora. Elige otro horario.');
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
      setCreateError('Error al configurar el pago. Inténtalo de nuevo.');
      return;
    }

    const { error: presentErr } = await presentPaymentSheet();
    if (presentErr) {
      setCreating(false);
      if (__DEV__) {
        console.warn('[Stripe presentPaymentSheet]', presentErr.code, presentErr.message);
      }
      if (presentErr.code === 'Canceled') {
        setCreateError('Pago cancelado.');
      } else {
        setCreateError('Error al procesar el pago. Inténtalo de nuevo.');
      }
      return;
    }

    const confirmRes = await confirmPaymentFromClient(
      intentRes.paymentIntentId!,
      session.access_token
    );
    setCreating(false);
    if (!confirmRes.ok) {
      setCreateError('No se pudo confirmar el partido. Inténtalo de nuevo.');
      return;
    }

    const currentPriceFormatted = getSlotDisplayPrice();

    const confirmation: BookingConfirmationData = {
      courtName: selectedSlot.courtName,
      clubName: selectedClub.clubName,
      dateTimeFormatted: formatDateTimeForBookingConfirm(selectedSlot.dateStr, selectedSlot.time),
      duration: `${DURATION_MIN} min`,
      priceFormatted: currentPriceFormatted,
      matchVisibility: partidoPrivado ? 'private' : 'public',
      clubId: selectedClub.clubId,
      courtId: selectedSlot.courtId,
      date: selectedSlot.dateStr,
      slot: selectedSlot.time,
      durationMinutes: DURATION_MIN,
    };
    /** El padre (p. ej. MainApp) cierra el flujo dentro de `onPartidoCreado`; no llamar `onClose` después para evitar carrera con la pantalla de éxito. */
    if (onPartidoCreado) {
      onPartidoCreado(confirmation);
    } else {
      onClose();
    }
  }, [selectedSlot, selectedClub, competitive, gender, orgId, session?.access_token, initPaymentSheet, presentPaymentSheet, onPartidoCreado, onClose, partidoPrivado]);

  const handleSiguiente = () => {
    if (selected === 'club_wematch') {
      if (modalOnlyWeMatch && onContinueWeMatch) {
        onContinueWeMatch();
        return;
      }
      setStep('clubs');
    } else if (selected === 'pista_externa') {
      setStep('pista_externa');
    } else {
      onSiguiente(selected);
    }
  };

  /** Paso ubicación o listado de clubes: cromado oscuro (auth) unificado */
  const matchFlowDark = step === 'location' || step === 'clubs';

  const isModal = presentation === 'modal';
  const tallStep = step === 'clubs' || step === 'configurar' || step === 'pista_externa';

  const sheetBodyStyle = [
    styles.sheet,
    matchFlowDark && styles.sheetLocation,
    !isModal && styles.sheetFullscreen,
    { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) },
    isModal &&
      tallStep && {
        height: Dimensions.get('window').height * 0.92,
      },
    !isModal && tallStep && styles.sheetFullscreenTall,
  ];

  const sheetElement = (
          <View style={sheetBodyStyle}>
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
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={20} color="#1A1A1A" />
                </Pressable>
                <Text style={styles.headerConfigTitle} numberOfLines={1}>
                  Configura tu partido
                </Text>
                <View style={styles.headerConfigRightSpacer} />
              </>
            ) : step === 'clubs' && presentation === 'fullscreen' ? (
              <View style={styles.headerClubsFullscreen}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.headerClubsBackBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Volver"
                >
                  <Ionicons name="arrow-back" size={20} color={theme.auth.text} />
                </Pressable>
                <Text style={styles.headerClubsTitle} numberOfLines={1}>
                  Encontrar nuevos partidos
                </Text>
                <View style={styles.headerClubsRightSpacer} />
              </View>
            ) : step === 'clubs' ? (
              <Pressable
                onPress={() => {
                  setStep('location');
                  setCreateError(null);
                }}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Ionicons name="chevron-back" size={24} color={theme.auth.text} />
                <Text style={[styles.backLabel, styles.backLabelOnDark]}>Atrás</Text>
              </Pressable>
            ) : step === 'pista_externa' ? (
              <Pressable
                onPress={() => setStep('location')}
                style={({ pressed }) => [styles.headerBackOnly, pressed && styles.pressed]}
              >
                <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
              </Pressable>
            ) : (
              <Text style={[styles.headerTitle, step === 'location' && styles.headerTitleLocation]}>
                Donde se juega el partido?
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
                accessibilityLabel="Info"
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
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={20} color="#9ca3af" />
              </Pressable>
            </View>
            )}
          </View>

          {step === 'clubs' && presentation === 'fullscreen' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.clubsFiltersScroll}
              contentContainerStyle={styles.clubsFiltersRow}
            >
              <View style={styles.clubsFilterIconBtn}>
                <Ionicons name="location-outline" size={16} color={theme.auth.textMuted} />
              </View>
              <View style={styles.clubsFilterChipStatic} accessibilityRole="text">
                <Text style={styles.clubsFilterChipText}>Pádel</Text>
              </View>
              <View style={styles.clubsFilterChipStatic} accessibilityRole="text">
                <Text style={styles.clubsFilterChipText}>
                  {clubsLoading ? 'Clubes' : `${clubs.length} club${clubs.length === 1 ? '' : 'es'}`}
                </Text>
              </View>
            </ScrollView>
          )}

          {step === 'pista_externa' ? (
            <ScrollView
              style={styles.pistaScroll}
              contentContainerStyle={styles.pistaContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.nuevoPartidoTitle}>Nuevo partido</Text>

              <View style={styles.sportCard}>
                <Text style={styles.sportEmoji}>🎾</Text>
                <Text style={styles.sportLabel}>Padel</Text>
              </View>

              <Pressable style={({ pressed }) => [styles.formButton, styles.formButtonSelected, pressed && styles.pressed]}>
                <Ionicons name="people-outline" size={20} color="#9ca3af" />
                <Text style={styles.formButtonLabel}>Double</Text>
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
                  <Text style={styles.formButtonLabel}>Fecha y Hora</Text>
                  <Text style={styles.formButtonSub}>Selecciona fecha y hora</Text>
                </View>
                <Ionicons name="add" size={20} color="#9ca3af" />
              </Pressable>

              <Pressable style={({ pressed }) => [styles.formButton, styles.formButtonLast, pressed && styles.pressed]}>
                <Ionicons name="location-outline" size={20} color="#9ca3af" />
                <Text style={styles.formButtonLabelGray}>Localizacion</Text>
                <Ionicons name="add" size={20} color="#9ca3af" />
              </Pressable>

              <Text style={styles.detallesTitle}>Detalles de partido</Text>

              <Pressable style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}>
                <Text style={styles.detailEmoji}>🏆</Text>
                <Text style={styles.detailLabel}>Tipo de partido</Text>
                <View style={styles.detailRight}>
                  <Text style={styles.detailValue}>Competitivo</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              </Pressable>

              <View style={styles.detailRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#9ca3af" />
                <Text style={styles.detailLabel}>Marcar pista como reservada</Text>
                <Switch
                  value={pistaReservada}
                  onValueChange={setPistaReservada}
                  trackColor={{ false: '#e5e7eb', true: theme.auth.accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Ionicons name="lock-closed-outline" size={20} color="#9ca3af" />
                <Text style={styles.detailLabel}>Marcar partido como privado</Text>
                <View style={styles.detailRight}>
                  <Switch
                    value={partidoPrivado}
                    onValueChange={setPartidoPrivado}
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
                accessibilityLabel="Crear partido"
              >
                <Text style={styles.crearPartidoButtonText}>Crear partido</Text>
              </Pressable>
            </ScrollView>
          ) : step === 'configurar' && selectedSlot && selectedClub ? (
            <View style={styles.configurarWrap}>
              <ScrollView
                style={styles.pistaScroll}
                contentContainerStyle={styles.configurarContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.configSection}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.configOption,
                      competitive && styles.configOptionSelected,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setCompetitive(true)}
                  >
                    <View style={[styles.configRadio, competitive && styles.configRadioSelected]}>
                      {competitive && <View style={styles.configRadioDot} />}
                    </View>
                    <View style={styles.configOptionBody}>
                      <Text style={styles.configOptionTitle}>Partido Competitivo</Text>
                      <Text style={styles.configOptionSub}>El resultado afectará a tu nivel y rankings.</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.configOption,
                      !competitive && styles.configOptionSelected,
                      pressed && styles.pressed,
                    ]}
                    accessibilityState={{ selected: !competitive }}
                    onPress={() => setCompetitive(false)}
                  >
                    <View style={[styles.configRadio, !competitive && styles.configRadioSelected]}>
                      {!competitive && <View style={styles.configRadioDot} />}
                    </View>
                    <View style={styles.configOptionBody}>
                      <Text style={styles.configOptionTitle}>Partido Amistoso</Text>
                      <Text style={styles.configOptionSub}>El resultado no afectará a tu nivel ni rankings.</Text>
                    </View>
                  </Pressable>
                </View>

                <View style={styles.configSection}>
                  <Text style={styles.configSectionTitle}>Selecciona el género con el que quieres jugar</Text>
                  {[
                    { value: 'any' as GenderOption, label: 'Todos los jugadores', sub: 'Todos los jugadores pueden unirse' },
                    { value: 'male' as GenderOption, label: 'Solo hombres', sub: 'El partido solo admite hombres' },
                    { value: 'female' as GenderOption, label: 'Solo mujeres', sub: 'El partido solo admite mujeres' },
                    { value: 'mixed' as GenderOption, label: 'Mixto', sub: 'Un hombre y una mujer en cada equipo' },
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

                <View style={styles.configSection}>
                  <Text style={styles.configSectionTitle}>Privacidad</Text>
                  <View style={styles.privacyRow}>
                    <View style={styles.privacyLeft}>
                      <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
                      <View style={styles.privacyTextWrap}>
                        <Text style={styles.privacyLabel}>Partido privado</Text>
                        <Text style={styles.privacySub}>No aparecerá en “Partidos abiertos”</Text>
                      </View>
                    </View>
                    <Switch
                      value={partidoPrivado}
                      onValueChange={setPartidoPrivado}
                      trackColor={{ false: '#e5e7eb', true: theme.auth.accent }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>

                <View style={styles.configClubCard}>
                  {selectedClub.imageUrl ? (
                    <Image source={{ uri: selectedClub.imageUrl }} style={styles.configClubImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.configClubImage, styles.configClubImagePlaceholder]} />
                  )}
                  <View style={styles.configClubInfo}>
                    <Text style={styles.configClubName} numberOfLines={1}>{selectedClub.clubName}</Text>
                    <View style={styles.configClubMeta}>
                      <Ionicons name="time-outline" size={12} color="#6b7280" />
                      <Text style={styles.configClubMetaText}>
                        {selectedSlot.dateLabel} • {selectedSlot.time}
                      </Text>
                    </View>
                    <Text style={styles.configClubPrice}>{getSlotDisplayPrice()}</Text>
                  </View>
                </View>

                {createError && (
                  <View style={styles.createErrorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#E31E24" />
                    <Text style={styles.createErrorText}>{createError}</Text>
                  </View>
                )}
              </ScrollView>
              <View style={styles.configurarFooter}>
                <Pressable
                  style={({ pressed }) => [styles.ctaButton, styles.ctaButtonConfig, pressed && styles.pressed]}
                  onPress={handleCheckout}
                  disabled={creating}
                >
                  <Text style={styles.ctaButtonText}>{creating ? 'Creando...' : 'Ir al checkout'}</Text>
                </Pressable>
              </View>
            </View>
          ) : step === 'clubs' ? (
            clubsLoading ? (
              <View style={styles.clubsStateWrapper}>
                <View style={[styles.clubsStateCard, styles.clubsStateCardDark]}>
                  <View style={[styles.clubsStateIconWrap, styles.clubsStateIconWrapDark]}>
                    <ActivityIndicator size="large" color={theme.auth.accent} />
                  </View>
                  <Text style={[styles.clubsStateTitle, styles.clubsStateTitleDark]}>Buscando pistas</Text>
                  <Text style={[styles.clubsStateSub, styles.clubsStateSubDark]}>
                    Obteniendo disponibilidad de clubes...
                  </Text>
                </View>
              </View>
            ) : clubsError ? (
              <View style={styles.clubsStateWrapper}>
                <View style={[styles.clubsStateCard, styles.clubsStateCardDark]}>
                  <View style={[styles.clubsStateIconWrap, styles.clubsStateIconWrapDark]}>
                    <Ionicons name="cloud-offline-outline" size={32} color={theme.auth.textMuted} />
                  </View>
                  <Text style={[styles.clubsStateTitle, styles.clubsStateTitleDark]}>{clubsError}</Text>
                  <Text style={[styles.clubsStateSub, styles.clubsStateSubDark]}>
                    Comprueba la conexión e inténtalo de nuevo
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.retryButton, styles.retryButtonApp, pressed && styles.pressed]}
                    onPress={loadClubs}
                  >
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                  </Pressable>
                </View>
              </View>
            ) : clubs.length === 0 ? (
              <View style={styles.clubsStateWrapper}>
                <View style={[styles.clubsStateCard, styles.clubsStateCardDark]}>
                  <View style={[styles.clubsStateIconWrap, styles.clubsStateIconWrapDark]}>
                    <Text style={styles.clubsEmptyEmoji}>🏟️</Text>
                  </View>
                  <Text style={[styles.clubsStateTitle, styles.clubsStateTitleDark]}>Sin pistas</Text>
                  <Text style={[styles.clubsStateSub, styles.clubsStateSubDark]}>
                    No se encontraron clubes con pistas. Añade clubs y courts en la base de datos.
                  </Text>
                </View>
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
                <View style={styles.bannerGlass}>
                  <Text style={styles.bannerGlassTitle}>Disponibilidad de los clubes WeMatch</Text>
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
                          <Text style={styles.noSlotsTextGlass}>Sin horarios disponibles</Text>
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
                                onPress={() => handleSlotPress(slot, club)}
                                disabled={creating}
                              >
                                <Text style={styles.slotTimeGlass}>{slot.time}</Text>
                                <Text style={styles.slotDurationGlass}>{slot.duration}</Text>
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
          ) : (
          <>
          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              selected === 'club_wematch' && step !== 'location' && styles.optionSelected,
              step === 'location' && styles.optionCardLocation,
              selected === 'club_wematch' && step === 'location' && styles.optionCardLocationSelected,
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
              <Text style={styles.optionEmoji}>🏟️</Text>
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
              pressed && styles.pressed,
            ]}
            onPress={() => setSelected('pista_externa')}
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
                Ya se en que pista voy a jugar
              </Text>
              <Text style={[styles.optionDesc, step === 'location' && styles.optionDescLocation]}>
                Juega en un club o instalacion que esta fuera de las opciones que ofrece WeMatch.
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
            accessibilityLabel="Siguiente"
          >
            <Text style={[styles.ctaButtonText, step === 'location' && styles.ctaButtonTextLocation]}>Siguiente</Text>
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
          accessibilityLabel="Cerrar"
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
  headerClubsTitle: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  headerClubsRightSpacer: {
    width: 40,
    height: 40,
  },
  /** Franja de filtros bajo header (clubes fullscreen): gap-2 px-5 pb-4 */
  clubsFiltersScroll: {
    width: '100%',
    maxHeight: 52,
  },
  clubsFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 16,
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
  /** Header light del paso `configurar` (como StartMatchFlow) */
  headerConfig: {
    backgroundColor: 'rgba(250,250,250,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 16,
    marginBottom: 0,
  },
  headerConfigCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(250,250,250,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerConfigTitle: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
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
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  slotPressedGlass: {
    borderColor: theme.auth.accent,
    backgroundColor: 'rgba(241, 143, 52, 0.08)',
  },
  slotTimeGlass: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#000000',
  },
  slotDurationGlass: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  noSlotsTextGlass: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textMuted,
    fontStyle: 'italic',
  },
  clubsStateWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 32,
  },
  clubsStateCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  clubsStateIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  clubsStateTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 4,
  },
  clubsStateSub: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  clubsStateCardDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clubsStateIconWrapDark: {
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.25)',
  },
  clubsStateTitleDark: {
    color: theme.auth.text,
  },
  clubsStateSubDark: {
    color: theme.auth.textMuted,
    marginBottom: 0,
  },
  clubsEmptyEmoji: {
    fontSize: 28,
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
    color: '#1A1A1A',
    marginBottom: 12,
  },
  configOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
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
    borderColor: '#d1d5db',
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
    color: '#1A1A1A',
    marginBottom: 2,
  },
  configOptionSub: {
    fontSize: 12,
    color: '#6b7280',
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
    color: '#1A1A1A',
  },
  configGenderSub: {
    fontSize: 12,
    color: '#9ca3af',
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
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
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
    color: '#1A1A1A',
  },
  privacySub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  configClubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  configClubImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  configClubImagePlaceholder: { backgroundColor: '#e5e7eb' },
  configClubInfo: {
    flex: 1,
    minWidth: 0,
  },
  configClubName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  configClubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  configClubMetaText: {
    fontSize: 10,
    color: '#6b7280',
  },
  configClubPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.auth.accent,
    marginTop: 4,
  },
  configurarFooter: {
    width: '100%',
    backgroundColor: 'rgba(250,250,250,0.95)',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    paddingBottom: 16,
  },
});
