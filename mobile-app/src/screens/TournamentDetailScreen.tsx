import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { PublicTournamentRow } from '../api/tournaments';
import {
  fetchTournamentDetailForScreen,
  joinPublicTournament,
  leaveTournament,
} from '../api/tournaments';
import { confirmPaymentFromClient, createIntentForTournament } from '../api/payments';
import { PrivateReservationModal } from '../components/partido/PrivateReservationModal';
import type { BookingConfirmationData } from './BookingConfirmationScreen';
import { useAuth } from '../contexts/AuthContext';
import {
  clubLocationLabel,
  formatClubFullAddress,
  formatDurationMinutes,
  formatEloRange,
  formatFormatLabel,
  formatGenderLabel,
  formatIsoDateTimeEs,
  formatShortDateEs,
  formatTournamentInscriptionPrice,
  formatTournamentStatus,
  inferTournamentFormatKey,
  parsePrizesFromRow,
  placeholderImageForId,
  tournamentTitle,
} from '../domain/tournamentDisplay';
import { theme } from '../theme';

const BG = '#0F0F0F';
const ACCENT = '#F18F34';
const ACCENT_END = '#E95F32';
const CTA_LEAVE_START = '#B91C1C';
const CTA_LEAVE_END = '#7F1D1D';
const HERO_H = 224;

type DetailTab = 'info' | 'equipos' | 'cuadro';

type Props = {
  tournamentId: string;
  onClose: () => void;
};

function pickClub(row: PublicTournamentRow) {
  const c = row.clubs;
  if (!c) return null;
  const one = Array.isArray(c) ? c[0] : c;
  if (!one) return null;
  return {
    name: String((one as { name?: string }).name ?? ''),
    city: String((one as { city?: string }).city ?? ''),
    address: String((one as { address?: string }).address ?? ''),
    postal_code: String((one as { postal_code?: string }).postal_code ?? ''),
    lat: (one as { lat?: number | null }).lat ?? null,
    lng: (one as { lng?: number | null }).lng ?? null,
    logo_url: (one as { logo_url?: string | null }).logo_url ?? null,
    description: (one as { description?: string | null }).description ?? null,
  };
}

function isTournamentStatusOpen(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'open';
}

function normasLines(normas: string | null | undefined): string[] {
  if (!normas?.trim()) return [];
  return normas
    .split(/\n|•/)
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

const MEDALS = ['🥇', '🥈', '🥉'];

const YELLOW_ELO = '#FACC15';
const CUADRO_ICON = '#6b7280';

function tournamentTeamsModel(row: PublicTournamentRow, confirmedPlayers: number) {
  const maxP = row.max_players ?? 1;
  const isPair = row.registration_mode === 'pair';
  const maxTeams = isPair ? Math.max(1, Math.floor(maxP / 2)) : maxP;
  const teamsFilled = isPair
    ? Math.min(Math.floor(confirmedPlayers / 2), maxTeams)
    : Math.min(confirmedPlayers, maxTeams);
  const slotsFree = Math.max(0, maxTeams - teamsFilled);
  return { isPair, maxTeams, teamsFilled, slotsFree };
}

function eloLabelForIndex(index1: number): string {
  return (2.0 + (index1 - 1) * 0.3).toFixed(1);
}

function TeamRowBlock({
  index,
  isPair,
  showElo,
}: {
  index: number;
  isPair: boolean;
  showElo: boolean;
}) {
  const prefix = isPair ? 'E' : 'J';
  const label = isPair ? `Equipo ${index}` : `Participante ${index}`;
  const sub = isPair ? '2 jugadores' : '1 jugador';
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamAvatar}>
        <Text style={[styles.teamAvatarText, index >= 10 && styles.teamAvatarTextSm]} numberOfLines={1}>
          {prefix}
          {index}
        </Text>
      </View>
      <View style={styles.teamRowText}>
        <Text style={styles.teamName}>{label}</Text>
        <Text style={styles.teamSub}>{sub}</Text>
      </View>
      {showElo ? (
        <View style={styles.eloBadge}>
          <Text style={styles.eloBadgeText}>{eloLabelForIndex(index)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TeamSlotAvailableRow() {
  return (
    <View style={styles.teamRowDashed} accessibilityRole="text" accessibilityLabel="Plaza disponible">
      <View style={styles.teamAvatarDashed}>
        <Text style={styles.teamAvatarPlus}>+</Text>
      </View>
      <Text style={styles.teamSlotPlaceholder}>Plaza disponible</Text>
    </View>
  );
}

function BracketCuadroEmpty() {
  return (
    <View style={styles.bracketEmptyWrap}>
      <View style={styles.bracketEmptyIcon}>
        <Ionicons name="trophy-outline" size={28} color={CUADRO_ICON} />
      </View>
      <Text style={styles.bracketEmptyTitle}>Cuadro no disponible</Text>
      <Text style={styles.bracketEmptySub}>
        El cuadro se generará cuando se completen las inscripciones
      </Text>
    </View>
  );
}

function TournamentDetailLoadingSkeleton({
  onClose,
  insetsTop,
  insetsBottom,
}: {
  onClose: () => void;
  insetsTop: number;
  insetsBottom: number;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const sk = (extra: ViewStyle) => [styles.sk, extra, { opacity: pulse }];

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} scrollEnabled={false} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Animated.View style={[styles.skHeroBg, { opacity: pulse }]} />
          <View style={[styles.heroTop, { paddingTop: insetsTop + 8 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <View style={[styles.roundBtn, { opacity: 0.35 }]} />
          </View>
          <View style={styles.heroBottom}>
            <Animated.View style={sk({ width: '42%', height: 13, marginBottom: 10 })} />
            <Animated.View style={sk({ width: '78%', height: 24, borderRadius: 10 })} />
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 14 }}>
          <Animated.View style={sk({ width: '100%', height: 12 })} />
          <Animated.View style={sk({ width: '88%', height: 12 })} />
          <Animated.View style={sk({ width: '64%', height: 12 })} />
          <View style={{ height: 8 }} />
          <Animated.View style={sk({ width: '100%', height: 88, borderRadius: 14 })} />
        </View>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insetsBottom, 12),
            paddingTop: 12,
          },
        ]}
      >
        <Animated.View style={sk({ height: 52, borderRadius: 16, width: '100%' })} />
      </View>
    </View>
  );
}

export function TournamentDetailScreen({ tournamentId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { session, isLoading: authBooting } = useAuth();
  const loadGenerationRef = useRef(0);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [row, setRow] = useState<PublicTournamentRow | null>(null);
  const [counts, setCounts] = useState<{ confirmed: number; pending: number }>({
    confirmed: 0,
    pending: 0,
  });
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('info');
  const [confirmationModalData, setConfirmationModalData] =
    useState<BookingConfirmationData | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const gen = ++loadGenerationRef.current;
      const showLoader = !opts?.silent;
      if (showLoader) setLoading(true);
      setError(null);

      try {
        const detail = await fetchTournamentDetailForScreen(tournamentId, session?.access_token);

        if (gen !== loadGenerationRef.current) {
          return;
        }

        if (!detail.ok) {
          if (opts?.silent) {
            Alert.alert('Error', detail.error ?? 'No se pudo actualizar el torneo.');
          } else {
            setError(detail.error);
          }
          return;
        }

        setRow(detail.tournament);
        setCounts(detail.counts);
        setMyStatus(detail.my_inscription?.status ?? null);
      } finally {
        if (showLoader && gen === loadGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [tournamentId, session?.access_token],
  );

  useEffect(() => {
    if (authBooting) return;
    void load();
  }, [load, authBooting]);

  const title = row ? tournamentTitle(row) : '';
  const heroUri = useMemo(() => {
    if (!row) return '';
    const logo = pickClub(row)?.logo_url?.trim();
    if (logo && /^https?:\/\//i.test(logo)) return logo;
    return placeholderImageForId(row.id);
  }, [row]);
  const formatKey = row ? inferTournamentFormatKey(row.description) : 'torneo';
  const formatLabel = formatFormatLabel(formatKey);
  const genderBadge = row ? formatGenderLabel(row.gender) : null;
  const club = row ? pickClub(row) : null;
  const locationLine = row ? formatClubFullAddress(row) || clubLocationLabel(row) : '';

  const confirmed = counts.confirmed;
  const pending = counts.pending;
  const maxP = row?.max_players ?? 1;
  const fillPct = Math.min(100, Math.round((confirmed / maxP) * 100));
  const remaining = Math.max(0, maxP - confirmed - pending);

  const prizesList = useMemo(() => (row ? parsePrizesFromRow(row) : []), [row]);

  const handleShare = async () => {
    if (!row) return;
    try {
      await Share.share({
        title,
        message: `${title}\n${formatShortDateEs(row.start_at)} — ${locationLine}`,
      });
    } catch {
      /* ignore */
    }
  };

  const openMaps = () => {
    if (!club) return;
    if (
      club.lat != null &&
      club.lng != null &&
      !Number.isNaN(Number(club.lat)) &&
      !Number.isNaN(Number(club.lng))
    ) {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${Number(club.lat)},${Number(club.lng)}`,
      );
      return;
    }
    const q = encodeURIComponent(
      [club.address, club.postal_code, club.city].filter(Boolean).join(', ') || club.name,
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const handleJoin = async () => {
    if (!row) return;
    if (!session?.access_token) {
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para inscribirte en el torneo.');
      return;
    }
    if (!isTournamentStatusOpen(row.status)) {
      Alert.alert('Torneo', 'Las inscripciones no están abiertas.');
      return;
    }
    if (row.registration_mode === 'pair') {
      Alert.alert(
        'Modo parejas',
        'Este torneo solo admite inscripción en pareja. Completa el proceso desde la web del club o el enlace de invitación que te envíe el organizador.',
      );
      return;
    }
    if (remaining <= 0 && myStatus !== 'confirmed') {
      Alert.alert('Cupos completos', 'No hay plazas disponibles.');
      return;
    }

    const token = session.access_token;
    const mustPay = (row.price_cents ?? 0) > 0;

    if (!mustPay) {
      try {
        setJoining(true);
        const r = await joinPublicTournament(row.id, token);
        if (r.ok) {
          Alert.alert(
            'Listo',
            r.already_joined ? 'Ya estabas inscrito en este torneo.' : 'Te has inscrito correctamente.',
          );
          await load({ silent: true });
        } else {
          Alert.alert('No se pudo inscribir', r.error);
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar la inscripción.');
      } finally {
        setJoining(false);
      }
      return;
    }

    // Mismo flujo Stripe que ClubDetailScreen (reserva con pago)
    try {
      setJoining(true);
      const intentRes = await createIntentForTournament(row.id, token);
      if (!intentRes.ok || !intentRes.clientSecret) {
        const errMsg = intentRes.error ?? 'No se pudo iniciar el pago. Inténtalo de nuevo.';
        Alert.alert('Error', errMsg);
        return;
      }

      const returnURL = ExpoLinking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        Alert.alert('Error', 'Error al configurar el pago. Inténtalo de nuevo.');
        return;
      }

      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') {
          Alert.alert('Error', 'Error al procesar el pago. Inténtalo de nuevo.');
        }
        return;
      }

      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId!, token);
      if (!confirmRes.ok) {
        Alert.alert('Error', 'No se pudo confirmar la inscripción. Inténtalo de nuevo.');
        return;
      }

      const detailAfter = await fetchTournamentDetailForScreen(row.id, token);
      const c = detailAfter.ok ? detailAfter.counts : null;
      const clubName = pickClub(row)?.name ?? '';
      const spotsLine =
        c != null ? `${c.confirmed}/${row.max_players}` : `${confirmed + 1}/${row.max_players}`;

      setConfirmationModalData({
        courtName: title,
        clubName,
        dateTimeFormatted: `${formatShortDateEs(row.start_at)} - ${formatShortDateEs(row.end_at)}`,
        duration: formatDurationMinutes(row.duration_min),
        priceFormatted: formatTournamentInscriptionPrice(row.price_cents, row.currency ?? 'EUR'),
        matchVisibility: 'private',
        confirmationKind: 'tournament',
        spotsLine,
      });
      await load({ silent: true });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Error al procesar el pago.');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = () => {
    if (!row || !session?.access_token) {
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para gestionar tu inscripción.');
      return;
    }
    Alert.alert(
      'Cancelar inscripción',
      '¿Seguro que quieres darte de baja de este torneo?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setJoining(true);
                const r = await leaveTournament(row.id, session.access_token!);
                if (r.ok) {
                  Alert.alert('Listo', 'Tu inscripción ha sido cancelada.');
                  await load({ silent: true });
                } else {
                  Alert.alert('No se pudo cancelar', r.error);
                }
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Error al cancelar.');
              } finally {
                setJoining(false);
              }
            })();
          },
        },
      ],
    );
  };

  const handleCtaPress = () => {
    if (!row) return;
    if (myStatus === 'confirmed' || myStatus === 'pending') {
      handleLeave();
      return;
    }
    void handleJoin();
  };

  const ctaLabel = useMemo(() => {
    if (!row) return 'Inscribirme';
    const price = formatTournamentInscriptionPrice(row.price_cents, row.currency ?? 'EUR');
    if (myStatus === 'confirmed' || myStatus === 'pending') return 'Cancelar inscripción';
    return `Inscribirme — ${price}`;
  }, [row, myStatus]);

  const hasActiveInscription = myStatus === 'confirmed' || myStatus === 'pending';
  const ctaGradientColors = useMemo((): [string, string] => {
    if (hasActiveInscription) return [CTA_LEAVE_START, CTA_LEAVE_END];
    return [ACCENT, ACCENT_END];
  }, [hasActiveInscription]);
  const ctaDisabled =
    !row ||
    (!hasActiveInscription && (!isTournamentStatusOpen(row.status) || remaining <= 0));

  if (loading) {
    return (
      <TournamentDetailLoadingSkeleton
        onClose={onClose}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
      />
    );
  }

  if (error && !row) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.err}>{error}</Text>
        <Pressable onPress={onClose} style={styles.retryBtn}>
          <Text style={styles.retryText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  if (!row) return null;

  const { isPair: teamsIsPair, maxTeams, teamsFilled, slotsFree } = tournamentTeamsModel(row, confirmed);
  const equiposTitle = teamsIsPair
    ? `Equipos inscritos (${teamsFilled}/${maxTeams})`
    : `Participantes inscritos (${teamsFilled}/${maxTeams})`;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image source={{ uri: heroUri }} style={styles.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(15,15,15,0.5)', BG]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1 }}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Compartir"
            >
              <Ionicons name="share-social-outline" size={20} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.heroBottom}>
            <View style={styles.badgeRow}>
              <View style={styles.badgeAccent}>
                <Text style={styles.badgeAccentText}>{formatLabel}</Text>
              </View>
              {genderBadge ? (
                <View style={styles.badgeMuted}>
                  <Text style={styles.badgeMutedText}>{genderBadge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.heroTitle}>{title}</Text>
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.locText} numberOfLines={2}>
                {locationLine}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {(
            [
              { id: 'info' as const, label: 'Información' },
              { id: 'equipos' as const, label: 'Equipos' },
              { id: 'cuadro' as const, label: 'Cuadro' },
            ]
          ).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabPill,
                tab === t.id ? styles.tabPillActive : styles.tabPillIdle,
              ]}
            >
              <Text style={[styles.tabPillText, tab !== t.id && styles.tabPillTextIdle]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'info' ? (
          <View style={styles.body}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Detalles del torneo</Text>
              <View style={styles.grid3}>
                <View style={styles.statCell}>
                  <Text style={styles.statCap}>Precio</Text>
                  <Text style={styles.statVal}>
                    {formatTournamentInscriptionPrice(row.price_cents, row.currency ?? 'EUR')}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCap}>Nivel</Text>
                  <Text style={styles.statVal}>{formatEloRange(row.elo_min, row.elo_max)}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCap}>Plazas</Text>
                  <Text style={styles.statVal}>
                    {confirmed}/{maxP}
                  </Text>
                </View>
              </View>

              <View style={styles.rows}>
                <DetailRow
                  icon="information-circle-outline"
                  cap="Estado"
                  text={formatTournamentStatus(row.status)}
                />
                <DetailRow
                  icon="calendar-outline"
                  cap="Periodo del torneo"
                  text={`${formatShortDateEs(row.start_at)} — ${formatShortDateEs(row.end_at)}`}
                />
                <DetailRow
                  icon="time-outline"
                  cap="Duración del partido"
                  text={formatDurationMinutes(row.duration_min)}
                />
                <DetailRow icon="trophy-outline" cap="Estilo (según descripción)" text={formatLabel} />
                <DetailRow
                  icon="people-outline"
                  cap="Inscripción"
                  text={row.registration_mode === 'pair' ? 'Parejas' : 'Individual'}
                />
                {row.registration_closed_at ? (
                  <DetailRow
                    icon="alarm-outline"
                    cap="Cierre de inscripciones"
                    text={formatIsoDateTimeEs(row.registration_closed_at) ?? row.registration_closed_at}
                  />
                ) : null}
                {row.cancellation_cutoff_at ? (
                  <DetailRow
                    icon="alert-circle-outline"
                    cap="Límite de cancelación"
                    text={formatIsoDateTimeEs(row.cancellation_cutoff_at) ?? row.cancellation_cutoff_at}
                  />
                ) : null}
                {row.invite_ttl_minutes != null ? (
                  <DetailRow
                    icon="hourglass-outline"
                    cap="Validez de invitación"
                    text={`${row.invite_ttl_minutes} minutos`}
                  />
                ) : null}
                {row.visibility ? (
                  <DetailRow icon="eye-outline" cap="Visibilidad" text={row.visibility} />
                ) : null}
                {row.cancelled_at ? (
                  <DetailRow
                    icon="close-circle-outline"
                    cap="Cancelado"
                    text={
                      [formatIsoDateTimeEs(row.cancelled_at) ?? row.cancelled_at, row.cancelled_reason]
                        .filter(Boolean)
                        .join(' — ') || '—'
                    }
                  />
                ) : null}
                {row.closed_at ? (
                  <DetailRow
                    icon="lock-closed-outline"
                    cap="Cerrado"
                    text={formatIsoDateTimeEs(row.closed_at) ?? row.closed_at}
                  />
                ) : null}
              </View>

              {club?.description?.trim() ? (
                <View style={styles.descBlock}>
                  <Text style={styles.descBlockTitle}>Club</Text>
                  <Text style={styles.descBlockBody}>{club.description.trim()}</Text>
                </View>
              ) : null}

              {row.description?.trim() ? (
                <View style={styles.descBlock}>
                  <Text style={styles.descBlockTitle}>Descripción</Text>
                  <Text style={styles.descBlockBody}>{row.description.trim()}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={openMaps}
                style={({ pressed }) => [styles.mapPlaceholder, pressed && styles.pressed]}
              >
                <LinearGradient
                  colors={[ACCENT, ACCENT_END]}
                  style={styles.actionCircle}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                >
                  <Ionicons name="navigate" size={22} color="#fff" />
                </LinearGradient>
                <Text style={styles.mapPhTitle}>Cómo llegar</Text>
                <Text style={styles.mapPhCoords} numberOfLines={3}>
                  {club?.lat != null && club?.lng != null
                    ? `${Number(club.lat).toFixed(5)}, ${Number(club.lng).toFixed(5)}`
                    : locationLine || club?.name}
                </Text>
                <Text style={styles.mapPhHint}>Toca para abrir en mapas</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.progressHead}>
                <Text style={styles.cardTitleSm}>Plazas ocupadas</Text>
                <Text style={styles.progressRest}>
                  {remaining} restante{remaining === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={[ACCENT, ACCENT_END]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.progressFill, { width: `${fillPct}%` }]}
                />
              </View>
            </View>

            {prizesList.length > 0 || (row.prize_total_cents && row.prize_total_cents > 0) ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Premios</Text>
                {prizesList.length > 0 ? (
                  prizesList.map((p, i) => (
                    <View key={`${p.label}-${i}`} style={styles.prizeRow}>
                      <Text style={styles.prizeMedal}>{MEDALS[i] ?? '🏅'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prizeTitle}>{p.label}</Text>
                        <Text style={styles.prizeSub}>{formatTournamentInscriptionPrice(p.amount_cents, row.currency ?? 'EUR')}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.prizeSub}>
                    Bolsa total: {formatTournamentInscriptionPrice(row.prize_total_cents ?? 0, row.currency ?? 'EUR')}
                  </Text>
                )}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Normas</Text>
              {normasLines(row.normas).length > 0 ? (
                normasLines(row.normas).map((line, i) => (
                  <View key={i} style={styles.normaRow}>
                    <Text style={styles.normaBullet}>•</Text>
                    <Text style={styles.normaText}>{line}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.normasEmpty}>El club no ha publicado normas para este torneo.</Text>
              )}
            </View>
          </View>
        ) : tab === 'equipos' ? (
          <View style={styles.body}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{equiposTitle}</Text>
              <View style={styles.teamList}>
                {Array.from({ length: teamsFilled }, (_, i) => (
                  <TeamRowBlock
                    key={`t-${row.id}-${i + 1}`}
                    index={i + 1}
                    isPair={teamsIsPair}
                    showElo={teamsIsPair}
                  />
                ))}
                {slotsFree > 0 ? <TeamSlotAvailableRow /> : null}
              </View>
              <Text style={styles.apiNote}>
                Vista según cupos del torneo. Los nombres públicos de equipos o jugadores pueden mostrarse
                cuando el club los publique.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Cuadro del torneo</Text>
              <BracketCuadroEmpty />
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            paddingTop: 12,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleCtaPress}
          disabled={joining || ctaDisabled}
          style={[
            styles.cta,
            (ctaDisabled || joining) && styles.ctaDisabled,
          ]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={ctaGradientColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.ctaGrad}
          >
            {joining ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {confirmationModalData != null ? (
        <PrivateReservationModal
          visible
          data={confirmationModalData}
          onClose={() => setConfirmationModalData(null)}
        />
      ) : null}
    </View>
  );
}

function DetailRow({
  icon,
  cap,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  cap: string;
  text: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={18} color="#9ca3af" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailCap}>{cap}</Text>
        <Text style={styles.detailTxt}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, minHeight: 0 },
  scroll: { flex: 1 },
  sk: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
  },
  skHeroBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { color: '#9ca3af', fontSize: theme.fontSize.sm },
  err: { color: '#fca5a5', textAlign: 'center' },
  backLink: { marginTop: 8, padding: 8 },
  backLinkText: { color: ACCENT, fontWeight: '600' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(241,143,52,0.2)',
  },
  retryText: { color: ACCENT, fontWeight: '600' },
  hero: { height: HERO_H, width: '100%', position: 'relative' },
  heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  roundBtn: {
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
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  badgeAccent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.9)',
  },
  badgeAccentText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeMuted: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  badgeMutedText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  heroTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locText: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
  tabScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabPillActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  tabPillIdle: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabPillText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: '#fff' },
  tabPillTextIdle: { color: 'rgba(255,255,255,0.55)' },
  body: { paddingHorizontal: 20, gap: 16, paddingTop: 4 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
  },
  cardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  cardTitleSm: { fontSize: theme.fontSize.sm, fontWeight: '800', color: '#fff' },
  grid3: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  statCap: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statVal: { fontSize: theme.fontSize.xs, fontWeight: '800', color: '#fff' },
  rows: { gap: 0 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCap: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailTxt: { fontSize: theme.fontSize.sm, fontWeight: '600', color: '#fff' },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descBlock: { marginTop: 16 },
  descBlockTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descBlockBody: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },
  mapPlaceholder: {
    marginTop: 20,
    minHeight: 140,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPhTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
  mapPhCoords: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  mapPhHint: { fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  apiNote: {
    marginTop: 12,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 16,
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressRest: { fontSize: theme.fontSize.xs, fontWeight: '800', color: ACCENT },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  prizeMedal: { fontSize: 22 },
  prizeTitle: { fontSize: theme.fontSize.xs, fontWeight: '700', color: '#fff' },
  prizeSub: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  normaRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  normaBullet: { color: ACCENT, fontSize: theme.fontSize.xs, marginTop: 2 },
  normaText: { flex: 1, fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.55)', lineHeight: 18 },
  normasEmpty: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 20,
  },
  /** En flujo flex (no absolute): si el ScrollView ocupa todo el alto y el CTA va encima en z-order, los toques pueden ir al scroll y el botón «no hace nada». */
  footer: {
    flexShrink: 0,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
    }),
  },
  cta: { borderRadius: 16, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.45 },
  ctaGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
  },
  teamList: {
    gap: 8,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  teamRowText: { flex: 1, minWidth: 0 },
  teamAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAvatarText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  teamAvatarTextSm: { fontSize: 9 },
  teamName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },
  teamSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  eloBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: YELLOW_ELO,
  },
  eloBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  teamRowDashed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: Platform.OS === 'android' ? 'solid' : 'dashed',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  teamAvatarDashed: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: Platform.OS === 'android' ? 'solid' : 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  teamAvatarPlus: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '300',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' as const },
      default: {},
    }),
  },
  teamSlotPlaceholder: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.3)',
  },
  bracketEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  bracketEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  bracketEmptyTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
    textAlign: 'center',
  },
  bracketEmptySub: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  pressed: { opacity: 0.88 },
});
