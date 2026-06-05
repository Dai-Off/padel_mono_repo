import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { sendDirectMessage } from '../../api/messages';
import { searchPlayers } from '../../api/players';
import type { PlayerPreferences } from '../../api/players';
import { AffinityVisibilityToggle } from '../affinity/AffinityVisibilityToggle';

type Option = { id: string; label: string };

// Los criterios de afinidad SON las preferencias del jugador: días y franjas
// (multi-selección) y estilo (selección única). El deporte se fija en pádel.
const DAY_OPTIONS: Option[] = [
  { id: 'mon', label: 'Lun' },
  { id: 'tue', label: 'Mar' },
  { id: 'wed', label: 'Mié' },
  { id: 'thu', label: 'Jue' },
  { id: 'fri', label: 'Vie' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
];
const SLOT_OPTIONS: Option[] = [
  { id: 'morning', label: 'Mañana' },
  { id: 'afternoon', label: 'Tarde' },
  { id: 'evening', label: 'Noche' },
  { id: 'night', label: 'Madrugada' },
];
const STYLE_OPTIONS: Option[] = [
  { id: 'competitive', label: 'Competitivo' },
  { id: 'social', label: 'Social' },
  { id: 'learning', label: 'Aprendizaje' },
  { id: 'balanced', label: 'Cualquiera' },
];

export type AffinityCriteria = {
  days: string[];
  slots: string[];
  style: string;
};

type MatchCandidate = {
  id: string;
  name: string;
  matchPercent: number;
  level: string;
  stats: { matches: number; wins: string; distance: string };
  tags: string[];
  reason: string;
};

const AI_AUTO_DM_TEXT = '¡Hola! Me gustaría jugar Pádel contigo. ¿Tienes disponibilidad?';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseCandidatesFromResponse(text: string): MatchCandidate[] {
  const tryParseJsonLike = (raw: string): unknown | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const attempts = [
      trimmed,
      trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
      trimmed.replace(/^json\s*/i, '').trim(),
      // Some providers return escaped markdown/json (\\n instead of real newlines).
      trimmed.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t'),
      trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t'),
    ];

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
      attempts.push(
        trimmed
          .slice(firstBrace, lastBrace + 1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
      );
    }

    for (const candidate of attempts) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        // If response itself is a JSON-encoded string, parse one more time.
        if (typeof parsed === 'string') {
          const nested = tryParseJsonLike(parsed);
          if (nested) return nested;
        }
        return parsed;
      } catch {
        // keep trying
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

type IAAfinidadModalProps = {
  visible: boolean;
  loading: boolean;
  responseText: string | null;
  errorText: string | null;
  onClose: () => void;
  /** Preferencias actuales del jugador; prefilonan el formulario de criterios. */
  preferences: PlayerPreferences | null;
  /**
   * Lanza la búsqueda. Con `persist=true` los criterios editados se guardan
   * antes como preferencias del jugador.
   */
  onRunSearch: (criteria: AffinityCriteria, persist: boolean) => void;
  /** Visibilidad actual del jugador en las búsquedas de afinidad. */
  affinityVisible: boolean;
  /** Activa/desactiva la visibilidad; devuelve true si se guardó correctamente. */
  onSetVisible: (visible: boolean) => Promise<boolean>;
  /** Cancela la búsqueda en curso (descarta su resultado y libera el loading). */
  onCancelSearch: () => void;
  onDirectMessageSent?: (target: { id: string; displayName: string; avatarUrl: string | null }) => void;
  sentIds?: Set<string>;
  onSentIdsChange?: (newSet: Set<string>) => void;
  /** Abre el perfil público de un jugador */
  onPlayerPress?: (playerId: string) => void;
};

function OptionSection({
  title,
  icon,
  options,
  selectedIds,
  onToggle,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  options: Option[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={14} color="#F18F34" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.optionGrid}>
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={[styles.optionBtn, selected ? styles.optionBtnSelected : styles.optionBtnDefault]}
              onPress={() => onToggle(option.id)}
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

function CandidateCard({
  candidate,
  onMessagePress,
  onPlayerPress,
  sending,
  sent,
}: {
  candidate: MatchCandidate;
  onMessagePress: (candidate: MatchCandidate) => void;
  onPlayerPress?: (candidate: MatchCandidate) => void;
  sending: boolean;
  sent: boolean;
}) {
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <Pressable 
          onPress={() => onPlayerPress?.(candidate)}
          style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.avatarGlow} />
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{candidate.name.charAt(0)}</Text>
          </View>
          <View style={styles.onlineDot}>
            <View style={styles.onlineInnerDot} />
          </View>
        </Pressable>
        <View style={styles.candidateHeaderContent}>
          <View style={styles.candidateTitleRow}>
            <Pressable onPress={() => onPlayerPress?.(candidate)} style={{ flex: 1 }}>
              <Text style={styles.candidateName} numberOfLines={1}>{candidate.name}</Text>
            </Pressable>
            <View style={styles.percentPill}>
              <Ionicons name="sparkles" size={12} color="#F18F34" />
              <Text style={styles.percentText}>{candidate.matchPercent}%</Text>
            </View>
          </View>
          <Text style={styles.candidateLevel}>{candidate.level}</Text>
        </View>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>PARTIDOS</Text>
          <Text style={styles.statValue}>{candidate.stats.matches}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>VICTORIAS</Text>
          <Text style={styles.statValue}>{candidate.stats.wins}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>DISTANCIA</Text>
          <Text style={styles.statValue}>{candidate.stats.distance}</Text>
        </View>
      </View>

      <View style={styles.tagsWrap}>
        {candidate.tags.map((tag, tagIdx) => (
          <View key={`${candidate.id}-${tagIdx}-${tag}`} style={styles.tagPill}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>

      <View style={styles.reasonBox}>
        <Ionicons name="star" size={14} color="#F18F34" style={{ marginTop: 1 }} />
        <Text style={styles.reasonText}>
          <Text style={styles.reasonStrong}>Razón del match:</Text> {candidate.reason}
        </Text>
      </View>

      {sent ? (
        <View style={styles.messageBtnSent}>
          <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />
          <Text style={styles.messageBtnSentText}>Mensaje enviado</Text>
        </View>
      ) : (
        <Pressable style={[styles.messageBtn, sending && { opacity: 0.7 }]} onPress={() => onMessagePress(candidate)} disabled={sending}>
          <LinearGradient
            colors={['#F18F34', '#E95F32']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.messageBtnGradient}
          >
            {sending ? (
              <Animated.View>
                <Ionicons name="hourglass-outline" size={16} color="#fff" />
              </Animated.View>
            ) : (
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
            )}
            <Text style={styles.messageBtnText}>{sending ? 'Enviando...' : 'Enviar mensaje'}</Text>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
}

export function IAAfinidadModal({
  visible,
  loading,
  responseText,
  errorText,
  onClose,
  preferences,
  onRunSearch,
  affinityVisible,
  onSetVisible,
  onCancelSearch,
  onDirectMessageSent,
  sentIds = new Set(),
  onSentIdsChange,
  onPlayerPress,
}: IAAfinidadModalProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const prefDays = preferences?.preferredDays ?? [];
  const prefSlots = preferences?.preferredScheduleSlots ?? [];
  const prefStyle = preferences?.preferredPlayStyle ?? 'balanced';
  /** Hay datos suficientes para buscar directamente sin pedir nada. */
  const prefsComplete = prefDays.length > 0 && prefSlots.length > 0;

  const [criteria, setCriteria] = useState<AffinityCriteria>(() => ({
    days: prefDays,
    slots: prefSlots,
    style: prefStyle,
  }));
  /** El usuario está en el formulario de criterios (primera vez o editando). */
  const [showForm, setShowForm] = useState(false);
  /** Evita relanzar la auto-búsqueda más de una vez por apertura. */
  const autoSearchedRef = useRef(false);

  const completedSteps =
    (criteria.days.length > 0 ? 1 : 0) +
    (criteria.slots.length > 0 ? 1 : 0) +
    (criteria.style ? 1 : 0);
  const progressPercent = Math.round((completedSteps / 3) * 100);
  const isFormComplete = criteria.days.length > 0 && criteria.slots.length > 0 && !!criteria.style;

  const [sendingCandidateId, setSendingCandidateId] = useState<string | null>(null);

  // Sincronizar con props para persistencia
  const [sentCandidateIds, setSentCandidateIds] = useState<Set<string>>(sentIds);
  useEffect(() => {
    setSentCandidateIds(sentIds);
  }, [sentIds]);

  /** Guardando el cambio de visibilidad (gate de consentimiento). */
  const [settingVisible, setSettingVisible] = useState(false);
  /** Fuerza el gate aunque haya resultados: el usuario intentó buscar sin visibilidad. */
  const [forceConsent, setForceConsent] = useState(false);
  /** Búsqueda que quedó pendiente por falta de visibilidad; se lanza al activarla. */
  const [pendingCriteria, setPendingCriteria] = useState<AffinityCriteria | null>(null);

  // Vistas mutuamente excluyentes del cuerpo del modal:
  //  - gate de visibilidad: sin visibilidad activa no se puede buscar
  //  - formulario: editando, o primera vez sin preferencias completas
  //  - auto-búsqueda en curso: prefs completas, sin resultados aún
  //  - resultados: hay respuesta de la IA
  const hasResults = !!responseText;
  // El gate se muestra mientras no haya visibilidad y: no haya resultados en
  // pantalla (no bloqueamos ver lo ya buscado), o el usuario haya intentado
  // buscar de nuevo estando invisible (forceConsent).
  const needsConsent = !affinityVisible && (!hasResults || forceConsent);
  // Formulario si: el usuario edita, faltan preferencias, o una búsqueda falló
  // (errorText) sin resultados — así no se queda el loader colgado.
  const showFormView =
    !needsConsent && (showForm || (!hasResults && (!prefsComplete || !!errorText)));
  const autoSearchPending = !loading && !needsConsent && !showFormView && !hasResults;
  const isFormView = !loading && showFormView;

  const handleActivateVisibility = async () => {
    if (settingVisible) return;
    setSettingVisible(true);
    const ok = await onSetVisible(true);
    setSettingVisible(false);
    if (!ok) return;
    setForceConsent(false);
    if (pendingCriteria) {
      // Veníamos de un intento de búsqueda con el formulario estando invisible:
      // lanzamos esa misma búsqueda ahora que ya somos visibles.
      autoSearchedRef.current = true;
      onRunSearch(pendingCriteria, true);
      setPendingCriteria(null);
    }
    // Si no había pendiente, al volverse affinityVisible=true el efecto de
    // auto-búsqueda lanza con las prefs (o se muestra el formulario si faltan).
  };

  /** Cambia la visibilidad desde el toggle del modal (vista de resultados). */
  const handleVisibilityChange = async (next: boolean): Promise<boolean> => {
    if (settingVisible) return affinityVisible;
    setSettingVisible(true);
    const ok = await onSetVisible(next);
    setSettingVisible(false);
    return ok;
  };

  // Desde el loader: pasar a editar criterios sin esperar a que termine la
  // búsqueda. Cancela la búsqueda en curso (su resultado se descarta) y abre el
  // formulario; autoSearchedRef evita que el efecto la relance.
  const handleEditDuringLoad = () => {
    autoSearchedRef.current = true;
    onCancelSearch();
    setShowForm(true);
  };

  const toggleDay = (id: string) =>
    setCriteria((p) => ({
      ...p,
      days: p.days.includes(id) ? p.days.filter((d) => d !== id) : [...p.days, id],
    }));
  const toggleSlot = (id: string) =>
    setCriteria((p) => ({
      ...p,
      slots: p.slots.includes(id) ? p.slots.filter((s) => s !== id) : [...p.slots, id],
    }));
  const setStyle = (id: string) => setCriteria((p) => ({ ...p, style: id }));

  const handleSubmitForm = () => {
    if (!isFormComplete) return;
    setShowForm(false);
    const empty = new Set<string>();
    setSentCandidateIds(empty);
    onSentIdsChange?.(empty);
    if (!affinityVisible) {
      // No se puede buscar sin visibilidad: guardamos la intención y mostramos
      // el gate; al activar la visibilidad se lanza esta misma búsqueda.
      setPendingCriteria(criteria);
      setForceConsent(true);
      return;
    }
    autoSearchedRef.current = true; // ya hemos lanzado búsqueda en esta apertura
    onRunSearch(criteria, true); // persistir criterios editados como preferencias
  };

  const parsedCandidates = useMemo(
    () => (responseText ? parseCandidatesFromResponse(responseText) : []),
    [responseText]
  );
  const handleCandidateMessage = async (candidate: MatchCandidate) => {
    if (!token) {
      Alert.alert('Mensajes', 'Inicia sesión para enviar mensajes.');
      return;
    }

    setSendingCandidateId(candidate.id);
    try {
      const search = await searchPlayers(candidate.name, token);
      if (!search.ok || search.players.length === 0) {
        Alert.alert('Mensajes', `No se encontró a "${candidate.name}" para enviarle mensaje.`);
        return;
      }

      const expected = normalizeText(candidate.name);
      const exact =
        search.players.find((p) => {
          const full = normalizeText([p.first_name, p.last_name].filter(Boolean).join(' '));
          return full === expected;
        }) ??
        search.players.find((p) => {
          const full = normalizeText([p.first_name, p.last_name].filter(Boolean).join(' '));
          return full.includes(expected) || expected.includes(full);
        }) ??
        search.players[0];

      const sent = await sendDirectMessage(exact.id, AI_AUTO_DM_TEXT, token);
      if (!sent.ok) {
        Alert.alert('Mensajes', sent.error);
        return;
      }

      const targetName = [exact.first_name, exact.last_name].filter(Boolean).join(' ').trim() || candidate.name;
      // Marcar candidato como enviado para que al volver del chat se muestre el estado
      const newSet = new Set([...sentCandidateIds, candidate.id]);
      setSentCandidateIds(newSet);
      onSentIdsChange?.(newSet);
      // Abrir el hilo de chat (el usuario puede darle back y volver a los resultados)
      onDirectMessageSent?.({
        id: exact.id,
        displayName: targetName,
        avatarUrl: null,
      });
    } finally {
      setSendingCandidateId(null);
    }
  };

  const handlePlayerPress = async (candidate: MatchCandidate) => {
    if (!token) {
      Alert.alert('Perfil', 'Inicia sesión para ver perfiles.');
      return;
    }

    try {
      const search = await searchPlayers(candidate.name, token);
      if (!search.ok || search.players.length === 0) {
        Alert.alert('Perfil', `No se encontró a "${candidate.name}".`);
        return;
      }

      const expected = normalizeText(candidate.name);
      const exact =
        search.players.find((p) => {
          const full = normalizeText([p.first_name, p.last_name].filter(Boolean).join(' '));
          return full === expected;
        }) ??
        search.players.find((p) => {
          const full = normalizeText([p.first_name, p.last_name].filter(Boolean).join(' '));
          return full.includes(expected) || expected.includes(full);
        }) ??
        search.players[0];

      onPlayerPress?.(exact.id);
    } catch (err) {
      console.error('Error resolving player for profile:', err);
    }
  };
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

  // Al abrir: sincronizar los criterios con las preferencias actuales y salir
  // del modo formulario. Al cerrar: rearmar la auto-búsqueda para la próxima vez.
  useEffect(() => {
    if (!visible) {
      autoSearchedRef.current = false;
      setShowForm(false);
      setForceConsent(false);
      setPendingCriteria(null);
      return;
    }
    setCriteria({ days: prefDays, slots: prefSlots, style: prefStyle });
    setShowForm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Auto-búsqueda al entrar cuando las preferencias están completas y no hay
  // resultados previos. Si faltan datos, se muestra el formulario (mini-form).
  useEffect(() => {
    if (!visible || loading) return;
    if (!affinityVisible) return; // sin visibilidad → se muestra el gate, no se busca
    if (responseText) return; // ya hay resultados (p. ej. al volver del chat)
    if (showForm) return; // el usuario está editando criterios
    if (!prefsComplete) return; // faltan datos → formulario
    if (autoSearchedRef.current) return;
    autoSearchedRef.current = true;
    onRunSearch({ days: prefDays, slots: prefSlots, style: prefStyle }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, loading, affinityVisible, responseText, showForm, prefsComplete]);

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
                    <Ionicons name="sparkles" size={20} color="#fff" />
                  </LinearGradient>
                </View>
                <View>
                  <Text style={styles.headerTitle}>Buscar Compañero con IA</Text>
                  <Text style={styles.headerSubtitle}>
                    {loading || autoSearchPending
                      ? 'Buscando...'
                      : needsConsent
                        ? 'Activa tu visibilidad'
                        : isFormView
                          ? 'Define tus preferencias'
                          : 'Resultados IA'}
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
            {loading || autoSearchPending ? (
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
                <Text style={styles.loaderTitle}>Buscando compañeros...</Text>
                <Text style={styles.loaderSubtitle}>Generando recomendaciones...</Text>
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
                <Pressable style={styles.loaderEditBtn} onPress={handleEditDuringLoad}>
                  <Ionicons name="options-outline" size={16} color="#9ca3af" />
                  <Text style={styles.loaderEditText}>Cambiar preferencias</Text>
                </Pressable>
              </View>
            ) : needsConsent ? (
              <View style={styles.gateWrap}>
                <View style={styles.gateIcon}>
                  <Ionicons name="people" size={36} color="#F18F34" />
                </View>
                <Text style={styles.gateTitle}>Activa tu visibilidad</Text>
                <Text style={styles.gateText}>
                  Para encontrar compañeros con la IA de afinidad, también serás
                  visible para otros jugadores que busquen compañero. Puedes
                  desactivarlo cuando quieras desde tus preferencias.
                </Text>
                <Pressable
                  style={[styles.gateBtn, settingVisible && styles.gateBtnDisabled]}
                  onPress={() => void handleActivateVisibility()}
                  disabled={settingVisible}
                >
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.gateBtnText}>
                    {settingVisible ? 'Activando…' : 'Activar y buscar'}
                  </Text>
                </Pressable>
                {!!errorText && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{errorText}</Text>
                  </View>
                )}
              </View>
            ) : showFormView ? (
              <>
                <OptionSection
                  title="¿Qué días te viene bien?"
                  icon="calendar-outline"
                  options={DAY_OPTIONS}
                  selectedIds={criteria.days}
                  onToggle={toggleDay}
                />
                <OptionSection
                  title="¿En qué franjas?"
                  icon="time-outline"
                  options={SLOT_OPTIONS}
                  selectedIds={criteria.slots}
                  onToggle={toggleSlot}
                />
                <OptionSection
                  title="Estilo de juego"
                  icon="locate-outline"
                  options={STYLE_OPTIONS}
                  selectedIds={[criteria.style]}
                  onToggle={setStyle}
                />

                <Text style={styles.formHint}>
                  Estas preferencias se guardan en tu perfil y se usan para
                  encontrar jugadores compatibles.
                </Text>

                <Pressable
                  style={[
                    styles.submitBtn,
                    (loading || !isFormComplete) && styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmitForm}
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
                    Buscar Compañero
                  </Text>
                </Pressable>

                {!!errorText && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{errorText}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.resultHead}>
                  <View style={styles.resultIconWrap}>
                    <Ionicons name="checkmark" size={42} color="#fff" />
                  </View>
                  <Text style={styles.resultTitle}>
                    {parsedCandidates.length > 0 ? `${parsedCandidates.length} compañeros encontrados!` : 'No se encontraron compañeros'}
                  </Text>
                  <Text style={styles.resultSubtitle}>
                    {parsedCandidates.length > 0 ? 'Compañeros perfectos para ti' : 'Prueba ajustando tus preferencias para ampliar opciones.'}
                  </Text>
                </View>

                <View style={styles.resultsList}>
                  {parsedCandidates.length > 0 ? (
                    parsedCandidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        onMessagePress={handleCandidateMessage}
                        onPlayerPress={handlePlayerPress}
                        sending={sendingCandidateId === candidate.id}
                        sent={sentCandidateIds.has(candidate.id)}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyCandidatesCard}>
                      <Text style={styles.emptyCandidatesText}>
                        No se encontraron compañeros.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.resultsVisibility}>
                  <AffinityVisibilityToggle
                    value={affinityVisible}
                    onChange={handleVisibilityChange}
                    disabled={settingVisible}
                  />
                </View>

                <Pressable
                  style={styles.searchAgainBtn}
                  onPress={() => setShowForm(true)}
                >
                  <Ionicons name="options-outline" size={18} color="#d1d5db" />
                  <Text style={styles.searchAgainText}>Editar preferencias</Text>
                </Pressable>
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
  formHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
    fontWeight: '500',
    paddingHorizontal: 2,
  },
  gateWrap: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 8,
    gap: 14,
  },
  gateIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  gateText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#9ca3af',
    textAlign: 'center',
    maxWidth: 320,
  },
  gateBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.32)',
  },
  gateBtnDisabled: {
    opacity: 0.6,
  },
  gateBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  resultsVisibility: {
    marginTop: 14,
  },
  searchAgainBtn: {
    marginTop: 12,
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
    textAlign: 'center',
    width: '100%',
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
  loaderEditBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  loaderEditText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  loaderDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#F18F34',
  },
  messageBtnSent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
  },
  messageBtnSentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4ADE80',
  },
});
