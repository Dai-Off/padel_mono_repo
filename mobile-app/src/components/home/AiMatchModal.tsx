import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import type { MatchmakingProposalResponse, MatchmakingStatusResponse } from '../../api/matchmaking';

type Option = { id: string; label: string };
type OptionGroupId = 'day' | 'time' | 'preferred_side' | 'gender' | 'search_area';
type OptionGroup = {
  id: OptionGroupId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  options: Option[];
};

/** Criterios alineados con `POST /matchmaking/join` (doc 06_matchmaking.md). */
const GROUPS: OptionGroup[] = [
  {
    id: 'day',
    title: '¿Cuándo podés jugar?',
    icon: 'calendar-outline',
    options: [
      { id: 'hoy', label: 'Hoy' },
      { id: 'manana', label: 'Mañana' },
      { id: 'esta-semana', label: 'Esta semana' },
      { id: 'fin-semana', label: 'Este fin de semana' },
    ],
  },
  {
    id: 'time',
    title: '¿Franja horaria?',
    icon: 'time-outline',
    options: [
      { id: 'manana', label: 'Mañana' },
      { id: 'tarde', label: 'Tarde' },
      { id: 'noche', label: 'Noche' },
    ],
  },
  {
    id: 'preferred_side',
    title: '¿Lado preferido en la pista?',
    icon: 'swap-horizontal-outline',
    options: [
      { id: 'drive', label: 'Drive' },
      { id: 'backhand', label: 'Revés' },
      { id: 'any', label: 'Cualquiera' },
    ],
  },
  {
    id: 'gender',
    title: '¿Tipo de partido (género)?',
    icon: 'people-outline',
    options: [
      { id: 'male', label: 'Solo hombres' },
      { id: 'female', label: 'Solo mujeres' },
      { id: 'mixed', label: 'Mixto' },
      { id: 'any', label: 'Sin preferencia' },
    ],
  },
  {
    id: 'search_area',
    title: '¿Dónde buscar partido?',
    icon: 'navigate-outline',
    options: [
      { id: 'club', label: 'Club WeMatch (asignado)' },
      { id: 'km5', label: 'Radio 5 km desde mi ubicación' },
      { id: 'km10', label: 'Radio 10 km desde mi ubicación' },
      { id: 'km25', label: 'Radio 25 km desde mi ubicación' },
    ],
  },
];

type Selections = Record<OptionGroupId, string>;
const DEFAULT_SELECTIONS: Selections = {
  day: '',
  time: '',
  preferred_side: '',
  gender: '',
  search_area: '',
};

export type MatchmakingSearchInput = {
  day: string;
  time: string;
  preferred_side: 'drive' | 'backhand' | 'any';
  gender: 'male' | 'female' | 'mixed' | 'any';
  /** `club` → club_id; `km*` → max_distance_km + GPS (ver HomeScreen). */
  search_area: 'club' | 'km5' | 'km10' | 'km25';
};

/** Candidatos IA (respuesta estructurada o texto); alineado con parsing en `aiMatch`. */
export type MatchCandidate = {
  id: string;
  name: string;
  matchPercent: number;
  level: string;
  stats: { matches: number; wins: string; distance: string };
  tags: string[];
  reason: string;
};

export function parseCandidatesFromResponse(text: string): MatchCandidate[] {
  const tryParseJsonLike = (raw: string): unknown | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const attempts = [
      trimmed,
      trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
      trimmed.replace(/^json\s*/i, '').trim(),
    ];

    // Also try extracting the first JSON object from noisy wrappers.
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of attempts) {
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        // continue
      }
    }
    return null;
  };

  const parseCandidatesList = (input: unknown): MatchCandidate[] => {
    if (!input || typeof input !== 'object') return [];
    const record = input as Record<string, unknown>;
    const list = (record.candidates ?? record.jugadores ?? record.players) as unknown;
    if (!Array.isArray(list)) return [];

    return list
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const p = item as Record<string, unknown>;
        const name = String(p.name ?? p.nombre ?? '').trim();
        if (!name) return null;
        return {
          id: String(index + 1),
          name,
          matchPercent: Number(p.matchPercent ?? p.compatibility ?? 90),
          level: String(p.level ?? p.nivel ?? 'Nivel compatible'),
          stats: {
            matches: Number(p.matches ?? p.partidos ?? 0),
            wins: String(p.wins ?? p.victorias ?? '-'),
            distance: String(p.distance ?? p.distancia ?? '-'),
          },
          tags: Array.isArray(p.tags) ? (p.tags as string[]) : ['Pádel'],
          reason: String(p.reason ?? p.razon ?? 'Recomendado por la IA.'),
        } satisfies MatchCandidate;
      })
      .filter((x): x is MatchCandidate => x != null)
      .slice(0, 5);
  };

  // 1) Prefer structured JSON when available.
  try {
    const parsed = tryParseJsonLike(text);
    if (!parsed) throw new Error('non-json');
    const root = parseCandidatesList(parsed);
    if (root.length > 0) return root;

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const nestedCandidates = [record.output, record.response, record.answer, record.data, record.message];
      for (const nested of nestedCandidates) {
        const normalized = parseCandidatesList(nested);
        if (normalized.length > 0) return normalized;
        if (typeof nested === 'string') {
          const nestedParsed = tryParseJsonLike(nested);
          const normalizedNested = parseCandidatesList(nestedParsed);
          if (normalizedNested.length > 0) return normalizedNested;
        }
      }
    }
  } catch {
    // Non-JSON content: continue with text parsing.
  }

  // 2) Parse free text responses.
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const nameMatches: string[] = [];
  for (const line of lines) {
    const nameCandidate =
      line.match(/^\d+[\).\-\s]+([A-ZÁÉÍÓÚÑ][\p{L}\s.'-]{2,})$/u)?.[1] ??
      line.match(/^[-*]\s*([A-ZÁÉÍÓÚÑ][\p{L}\s.'-]{2,})$/u)?.[1] ??
      line.match(/(?:jugador|jugadora|candidato|candidata)(?:\s+seleccionado)?\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][\p{L}\s.'-]{2,})/iu)?.[1] ??
      line.match(/(?:propuesto|propuesta)\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][\p{L}\s.'-]{2,})/iu)?.[1];

    if (nameCandidate) {
      const clean = nameCandidate.trim();
      if (!nameMatches.includes(clean)) nameMatches.push(clean);
    }
  }

  return nameMatches.slice(0, 5).map((name, index) => ({
    id: `${index + 1}`,
    name,
    matchPercent: Math.max(80, 98 - index * 3),
    level: 'Nivel compatible',
    stats: { matches: 0, wins: '-', distance: '-' },
    tags: ['Pádel'],
    reason: 'Recomendado por la IA según afinidad de nivel y disponibilidad.',
  }));
}

type AiMatchModalProps = {
  visible: boolean;
  loading: boolean;
  status: MatchmakingStatusResponse | null;
  proposal: MatchmakingProposalResponse | null;
  errorText: string | null;
  /** Mientras se carga el partido para abrir el detalle. */
  openingProposal?: boolean;
  onClose: () => void;
  onSubmit: (input: MatchmakingSearchInput) => void;
  onLeaveQueue: () => void;
  onRespondExpansion: (accept: boolean) => void;
  /** Abre el detalle del partido (pago de plaza matchmaking). */
  onOpenProposal?: () => void;
};

function OptionSection({
  group,
  selectedId,
  onChange,
}: {
  group: OptionGroup;
  selectedId: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIcon}>
          <Ionicons name={group.icon} size={14} color="#F18F34" />
        </View>
        <Text style={styles.sectionTitle}>{group.title}</Text>
      </View>
      <View style={styles.optionGrid}>
        {group.options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.optionBtn, selected ? styles.optionBtnSelected : styles.optionBtnDefault]}
              onPress={() => onChange(option.id)}
            >
              <Text style={[styles.optionText, selected ? styles.optionTextSelected : styles.optionTextDefault]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ProposalCard({
  proposal,
  openingProposal,
  onOpenProposal,
}: {
  proposal: MatchmakingProposalResponse;
  openingProposal?: boolean;
  onOpenProposal?: () => void;
}) {
  const paid = proposal.your_payment_status === 'paid';
  const ctaLabel = paid ? 'Ver partido' : 'Ver partido y pagar';
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarGlow} />
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>M</Text>
          </View>
          <View style={styles.onlineDot}>
            <View style={styles.onlineInnerDot} />
          </View>
        </View>
        <View style={styles.candidateHeaderContent}>
          <View style={styles.candidateTitleRow}>
            <Text style={styles.candidateName} numberOfLines={1}>Partido encontrado</Text>
            <View style={styles.percentPill}>
              <Ionicons name="sparkles" size={12} color="#F18F34" />
              <Text style={styles.percentText}>
                {proposal.pre_match_win_prob != null ? `${Math.round(proposal.pre_match_win_prob * 100)}%` : 'MM'}
              </Text>
            </View>
          </View>
          <Text style={styles.candidateLevel}>Compatibilidad detectada</Text>
        </View>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PARTIDOS</Text>
          <Text style={styles.statValue}>{proposal.booking_id ? 'OK' : '-'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>TU PARTE</Text>
          <Text style={styles.statValue}>
            {proposal.your_share_cents != null ? `€${(proposal.your_share_cents / 100).toFixed(2)}` : '-'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DISTANCIA</Text>
          <Text style={styles.statValue}>{proposal.your_payment_status ?? 'pending'}</Text>
        </View>
      </View>

      <View style={styles.tagsWrap}>
        <View style={styles.tagPill}>
          <Text style={styles.tagText}>Matchmaking</Text>
        </View>
        <View style={styles.tagPill}>
          <Text style={styles.tagText}>Pádel</Text>
        </View>
      </View>

      <View style={styles.reasonBox}>
        <Ionicons name="star" size={14} color="#F18F34" style={{ marginTop: 1 }} />
          <Text style={styles.reasonText}>
            <Text style={styles.reasonStrong}>Siguiente paso:</Text> abrí el detalle y completá el pago de tu plaza.
          </Text>
      </View>

      <Pressable
        style={[styles.messageBtn, (openingProposal || !onOpenProposal) && styles.messageBtnDisabled]}
        disabled={openingProposal || !onOpenProposal}
        onPress={onOpenProposal}
      >
        <LinearGradient
          colors={['#F18F34', '#E95F32']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.messageBtnGradient}
        >
          {openingProposal ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
          )}
          <Text style={styles.messageBtnText}>{ctaLabel}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export function AiMatchModal({
  visible,
  loading,
  status,
  proposal,
  errorText,
  openingProposal = false,
  onClose,
  onSubmit,
  onLeaveQueue,
  onRespondExpansion,
  onOpenProposal,
}: AiMatchModalProps) {
  const insets = useSafeAreaInsets();
  const sheetTitle = 'Liga competitiva 2v2';
  const [selections, setSelections] = useState<Selections>(DEFAULT_SELECTIONS);

  const completedSteps = useMemo(
    () => Object.values(selections).filter((value) => value.length > 0).length,
    [selections]
  );
  const progressPercent = Math.round((completedSteps / GROUPS.length) * 100);
  const isFormComplete = completedSteps === GROUPS.length;
  const [showResults, setShowResults] = useState(false);
  const hasProposal = proposal?.has_proposal === true;
  const isSearching = status?.status === 'searching';
  const isBlocked = status?.status === 'blocked';
  const isFormView = !loading && !isSearching && !hasProposal && !isBlocked && !showResults;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;
  const ringC = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const dotA = useRef(new Animated.Value(0)).current;
  const dotB = useRef(new Animated.Value(0)).current;
  const dotC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) return;

    const makePulse = (value: Animated.Value, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const makeDot = (value: Animated.Value, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 460,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 460,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

    const animations = [
      makePulse(ringA, 0),
      makePulse(ringB, 180),
      makePulse(ringC, 360),
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(spark, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ),
      makeDot(dotA, 0),
      makeDot(dotB, 160),
      makeDot(dotC, 320),
    ];

    animations.forEach((anim) => anim.start());
    return () => {
      animations.forEach((anim) => anim.stop());
      ringA.setValue(0);
      ringB.setValue(0);
      ringC.setValue(0);
      spin.setValue(0);
      spark.setValue(0);
      dotA.setValue(0);
      dotB.setValue(0);
      dotC.setValue(0);
    };
  }, [loading, dotA, dotB, dotC, ringA, ringB, ringC, spark, spin]);

  useEffect(() => {
    setShowResults(hasProposal);
  }, [hasProposal]);

  useEffect(() => {
    if (!visible) return;
    setSelections(DEFAULT_SELECTIONS);
    setShowResults(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.header}>
            <View style={styles.headerGradient}>
              {isFormView && <View style={styles.dragHandle} />}
              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={16}
                pressRetentionOffset={16}
              >
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <View style={styles.headerContent}>
                <View style={styles.headerIconOuter}>
                  <LinearGradient
                    colors={['#F18F34', '#E95F32']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.headerIconWrap}
                  >
                    <Ionicons name="trophy" size={20} color="#fff" />
                  </LinearGradient>
                </View>
                <View>
                  <Text style={styles.headerTitle}>{sheetTitle}</Text>
                  <Text style={styles.headerSubtitle}>
                    {loading || isSearching
                      ? 'Buscando...'
                      : isFormView
                        ? `${completedSteps}/${GROUPS.length} seleccionados`
                        : hasProposal
                          ? 'Propuesta encontrada'
                          : 'Estado'}
                  </Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <LinearGradient
                  colors={['#F18F34', '#FFB347']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.progressValue, { width: `${progressPercent}%` }]}
                />
              </View>
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loaderWrap}>
                <View style={styles.loaderOrb}>
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [
                          { scale: ringA.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) },
                        ],
                        opacity: ringA.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.05] }),
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [
                          { scale: ringB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) },
                        ],
                        opacity: ringB.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.05] }),
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        transform: [
                          { scale: ringC.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) },
                        ],
                        opacity: ringC.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.05] }),
                      },
                    ]}
                  />
                  <View style={styles.spinnerTrack} />
                  <Animated.View
                    style={[
                      styles.spinnerArc,
                      {
                        transform: [
                          {
                            rotate: spin.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '360deg'],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <View style={styles.loaderCenter}>
                    <Animated.View
                      style={{
                        transform: [
                          {
                            rotate: spark.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '220deg'],
                            }),
                          },
                          {
                            scale: spark.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [1, 1.2, 1],
                            }),
                          },
                        ],
                      }}
                    >
                      <Ionicons name="sparkles" size={40} color="#F18F34" />
                    </Animated.View>
                  </View>
                </View>
                <Text style={styles.loaderTitle}>Buscando partido 2v2…</Text>
                <Text style={styles.loaderSubtitle}>
                  Buscamos rivales compatibles según tu disponibilidad, género, lado y club o distancia.
                </Text>
                <View style={styles.loaderDots}>
                  {[dotA, dotB, dotC].map((dot, idx) => (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.loaderDot,
                        {
                          transform: [
                            {
                              translateY: dot.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -14],
                              }),
                            },
                            {
                              scale: dot.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.2],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            ) : isSearching ? (
              <View style={styles.emptyCandidatesCard}>
                <Text style={styles.emptyCandidatesText}>
                  Seguimos buscando jugadores compatibles. Te avisamos acá cuando haya propuesta.
                  {'\n\n'}
                  Para cambiar criterios, salí de la cola y volvé a buscar. El motor necesita 4 jugadores con
                  ventana de tiempo compatible y los filtros de nivel, género y club o distancia que definiste.
                </Text>
                <Pressable style={styles.searchAgainBtn} onPress={onLeaveQueue}>
                  <Ionicons name="exit-outline" size={18} color="#d1d5db" />
                  <Text style={styles.searchAgainText}>Salir de la cola</Text>
                </Pressable>
                {!!status?.expansion_offer && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>
                      Hay una ampliación sugerida para encontrar partido más rápido.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Pressable style={styles.submitBtn} onPress={() => onRespondExpansion(true)}>
                        <Text style={styles.submitText}>Aceptar</Text>
                      </Pressable>
                      <Pressable style={styles.submitBtnDisabled} onPress={() => onRespondExpansion(false)}>
                        <Text style={styles.submitTextDisabled}>Rechazar</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ) : showResults ? (
              <>
                <View style={styles.resultHead}>
                  <View style={styles.resultIconWrap}>
                    <Ionicons name="checkmark" size={42} color="#fff" />
                  </View>
                  <Text style={styles.resultTitle}>
                    {hasProposal ? 'Partido encontrado!' : 'No se encontraron partidos'}
                  </Text>
                  <Text style={styles.resultSubtitle}>
                    {hasProposal ? 'Ya tienes una propuesta lista para confirmar.' : 'Prueba ajustando filtros para ampliar opciones.'}
                  </Text>
                </View>

                <View style={styles.resultsList}>
                  {hasProposal && proposal ? (
                    <ProposalCard
                      proposal={proposal}
                      openingProposal={openingProposal}
                      onOpenProposal={onOpenProposal}
                    />
                  ) : (
                    <View style={styles.emptyCandidatesCard}>
                      <Text style={styles.emptyCandidatesText}>
                        No se encontraron partidos.
                      </Text>
                    </View>
                  )}
                </View>

                <Pressable
                  style={styles.searchAgainBtn}
                  onPress={() => {
                    setSelections(DEFAULT_SELECTIONS);
                    setShowResults(false);
                  }}
                >
                  <Ionicons name="sparkles" size={18} color="#d1d5db" />
                  <Text style={styles.searchAgainText}>Buscar Nuevamente</Text>
                </Pressable>
              </>
            ) : (
              <>
                {GROUPS.map((group) => (
                  <OptionSection
                    key={group.id}
                    group={group}
                    selectedId={selections[group.id]}
                    onChange={(id) => setSelections((prev) => ({ ...prev, [group.id]: id }))}
                  />
                ))}

                <Pressable
                  style={[
                    styles.submitBtn,
                    (loading || !isFormComplete) && styles.submitBtnDisabled,
                  ]}
                  onPress={() =>
                    onSubmit({
                      day: selections.day,
                      time: selections.time,
                      preferred_side: selections.preferred_side as MatchmakingSearchInput['preferred_side'],
                      gender: selections.gender as MatchmakingSearchInput['gender'],
                      search_area: selections.search_area as MatchmakingSearchInput['search_area'],
                    })
                  }
                  disabled={loading || !isFormComplete}
                >
                  <Ionicons
                    name="flash"
                    size={22}
                    color={loading || !isFormComplete ? '#6b7280' : '#fff'}
                  />
                  <Text
                    style={[
                      styles.submitText,
                      (loading || !isFormComplete) && styles.submitTextDisabled,
                    ]}
                  >
                    Unirme a la cola
                  </Text>
                </Pressable>

                {!!errorText && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{errorText}</Text>
                  </View>
                )}
                {isBlocked && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>
                      Tu usuario está bloqueado temporalmente para matchmaking. Revisa más tarde.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: 6,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0F0F0F',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 30,
    elevation: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  headerIconOuter: {
    shadowColor: '#F18F34',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressValue: {
    height: '100%',
    borderRadius: 999,
  },
  body: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 28,
    rowGap: 12,
  },
  section: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  optionBtn: {
    minWidth: '31%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBtnSelected: {
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderColor: 'rgba(241,143,52,0.3)',
  },
  optionBtnDefault: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#fff',
  },
  optionTextDefault: {
    color: '#9ca3af',
  },
  submitBtn: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.32)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(241,143,52,0.12)',
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'transparent',
  },
  submitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitTextDisabled: {
    color: '#6b7280',
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    padding: 12,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
  },
  responseCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#222',
    padding: 12,
  },
  responseTitle: {
    color: '#fff',
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 14,
  },
  responseText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 20,
  },
  resultHead: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  resultIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#22c55e',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  resultSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  resultsList: {
    gap: 10,
  },
  emptyCandidatesCard: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 16,
    padding: 14,
  },
  emptyCandidatesText: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 20,
  },
  candidateCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
  },
  candidateHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    position: 'relative',
  },
  avatarGlow: { display: 'none' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  onlineDot: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  candidateHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  candidateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  candidateName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  percentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  percentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F18F34',
  },
  candidateLevel: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: '#6b7280',
    fontWeight: '800',
  },
  statValue: {
    marginTop: 2,
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tagText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  reasonBox: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.1)',
    backgroundColor: 'rgba(241,143,52,0.05)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  reasonText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#9ca3af',
  },
  reasonStrong: {
    fontWeight: '600',
    color: '#fff',
  },
  messageBtn: {
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  messageBtnDisabled: {
    opacity: 0.55,
  },
  messageBtnGradient: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  searchAgainBtn: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchAgainText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  loaderWrap: {
    minHeight: 460,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loaderOrb: {
    width: 136,
    height: 136,
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(241,143,52,0.28)',
  },
  spinnerTrack: {
    position: 'absolute',
    inset: 24,
    borderRadius: 999,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  spinnerArc: {
    position: 'absolute',
    inset: 24,
    borderRadius: 999,
    borderWidth: 6,
    borderColor: '#F18F34',
    borderTopColor: 'transparent',
  },
  loaderCenter: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  loaderSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  loaderDots: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  loaderDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#F18F34',
  },
});
