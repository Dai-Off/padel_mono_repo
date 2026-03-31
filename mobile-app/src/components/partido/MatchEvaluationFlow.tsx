import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { PartidoItem, PartidoPlayer } from '../../screens/PartidosScreen';

const BG = '#0F0F0F';
const ACCENT = '#F18F34';
const ACCENT_END = '#E95F32';
const GRADIENT_BTN_END = '#C46A20';
const SUCCESS_GREEN = '#22c55e';

export type TeammateLevelRating = 'above' | 'match' | 'below';

export type MatchEvaluationPayload = {
  teammateRatings: {
    playerIndex: number;
    playerName: string;
    level: TeammateLevelRating;
    note: string;
  }[];
  sets: { us: number; them: number }[];
  feedbackText: string;
};

/** Siempre 3 pantallas en cabecera: compañeros → resultado → feedback. */
const TOTAL_SECTIONS = 3;

type TeammateSlot = { playerIndex: number; order: number };

const LEVEL_OPTIONS: {
  key: TeammateLevelRating;
  emoji: string;
  title: string;
  sub: string;
}[] = [
  { key: 'above', emoji: '⬆️', title: 'Por encima de mi nivel', sub: 'Jugaba mejor que yo' },
  { key: 'match', emoji: '✅', title: 'Acertado', sub: 'Nivel similar al mío' },
  { key: 'below', emoji: '⬇️', title: 'Por debajo de mi nivel', sub: 'Jugaba peor que yo' },
];

const TEAMMATE_EXTRA_QUESTIONS = [
  '¿Qué aspecto destacarías de su juego hoy?',
  '¿Cómo ha sido la compenetración en pista?',
];

type Props = {
  visible: boolean;
  partido: PartidoItem;
  currentPlayerId: string | null;
  onClose: () => void;
  onComplete?: (payload: MatchEvaluationPayload) => void;
  /** Tras la pantalla de agradecimiento, p. ej. tab inicio + cerrar detalle. */
  onGoHome?: () => void;
};

function initials(p: PartidoPlayer): string {
  return (p.initial ?? p.name?.slice(0, 2) ?? '?').toUpperCase();
}

function buildTeammateList(partido: PartidoItem, currentPlayerId: string | null): TeammateSlot[] {
  const mySlot = currentPlayerId
    ? partido.playerIds?.findIndex((id) => id === currentPlayerId) ?? -1
    : -1;
  const list: TeammateSlot[] = [];
  partido.players.forEach((player, playerIndex) => {
    if (!player.isFree && playerIndex !== mySlot) {
      list.push({ playerIndex, order: list.length });
    }
  });
  return list;
}

export function MatchEvaluationFlow({
  visible,
  partido,
  currentPlayerId,
  onClose,
  onComplete,
  onGoHome,
}: Props) {
  const insets = useSafeAreaInsets();
  const teammates = useMemo(() => buildTeammateList(partido, currentPlayerId), [partido, currentPlayerId]);

  const [showSuccess, setShowSuccess] = useState(false);

  /** 0 = compañeros (sub-pasos internos), 1 = marcador, 2 = comentario final */
  const [sectionIndex, setSectionIndex] = useState(0);
  /** Dentro de la pantalla 1: índice del compañero actual */
  const [teammatePageIndex, setTeammatePageIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<number, { level: TeammateLevelRating | null; note: string }>>(
    {}
  );
  const [sets, setSets] = useState<{ us: string; them: string }[]>([
    { us: '', them: '' },
    { us: '', them: '' },
    { us: '', them: '' },
  ]);
  const [feedbackText, setFeedbackText] = useState('');

  const reset = useCallback(() => {
    setShowSuccess(false);
    setSectionIndex(0);
    setTeammatePageIndex(0);
    setRatings({});
    setSets([
      { us: '', them: '' },
      { us: '', them: '' },
      { us: '', them: '' },
    ]);
    setFeedbackText('');
  }, []);

  useEffect(() => {
    if (visible) {
      reset();
    }
  }, [visible, reset]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleVolverInicio = useCallback(() => {
    reset();
    onClose();
    onGoHome?.();
  }, [onClose, onGoHome, reset]);

  const stepNumber = sectionIndex + 1;
  const progress = stepNumber / TOTAL_SECTIONS;
  const currentTeammate = teammates[teammatePageIndex];

  const setRating = (playerIndex: number, patch: Partial<{ level: TeammateLevelRating | null; note: string }>) => {
    setRatings((prev) => {
      const base = prev[playerIndex] ?? { level: null as TeammateLevelRating | null, note: '' };
      return {
        ...prev,
        [playerIndex]: { ...base, ...patch },
      };
    });
  };

  const goNext = () => {
    if (sectionIndex === 0) {
      if (teammates.length === 0) {
        setSectionIndex(1);
        return;
      }
      if (teammatePageIndex < teammates.length - 1) {
        setTeammatePageIndex((i) => i + 1);
      } else {
        setSectionIndex(1);
      }
      return;
    }
    if (sectionIndex === 1) {
      setSectionIndex(2);
    }
  };

  const finish = () => {
    const teammateRatings = teammates.map((t) => {
      const p = partido.players[t.playerIndex];
      const r = ratings[t.playerIndex];
      return {
        playerIndex: t.playerIndex,
        playerName: p?.name ?? 'Jugador',
        level: (r?.level ?? 'match') as TeammateLevelRating,
        note: r?.note?.trim() ?? '',
      };
    });

    const setsParsed = sets
      .filter((row) => row.us.trim() !== '' && row.them.trim() !== '')
      .map((row) => ({
        us: parseInt(row.us, 10),
        them: parseInt(row.them, 10),
      }))
      .filter((s) => !Number.isNaN(s.us) && !Number.isNaN(s.them));

    const payload: MatchEvaluationPayload = {
      teammateRatings,
      sets: setsParsed,
      feedbackText: feedbackText.trim(),
    };
    onComplete?.(payload);
    setShowSuccess(true);
  };

  const nextLabelForStep = (): string => {
    if (sectionIndex === 0) {
      if (teammates.length === 0) return 'Siguiente paso';
      if (teammatePageIndex < teammates.length - 1) return 'Siguiente jugador';
      return 'Siguiente paso';
    }
    if (sectionIndex === 1) return 'Siguiente pregunta';
    return 'Finalizar';
  };

  const canAdvanceTeammate = (playerIndex: number) => ratings[playerIndex]?.level != null;

  const canAdvanceScore = () => {
    const filled = sets.filter((row) => row.us.trim() !== '' || row.them.trim() !== '');
    if (filled.length === 0) return false;
    return filled.every((row) => {
      const u = parseInt(row.us, 10);
      const t = parseInt(row.them, 10);
      return !Number.isNaN(u) && !Number.isNaN(t) && u >= 0 && u <= 99 && t >= 0 && t <= 99;
    });
  };

  if (!visible) return null;

  const nextDisabled =
    sectionIndex === 0
      ? teammates.length === 0
        ? false
        : currentTeammate
          ? !canAdvanceTeammate(currentTeammate.playerIndex)
          : true
      : sectionIndex === 1
        ? !canAdvanceScore()
        : true;

  return (
    <Modal
      visible={visible}
      animationType={showSuccess ? 'fade' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={showSuccess ? handleVolverInicio : handleClose}
    >
      {showSuccess ? (
        <View style={[styles.root, styles.successRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <ScrollView
            contentContainerStyle={styles.successScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.successBlock}>
              <View style={styles.successIconRing}>
                <Ionicons name="checkmark-circle" size={48} color={SUCCESS_GREEN} />
              </View>
              <Text style={styles.successTitle}>¡Gracias por evaluar!</Text>
              <Text style={styles.successSubtitle}>
                Tus respuestas nos ayudan a nivelar mejor los partidos y mejorar la experiencia de todos en WeMatch.
              </Text>
              <Pressable
                onPress={handleVolverInicio}
                style={({ pressed }) => [styles.successCtaWrap, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Volver a inicio"
              >
                <LinearGradient
                  colors={[ACCENT, GRADIENT_BTN_END]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.successCtaGradient}
                >
                  <Text style={styles.successCtaText}>Volver a inicio</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      ) : (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerSticky}>
          <View style={styles.headerRow}>
            <Pressable onPress={handleClose} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.headerKicker}>Evaluación de Partido</Text>
              <Text style={styles.headerStep}>
                {stepNumber} de {TOTAL_SECTIONS}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={[ACCENT, ACCENT_END]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]}
            />
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom:
                  sectionIndex === 2 ? insets.bottom + 120 : insets.bottom + 24,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {sectionIndex === 0 && teammates.length === 0 && (
              <EmptyTeammatesSection />
            )}
            {sectionIndex === 0 && currentTeammate && (
              <TeammateStepContent
                player={partido.players[currentTeammate.playerIndex]}
                teammateOrder={currentTeammate.order}
                teammatesTotal={teammates.length}
                rating={ratings[currentTeammate.playerIndex] ?? { level: null, note: '' }}
                onChangeLevel={(lvl) => setRating(currentTeammate.playerIndex, { level: lvl })}
                onChangeNote={(note) => setRating(currentTeammate.playerIndex, { note })}
                extraQuestionIndex={currentTeammate.order}
              />
            )}
            {sectionIndex === 1 && <ScoreStepContent sets={sets} onChangeSets={setSets} />}
            {sectionIndex === 2 && (
              <FeedbackStepContent text={feedbackText} onChangeText={setFeedbackText} />
            )}

            {sectionIndex < 2 && (
              <Pressable
                onPress={goNext}
                disabled={nextDisabled}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  nextDisabled ? styles.primaryBtnDisabled : null,
                  pressed && !nextDisabled && styles.pressed,
                ]}
              >
                <Text style={[styles.primaryBtnText, nextDisabled && styles.primaryBtnTextDisabled]}>
                  {nextLabelForStep()}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={nextDisabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)'}
                />
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {sectionIndex === 2 && (
          <View style={[styles.feedbackFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.feedbackActions}>
              <Pressable
                onPress={finish}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryBtnText}>Omitir</Text>
              </Pressable>
              <Pressable
                onPress={finish}
                style={({ pressed }) => [styles.finalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.finalBtnText}>Finalizar</Text>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>
      )}
    </Modal>
  );
}

function EmptyTeammatesSection() {
  return (
    <View style={styles.section}>
      <View style={styles.heroIcon}>
        <Ionicons name="people" size={28} color={ACCENT} />
      </View>
      <Text style={styles.title}>¿Cómo has visto el nivel de tus compañeros?</Text>
      <Text style={styles.subtitle}>No hay otros jugadores para valorar en este partido.</Text>
    </View>
  );
}

function TeammateStepContent({
  player,
  teammateOrder,
  teammatesTotal,
  rating,
  onChangeLevel,
  onChangeNote,
  extraQuestionIndex,
}: {
  player: PartidoPlayer;
  teammateOrder: number;
  teammatesTotal: number;
  rating: { level: TeammateLevelRating | null; note: string };
  onChangeLevel: (l: TeammateLevelRating) => void;
  onChangeNote: (n: string) => void;
  extraQuestionIndex: number;
}) {
  const dots = Array.from({ length: teammatesTotal }, (_, i) => i);
  const extraQ =
    TEAMMATE_EXTRA_QUESTIONS[extraQuestionIndex % TEAMMATE_EXTRA_QUESTIONS.length] ?? TEAMMATE_EXTRA_QUESTIONS[0];
  const noteEnabled = rating.level != null;
  const placeholder = 'Opcional - Escribe tu respuesta...';

  return (
    <View style={styles.section}>
      <View style={styles.heroIcon}>
        <Ionicons name="people" size={28} color={ACCENT} />
      </View>
      <Text style={styles.title}>¿Cómo has visto el nivel de tus compañeros?</Text>
      <Text style={styles.subtitle}>Nos ayuda a nivelar mejor los partidos</Text>

      <View style={styles.dotRow}>
        {dots.map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === teammateOrder ? styles.dotOn : styles.dotOff,
              i === teammateOrder && styles.dotScale,
            ]}
          />
        ))}
      </View>

      <View style={styles.playerCard}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarTxt}>{initials(player)}</Text>
        </View>
        <View>
          <Text style={styles.playerName}>{player.name || 'Jugador'}</Text>
          <Text style={styles.playerMeta}>
            Jugador {teammateOrder + 1} de {teammatesTotal}
          </Text>
        </View>
      </View>

      <View style={styles.options}>
        {LEVEL_OPTIONS.map((opt) => {
          const selected = rating.level === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onChangeLevel(opt.key)}
              style={({ pressed }) => [
                styles.optionRow,
                selected && styles.optionRowSelectedFill,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <View style={styles.optionTextCol}>
                <Text style={[styles.optionTitle, selected && styles.optionTitleOnAccent]}>{opt.title}</Text>
                <Text style={[styles.optionSub, selected && styles.optionSubOnAccent]}>{opt.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.noteBox, !noteEnabled && styles.noteBoxDisabled]}>
        <Text style={styles.noteLabel}>{extraQ}</Text>
        <TextInput
          value={rating.note}
          onChangeText={onChangeNote}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.noteInput}
          editable={noteEnabled}
          multiline
        />
      </View>
    </View>
  );
}

function ScoreStepContent({
  sets,
  onChangeSets,
}: {
  sets: { us: string; them: string }[];
  onChangeSets: Dispatch<SetStateAction<{ us: string; them: string }[]>>;
}) {
  const setRow = (i: number, field: 'us' | 'them', v: string) => {
    const cleaned = v.replace(/[^\d]/g, '').slice(0, 2);
    onChangeSets((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: cleaned };
      return next;
    });
  };

  const addSet = () => {
    onChangeSets((prev) => [...prev, { us: '', them: '' }]);
  };
  const removeSet = () => {
    onChangeSets((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  return (
    <View style={styles.section}>
      <View style={styles.heroIcon}>
        <Ionicons name="trophy" size={28} color={ACCENT} />
      </View>
      <Text style={styles.title}>¿Cuál fue el resultado?</Text>
      <Text style={styles.subtitle}>Introduce el marcador por sets</Text>

      <View style={styles.setHeaderRow}>
        <Text style={styles.setHeadMuted}>Set</Text>
        <Text style={[styles.setHeadAccent, styles.setColUs]}>Nosotros</Text>
        <View style={styles.setDash} />
        <Text style={[styles.setHeadMuted, styles.setColThem]}>Ellos</Text>
      </View>

      {sets.map((row, i) => (
        <View key={i} style={styles.setGrid}>
          <Text style={styles.setLabel}>Set {i + 1}</Text>
          <TextInput
            value={row.us}
            onChangeText={(t) => setRow(i, 'us', t)}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.2)"
            style={[styles.setInput, styles.setColUs]}
          />
          <Text style={styles.setHyphen}>-</Text>
          <TextInput
            value={row.them}
            onChangeText={(t) => setRow(i, 'them', t)}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.2)"
            style={[styles.setInput, styles.setColThem]}
          />
        </View>
      ))}

      <View style={styles.setActions}>
        <Pressable onPress={removeSet} style={({ pressed }) => [styles.setLinkBtn, pressed && styles.pressed]}>
          <Text style={styles.setLinkMuted}>− Quitar set</Text>
        </Pressable>
        <Pressable onPress={addSet} style={({ pressed }) => [styles.setLinkBtn, pressed && styles.pressed]}>
          <Text style={styles.setLinkAccent}>+ Añadir set</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FeedbackStepContent({
  text,
  onChangeText,
}: {
  text: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heroIcon}>
        <Ionicons name="chatbubble-outline" size={28} color={ACCENT} />
      </View>
      <Text style={styles.title}>¿Cómo ha ido el partido?</Text>
      <Text style={styles.subtitle}>Cuéntanos lo que quieras, sin límite</Text>

      <TextInput
        value={text}
        onChangeText={onChangeText}
        placeholder="Ej: Buen partido, bastante igualado..."
        placeholderTextColor="rgba(255,255,255,0.3)"
        style={styles.textarea}
        multiline
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{text.length} caracteres</Text>

      <Pressable
        onPress={() => Alert.alert('Próximamente', 'La respuesta por audio estará disponible pronto.')}
        style={({ pressed }) => [styles.audioBtn, pressed && styles.pressed]}
      >
        <Ionicons name="mic" size={22} color="#fff" />
        <Text style={styles.audioBtnText}>Responder con audio</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: { flex: 1 },
  headerSticky: {
    backgroundColor: 'rgba(15,15,15,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },
  headerKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerStep: { fontSize: 14, fontWeight: '800', color: '#fff' },
  headerSpacer: { width: 40 },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    maxWidth: 672,
    width: '100%',
    alignSelf: 'center',
  },
  section: { gap: 16, marginBottom: 24 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(241,143,52,0.2)',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
  },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: ACCENT },
  dotOff: { backgroundColor: 'rgba(255,255,255,0.2)' },
  dotScale: { transform: [{ scale: 1.15 }] },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  playerName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  playerMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  options: { gap: 12 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionRowSelectedFill: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  optionEmoji: { fontSize: 22 },
  optionTextCol: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  optionTitleOnAccent: { color: '#fff' },
  optionSub: { fontSize: 14, color: '#9ca3af', marginTop: 2 },
  optionSubOnAccent: { color: 'rgba(255,255,255,0.75)' },
  noteBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  noteBoxDisabled: { opacity: 0.45 },
  noteLabel: { fontSize: 14, color: '#d1d5db', marginBottom: 12, fontWeight: '600' },
  noteInput: {
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 14,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  setHeadMuted: {
    width: 52,
    fontSize: 10,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  setHeadAccent: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: ACCENT,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  setColUs: { flex: 1 },
  setColThem: { flex: 1, textAlign: 'center' },
  setDash: { width: 24 },
  setGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  setLabel: { width: 52, fontSize: 14, color: '#9ca3af', fontWeight: '600' },
  setInput: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  setHyphen: { width: 24, textAlign: 'center', color: '#4b5563', fontSize: 18, fontWeight: '800' },
  setActions: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 },
  setLinkBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  setLinkMuted: { fontSize: 14, color: '#9ca3af' },
  setLinkAccent: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  textarea: {
    minHeight: 180,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },
  charCount: { textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  audioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  audioBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: ACCENT,
    marginTop: 8,
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  primaryBtnTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  feedbackFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BG,
  },
  feedbackActions: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  finalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: ACCENT,
  },
  finalBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  pressed: { opacity: 0.88 },
  successRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  successScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    maxWidth: 672,
    width: '100%',
    alignSelf: 'center',
  },
  successBlock: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  successIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: SUCCESS_GREEN,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
    marginBottom: 40,
  },
  successCtaWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  successCtaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCtaText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
});
