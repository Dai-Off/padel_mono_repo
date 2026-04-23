import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '../stripe';
import { useAuth } from '../contexts/AuthContext';
import {
  cancelMatchAsOrganizer,
  fetchMatchById,
  prepareJoin,
  submitMatchFeedback,
  submitMatchScore,
  type SubmitMatchFeedbackBody,
} from '../api/matches';
import { createPaymentIntent, confirmPaymentFromClient } from '../api/payments';
import { fetchMyPlayerId } from '../api/players';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { rejectMatchmakingProposal } from '../api/matchmaking';
import { ClubInfoSheet } from '../components/partido/ClubInfoSheet';
import {
  MatchEvaluationFlow,
  type MatchEvaluationPayload,
} from '../components/partido/MatchEvaluationFlow';
import type { PartidoItem, PartidoPlayer } from './PartidosScreen';

const BG = '#0F0F0F';
const ACCENT = '#F18F34';

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

function formatDurationHuman(raw: string): string {
  const match = /^(\d+)/.exec(raw.trim());
  if (!match) return raw;
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n)) return raw;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`;
  return `${h} hora${h > 1 ? 's' : ''} ${m} minutos`;
}

function openInMaps(venue: string, venueAddress?: string, location?: string) {
  const address = venueAddress
    ? `${venue}, ${venueAddress}`
    : `${venue}, ${location ?? ''}`;
  const encoded = encodeURIComponent(address.trim());
  const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  Linking.openURL(url).catch(() => {});
}

type TabId = 'info' | 'players' | 'club';

type PartidoDetailScreenProps = {
  partido: PartidoItem;
  onBack: () => void;
  /** Tras evaluar el partido: ir al tab inicio (y cerrar modal desde el padre). */
  onGoHome?: () => void;
};

function PulseDot() {
  return (
    <View style={styles.pulseWrap}>
      <View style={styles.pulseRing} />
      <View style={styles.pulseCore} />
    </View>
  );
}

export function PartidoDetailScreen({
  partido: initialPartido,
  onBack,
  onGoHome,
}: PartidoDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<TabId, number>>({ info: 0, players: 0, club: 0 });
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [favorite, setFavorite] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  /** Evita mostrar «Reservar plaza» antes de saber si el usuario ya está en el partido (fetch async). */
  const [playerContextResolved, setPlayerContextResolved] = useState(() => !session?.access_token);
  const [partido, setPartido] = useState<PartidoItem>(initialPartido);
  const [joiningSlotIndex, setJoiningSlotIndex] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [matchmakingPayBusy, setMatchmakingPayBusy] = useState(false);
  const [decliningMatchmaking, setDecliningMatchmaking] = useState(false);
  const [clubInfoVisible, setClubInfoVisible] = useState(false);
  const [evaluationVisible, setEvaluationVisible] = useState(false);
  /** Overlay mientras el backend cancela / reembolsa (Stripe puede tardar varios segundos). */
  const [cancelOverlay, setCancelOverlay] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  useEffect(() => {
    if (!session?.access_token) {
      setCurrentPlayerId(null);
      setPlayerContextResolved(true);
      return;
    }
    setPlayerContextResolved(false);
    fetchMyPlayerId(session.access_token)
      .then(setCurrentPlayerId)
      .catch(() => setCurrentPlayerId(null))
      .finally(() => setPlayerContextResolved(true));
  }, [session?.access_token]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    fetchMatchById(partido.id, token).then((m) => {
      if (!m) return;
      const updated = mapMatchToPartido(m);
      if (updated) {
        setPartido((prev) => ({
          ...updated,
          organizerPlayerId: updated.organizerPlayerId ?? prev.organizerPlayerId,
          matchmakingPayment: prev.matchmakingPayment,
          matchType: updated.matchType ?? prev.matchType,
          matchStatus: updated.matchStatus ?? prev.matchStatus,
          bookingStatus: updated.bookingStatus ?? prev.bookingStatus,
        }));
      }
    });
  }, [partido.id, session?.access_token]);

  const isInMatch = currentPlayerId != null && (partido.playerIds ?? []).includes(currentPlayerId);
  const firstFreeIndex = partido.players.findIndex((p) => p.isFree);

  useEffect(() => {
    if (selectedSlotIndex == null) return;
    const slot = partido.players[selectedSlotIndex];
    if (!slot?.isFree || isInMatch) {
      setSelectedSlotIndex(null);
    }
  }, [partido.players, selectedSlotIndex, isInMatch]);

  const handleJoin = useCallback(
    async (slotIndex: number) => {
      const token = session?.access_token;
      if (!token) {
        Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión para unirte al partido.');
        return;
      }
      setJoiningSlotIndex(slotIndex);
      const prep = await prepareJoin(partido.id, slotIndex, token);
      if (!('bookingId' in prep)) {
        setJoiningSlotIndex(null);
        const err = prep.error ?? 'No se pudo preparar.';
        if (prep.code === 'schedule_conflict' || err.includes('esa hora') || err.includes('otro horario')) {
          Alert.alert('Horario no disponible', 'Ya tienes un partido a esa hora. Elige otro partido.');
        } else {
          Alert.alert('Error', err);
        }
        return;
      }
      const intentRes = await createPaymentIntent(prep.bookingId, token, slotIndex);
      if (!intentRes.ok || !intentRes.clientSecret) {
        setJoiningSlotIndex(null);
        Alert.alert('Error', 'No se pudo iniciar el pago. Inténtalo de nuevo.');
        return;
      }
      const returnURL = Linking.createURL('stripe-redirect');
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: intentRes.clientSecret,
        merchantDisplayName: 'WeMatch Padel',
        returnURL,
      });
      if (initErr) {
        setJoiningSlotIndex(null);
        Alert.alert('Error', 'Error al configurar el pago. Inténtalo de nuevo.');
        return;
      }
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        setJoiningSlotIndex(null);
        if (presentErr.code === 'Canceled') {
          Alert.alert('Cancelado', 'Pago cancelado.');
        } else {
          Alert.alert('Error', 'Error al procesar el pago. Inténtalo de nuevo.');
        }
        return;
      }
      const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId!, token);
      setJoiningSlotIndex(null);
      if (!confirmRes.ok) {
        Alert.alert('Error', 'No se pudo confirmar. Inténtalo de nuevo.');
        return;
      }
      const match = await fetchMatchById(partido.id, token);
      if (match) {
        const updated = mapMatchToPartido(match);
        if (updated) setPartido(updated);
      }
      setSelectedSlotIndex(null);
    },
    [partido.id, session?.access_token, initPaymentSheet, presentPaymentSheet]
  );

  const handleMatchmakingPay = useCallback(async () => {
    const token = session?.access_token;
    const mp = partido.matchmakingPayment;
    if (!token || !mp?.bookingId || !mp?.participantId) {
      Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión para pagar.');
      return;
    }
    setMatchmakingPayBusy(true);
    const intentRes = await createPaymentIntent(mp.bookingId, token, undefined, mp.participantId);
    if (!intentRes.ok || !intentRes.clientSecret) {
      setMatchmakingPayBusy(false);
      Alert.alert('Error', intentRes.error ?? 'No se pudo iniciar el pago. Inténtalo de nuevo.');
      return;
    }
    const returnURL = Linking.createURL('stripe-redirect');
    const { error: initErr } = await initPaymentSheet({
      paymentIntentClientSecret: intentRes.clientSecret,
      merchantDisplayName: 'WeMatch Padel',
      returnURL,
    });
    if (initErr) {
      setMatchmakingPayBusy(false);
      Alert.alert('Error', 'Error al configurar el pago. Inténtalo de nuevo.');
      return;
    }
    const { error: presentErr } = await presentPaymentSheet();
    if (presentErr) {
      setMatchmakingPayBusy(false);
      if (presentErr.code === 'Canceled') {
        Alert.alert('Cancelado', 'Pago cancelado.');
      } else {
        Alert.alert('Error', 'Error al procesar el pago. Inténtalo de nuevo.');
      }
      return;
    }
    const confirmRes = await confirmPaymentFromClient(intentRes.paymentIntentId!, token);
    setMatchmakingPayBusy(false);
    if (!confirmRes.ok) {
      Alert.alert('Error', 'No se pudo confirmar. Inténtalo de nuevo.');
      return;
    }
    const match = await fetchMatchById(partido.id, token);
    if (match) {
      const updated = mapMatchToPartido(match);
      if (updated) setPartido({ ...updated, matchmakingPayment: undefined });
    }
  }, [
    partido.id,
    partido.matchmakingPayment,
    session?.access_token,
    initPaymentSheet,
    presentPaymentSheet,
  ]);

  const handleDeclineMatchmaking = useCallback(() => {
    Alert.alert(
      'Declinar partido',
      'Se cancelará la reserva y el partido para los cuatro jugadores. Solo ocurre si confirmás acá.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, declinar',
          style: 'destructive',
          onPress: async () => {
            const token = session?.access_token;
            if (!token) {
              Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión.');
              return;
            }
            setDecliningMatchmaking(true);
            try {
              const r = await rejectMatchmakingProposal(partido.id, token);
              if (!r.ok) {
                Alert.alert('Error', r.error);
                return;
              }
              Alert.alert('Listo', 'Has declinado el partido.', [{ text: 'OK', onPress: () => onBack() }]);
            } finally {
              setDecliningMatchmaking(false);
            }
          },
        },
      ]
    );
  }, [partido.id, session?.access_token, onBack]);

  const scrollToTab = (tab: TabId) => {
    setActiveTab(tab);
    const y = sectionY.current[tab];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const teamA = partido.players.slice(0, 2);
  const teamB = partido.players.slice(2, 4);
  const heroUri = partido.venueImage ?? pickPlaceholderUri(partido.id);
  const venueAddress = partido.venueAddress ?? partido.location;
  const locationLine =
    partido.location && partido.location !== '—'
      ? partido.location
      : venueAddress;
  const courtLine = [partido.courtName, partido.courtType].filter(Boolean).join(' — ') || '—';
  const levelDisplay = partido.levelRange.replace(/\./g, ',');

  const onShare = async () => {
    try {
      await Share.share({
        message: `${partido.venue} · ${partido.dateTime}`,
      });
    } catch {
      /* ignore */
    }
  };

  const matchPhase = partido.matchPhase ?? 'upcoming';

  const pendingMmPay =
    !!partido.matchmakingPayment?.bookingId && !!partido.matchmakingPayment?.participantId;
  const joinBusy = joiningSlotIndex !== null || matchmakingPayBusy || decliningMatchmaking;
  const mmPayShareLabel =
    partido.matchmakingPayment?.shareAmountCents != null
      ? `${(partido.matchmakingPayment.shareAmountCents / 100).toFixed(2).replace('.', ',')}€`
      : partido.price;
  const canDeclineMmProposal =
    partido.matchType === 'matchmaking' &&
    partido.matchStatus === 'pending' &&
    partido.bookingStatus === 'pending_payment' &&
    matchPhase !== 'past';
  const handleSubmitEvaluation = useCallback(
    async (payload: MatchEvaluationPayload) => {
      const token = session?.access_token;
      if (!token) return { ok: false as const, error: 'Necesitas iniciar sesión para guardar el feedback.' };

      const levelRatings: SubmitMatchFeedbackBody['level_ratings'] = [];
      for (const rating of payload.teammateRatings) {
        const playerId =
          partido.playerIdsBySlot?.[rating.playerIndex] ??
          partido.playerIds?.[rating.playerIndex] ??
          null;
        if (!playerId) continue;
        levelRatings.push({
          player_id: playerId,
          perceived: rating.level === 'above' ? 1 : rating.level === 'below' ? -1 : 0,
          comment: rating.note?.trim() ? rating.note.trim() : null,
        });
      }

      if (levelRatings.length !== payload.teammateRatings.length || levelRatings.length === 0) {
        return {
          ok: false as const,
          error: 'No se pudo mapear a todos los jugadores para enviar el feedback.',
        };
      }

      if (payload.sets.length > 0 && currentPlayerId) {
        const fresh = await fetchMatchById(partido.id, token);
        let team: 'A' | 'B' | null = null;
        if (fresh?.match_players) {
          const mine = fresh.match_players.find((mp) => mp.players?.id === currentPlayerId);
          team = mine?.team ?? null;
        }
        if (!team) {
          return {
            ok: false as const,
            error: 'No se pudo determinar tu equipo para guardar el marcador.',
          };
        }
        const apiSets =
          team === 'A'
            ? payload.sets.map((s) => ({ a: s.us, b: s.them }))
            : payload.sets.map((s) => ({ a: s.them, b: s.us }));
        const scoreRes = await submitMatchScore(
          partido.id,
          { sets: apiSets, match_end_reason: 'completed' },
          token
        );
        if (!scoreRes.ok && scoreRes.status !== 409) {
          return { ok: false as const, error: scoreRes.error };
        }
      }

      const res = await submitMatchFeedback(
        partido.id,
        {
          level_ratings: levelRatings,
          comment: payload.feedbackText || null,
        },
        token
      );

      if (!res.ok) return res;
      return { ok: true as const };
    },
    [partido.id, partido.playerIds, partido.playerIdsBySlot, currentPlayerId, session?.access_token]
  );
  /** Usuario apuntado y partido aún no cerrado: barra inferior con finalizar + papelera. */
  const playersFilledCount = partido.players.filter((p) => !p.isFree).length;
  const showFinishBar =
    playerContextResolved && isInMatch && matchPhase !== 'past' && !pendingMmPay;
  const bottomBarNeedsStack = pendingMmPay || canDeclineMmProposal;
  const bottomReserve = insets.bottom + (showFinishBar ? 100 : bottomBarNeedsStack ? 148 : 88);
  const canPressCta =
    playerContextResolved &&
    selectedSlotIndex != null &&
    !isInMatch &&
    !joinBusy &&
    matchPhase !== 'past';

  const canPressMatchmakingPay =
    playerContextResolved && pendingMmPay && !joinBusy && matchPhase !== 'past';

  const handleTrashMatch = useCallback(() => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión para salir o cancelar el partido.');
      return;
    }
    const soloEnPartido = playersFilledCount <= 1;
    const title = soloEnPartido ? '¿Cancelar el partido?' : '¿Salir del partido?';
    const message = soloEnPartido
      ? 'Eres el único jugador: se anulará la reserva y el partido desaparecerá. Si pagaste con tarjeta, se reembolsará.'
      : 'Dejarás tu plaza; los demás siguen en el partido. Si pagaste tu parte con tarjeta, se reembolsará.';

    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      {
        text: soloEnPartido ? 'Sí, cancelar todo' : 'Sí, salir',
        style: 'destructive',
        onPress: async () => {
          setCancelOverlay({
            open: true,
            message: soloEnPartido
              ? 'Cancelando partido y reembolso…'
              : 'Saliendo del partido…',
          });
          try {
            const r = await cancelMatchAsOrganizer(partido.id, token);
            if (r.ok) {
              if (r.cancelledEntireMatch) {
                Alert.alert('Listo', 'El partido y la reserva quedaron cancelados.');
                onBack();
              } else {
                setCancelOverlay((o) => ({ ...o, message: 'Actualizando partido…' }));
                Alert.alert('Listo', 'Saliste del partido. Si pagaste con tarjeta, el reembolso se procesará en breve.');
                const m = await fetchMatchById(partido.id, token);
                const updated = m ? mapMatchToPartido(m) : null;
                if (updated) setPartido(updated);
              }
              return;
            }
            const extra =
              r.refund_errors?.length ? `\n\n${r.refund_errors.slice(0, 3).join('\n')}` : '';
            Alert.alert('No se pudo completar', `${r.error}${extra}`);
          } finally {
            setCancelOverlay({ open: false, message: '' });
          }
        },
      },
    ]);
  }, [session?.access_token, partido.id, onBack, playersFilledCount]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomReserve }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View>
          <View style={styles.heroWrap}>
            <Image source={{ uri: heroUri }} style={styles.heroImg} resizeMode="cover" />
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
                accessibilityLabel="Volver"
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </Pressable>
              <View style={styles.heroTopRight}>
                <Pressable
                  style={({ pressed }) => [styles.heroCircleBtn, pressed && styles.pressed]}
                  onPress={onShare}
                >
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.heroCircleBtn, pressed && styles.pressed]}
                  onPress={() => setFavorite((f) => !f)}
                >
                  <Ionicons
                    name={favorite ? 'heart' : 'heart-outline'}
                    size={18}
                    color="#fff"
                  />
                </Pressable>
              </View>
            </View>
            <View style={styles.heroBottom}>
              <View style={styles.heroBadgesRow}>
                <View style={styles.badgeAuto}>
                  <Text style={styles.badgeAutoText}>Automático</Text>
                </View>
                <View style={styles.badgePadel}>
                  <Text style={styles.badgePadelText}>Pádel</Text>
                </View>
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {partido.venue}
              </Text>
              <View style={styles.heroLocRow}>
                <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroLocText} numberOfLines={1}>
                  {locationLine}
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
                  ['info', 'Información'],
                  ['players', 'Jugadores'],
                  ['club', 'Club'],
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
                <Text style={styles.cardTitle}>Detalles del partido</Text>
                <View style={styles.grid3}>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>Género</Text>
                    <Text style={styles.gridValue}>{partido.typeLabel}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>Nivel</Text>
                    <Text style={styles.gridValue}>{levelDisplay}</Text>
                  </View>
                  <View style={styles.gridCell}>
                    <Text style={styles.gridLabel}>Precio</Text>
                    <Text style={styles.gridValue}>{partido.pricePerPlayer}</Text>
                  </View>
                </View>
                <DetailRow
                  icon="calendar-outline"
                  label="Fecha"
                  value={partido.dateTime}
                />
                <DetailRow
                  icon="time-outline"
                  label="Duración"
                  value={formatDurationHuman(partido.duration)}
                />
                <DetailRow icon="information-circle-outline" label="Pista" value={courtLine} />
                <DetailRow
                  icon="people-outline"
                  label="Fin inscripción"
                  value="Hasta el inicio del partido"
                />
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                    onPress={() =>
                      openInMaps(partido.venue, partido.venueAddress, partido.location)
                    }
                  >
                    <View style={styles.actionIconFill}>
                      <Ionicons name="navigate" size={22} color="#fff" />
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      CÓMO LLEGAR
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                    onPress={() =>
                      Alert.alert('Web', 'Enlace del club disponible próximamente.')
                    }
                  >
                    <View style={styles.actionIconOutline}>
                      <Ionicons name="globe-outline" size={22} color="rgba(255,255,255,0.6)" />
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      WEB
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.actionCol, pressed && styles.pressed]}
                    onPress={() =>
                      Alert.alert('Teléfono', 'Contacto del club disponible próximamente.')
                    }
                  >
                    <View style={styles.actionIconOutline}>
                      <Ionicons name="call-outline" size={22} color="rgba(255,255,255,0.6)" />
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      LLAMAR
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.statusPill}>
                <PulseDot />
                <Text style={styles.statusPillText}>
                  Partido{'\n'}Abierto
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{ paddingVertical: 16 }}
            onLayout={(e) => {
              sectionY.current.players = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionPad}>
              <View style={styles.glassCard}>
                <Text style={styles.cardTitle}>Jugadores</Text>
                <View style={styles.teamsRow}>
                  <View style={styles.teamCol}>
                    {teamA.map((p, i) => (
                      <PlayerSlotDetail
                        key={i}
                        player={p}
                        onJoin={
                          playerContextResolved &&
                          p.isFree &&
                          !isInMatch &&
                          (joiningSlotIndex == null || joiningSlotIndex === i)
                            ? () => setSelectedSlotIndex(i)
                            : undefined
                        }
                        joining={joiningSlotIndex === i}
                        selected={selectedSlotIndex === i}
                      />
                    ))}
                  </View>
                  <Text style={styles.vsBig}>VS</Text>
                  <View style={styles.teamCol}>
                    {teamB.map((p, i) => {
                      const slotIdx = i + 2;
                      return (
                        <PlayerSlotDetail
                          key={i}
                          player={p}
                          onJoin={
                            playerContextResolved &&
                            p.isFree &&
                            !isInMatch &&
                            (joiningSlotIndex == null || joiningSlotIndex === slotIdx)
                              ? () => setSelectedSlotIndex(slotIdx)
                              : undefined
                          }
                          joining={joiningSlotIndex === slotIdx}
                          selected={selectedSlotIndex === slotIdx}
                        />
                      );
                    })}
                  </View>
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
                    {partido.venue}
                  </Text>
                  <Text style={styles.clubRowSub} numberOfLines={2}>
                    {venueAddress}
                  </Text>
                </View>
                <View style={styles.clubRowMap}>
                  <Ionicons name="location" size={18} color="#fff" />
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {!playerContextResolved ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.bottomBarLoading}>
            <ActivityIndicator color={ACCENT} size="small" />
          </View>
        </View>
      ) : showFinishBar ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.finishBarRow}>
            <Pressable
              onPress={handleTrashMatch}
              disabled={cancelOverlay.open}
              style={({ pressed }) => [
                styles.finishBarTrash,
                pressed && !cancelOverlay.open && styles.pressed,
                cancelOverlay.open && styles.finishBarBtnDisabled,
              ]}
              accessibilityLabel="Salir del partido o cancelar reserva"
            >
              <Ionicons name="exit-outline" size={22} color="#f87171" />
            </Pressable>
            <Pressable
              onPress={() => setEvaluationVisible(true)}
              disabled={cancelOverlay.open}
              style={({ pressed }) => [
                styles.finishBarCta,
                pressed && !cancelOverlay.open && styles.pressed,
                cancelOverlay.open && styles.finishBarCtaDisabled,
              ]}
            >
              <Text style={styles.finishBarCtaText}>Finalizar Partido</Text>
            </Pressable>
          </View>
        </View>
      ) : pendingMmPay ? (
        <View style={[styles.bottomBar, styles.bottomBarStack, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              !canPressMatchmakingPay && styles.ctaBtnDisabled,
              pressed && canPressMatchmakingPay && styles.pressed,
            ]}
            onPress={() => void handleMatchmakingPay()}
            disabled={!canPressMatchmakingPay}
          >
            {matchmakingPayBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaTextWrap}>
                <Text style={styles.ctaText}>Pagar mi plaza — {mmPayShareLabel}</Text>
              </View>
            )}
          </Pressable>
          {canDeclineMmProposal ? (
            <Pressable
              style={({ pressed }) => [styles.declineMmBtn, pressed && styles.pressed]}
              onPress={handleDeclineMatchmaking}
              disabled={decliningMatchmaking || matchmakingPayBusy}
            >
              <Text style={styles.declineMmBtnText}>
                {decliningMatchmaking ? 'Declinando…' : 'Declinar partido'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.bottomBar, styles.bottomBarStack, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              !canPressCta && styles.ctaBtnDisabled,
              pressed && canPressCta && styles.pressed,
            ]}
            onPress={() => selectedSlotIndex != null && handleJoin(selectedSlotIndex)}
            disabled={!canPressCta}
          >
            {joinBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaTextWrap}>
                <Text style={styles.ctaText}>
                  {isInMatch
                    ? 'Ya estás en el partido'
                    : firstFreeIndex < 0
                      ? 'No hay plazas libres'
                      : selectedSlotIndex == null
                        ? 'Selecciona una plaza para continuar'
                        : `Reservar plaza - ${partido.pricePerPlayer}`}
                </Text>
              </View>
            )}
          </Pressable>
          {canDeclineMmProposal ? (
            <Pressable
              style={({ pressed }) => [styles.declineMmBtn, pressed && styles.pressed]}
              onPress={handleDeclineMatchmaking}
              disabled={decliningMatchmaking || joinBusy}
            >
              <Text style={styles.declineMmBtnText}>
                {decliningMatchmaking ? 'Declinando…' : 'Declinar partido'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Modal visible={cancelOverlay.open} transparent animationType="fade">
        <View style={styles.cancelModalRoot} accessibilityLiveRegion="polite">
          <View style={styles.cancelModalCard}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.cancelModalText}>{cancelOverlay.message}</Text>
            <Text style={styles.cancelModalHint}>Puede tardar unos segundos si hay reembolso con tarjeta.</Text>
          </View>
        </View>
      </Modal>

      <MatchEvaluationFlow
        visible={evaluationVisible}
        partido={partido}
        currentPlayerId={currentPlayerId}
        onClose={() => setEvaluationVisible(false)}
        onComplete={handleSubmitEvaluation}
        onGoHome={onGoHome}
      />

      <ClubInfoSheet
        visible={clubInfoVisible}
        onClose={() => setClubInfoVisible(false)}
        partido={partido}
      />
    </View>
  );
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

function PlayerSlotDetail({
  player,
  onJoin,
  joining,
  selected,
}: {
  player: PartidoPlayer;
  onJoin?: () => void;
  joining?: boolean;
  selected?: boolean;
}) {
  if (player.isFree) {
    return (
      <View style={styles.plSlot}>
        <Pressable
          style={({ pressed }) => [
            styles.plFree,
            selected && styles.plFreeSelected,
            pressed && onJoin && styles.pressed,
          ]}
          onPress={onJoin}
          disabled={joining || !onJoin}
        >
          {joining ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Text style={styles.plFreePlus}>+</Text>
          )}
        </Pressable>
        <Text style={styles.plFreeCap}>
          {joining ? 'Uniendo...' : selected ? 'Seleccionada' : onJoin ? 'Elegir plaza' : 'Libre'}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.plSlot}>
      <View style={styles.plFill}>
        {player.avatar ? (
          <Image source={{ uri: player.avatar }} style={styles.plAvatar} />
        ) : (
          <Text style={styles.plInitials}>
            {(player.initial ?? player.name?.slice(0, 2) ?? '?').toUpperCase()}
          </Text>
        )}
      </View>
      <Text style={styles.plName} numberOfLines={1}>
        {player.name || 'Jugador'}
      </Text>
      <View style={styles.plLevel}>
        <Text style={styles.plLevelText}>{player.level.replace(/\./g, ',')}</Text>
      </View>
    </View>
  );
}

const HERO_H = 224;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
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
  heroTopRight: { flexDirection: 'row', gap: 8 },
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
  badgeAuto: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.9)',
  },
  badgeAutoText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    paddingHorizontal: 8,
    gap: 12,
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  grid3: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  gridCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  gridLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  detailIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRowBody: { flex: 1, minWidth: 0 },
  detailRowLabel: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailRowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  actionCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  actionIconFill: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconOutline: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.15,
    textAlign: 'center',
    lineHeight: 14,
    alignSelf: 'stretch',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'visible',
  },
  statusPillText: {
    marginLeft: 10,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 17,
    textAlign: 'left',
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  pulseWrap: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(156,163,175,0.5)',
  },
  pulseCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  vsBig: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },
  plSlot: { alignItems: 'center', maxWidth: 88 },
  plFill: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  plAvatar: { width: 56, height: 56, borderRadius: 12 },
  plInitials: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  plName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  plLevel: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#facc15',
  },
  plLevelText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  plFree: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  plFreeSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(241,143,52,0.12)',
  },
  plFreePlus: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '300',
  },
  plFreeCap: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  clubThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#333',
  },
  clubRowBody: { flex: 1, minWidth: 0 },
  clubRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  clubRowSub: {
    fontSize: 12,
    color: '#9ca3af',
  },
  clubRowMap: {
    width: 36,
    height: 36,
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
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(15,15,15,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bottomBarStack: {
    gap: 10,
  },
  declineMmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  declineMmBtnText: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '600',
  },
  finishBarRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  finishBarTrash: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBarBtnDisabled: {
    opacity: 0.45,
  },
  finishBarCtaDisabled: {
    opacity: 0.45,
  },
  finishBarCta: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  finishBarCtaText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  cancelModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  cancelModalCard: {
    backgroundColor: 'rgba(28,28,28,0.98)',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 14,
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelModalText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  cancelModalHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomBarLoading: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ctaBtn: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ctaBtnDisabled: {
    opacity: 0.45,
  },
  ctaTextWrap: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    width: '100%',
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  pressed: { opacity: 0.88 },
});
