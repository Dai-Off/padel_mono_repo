import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchOnboardingNext,
  submitPlayerOnboarding,
  type OnboardingAnswerPayload,
  type OnboardingQuestionPayload,
} from '../../api/playerOnboarding';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type OptionEntry = { label: string; value: unknown };

function isAlreadyCompletedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('ya está completada') || msg.includes('ya completada');
}

/** Supabase/API a veces devuelve `options` como string JSON. */
function coerceOptionsRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function getOptionEntries(q: OnboardingQuestionPayload): OptionEntry[] {
  const raw = coerceOptionsRaw(q.options);
  if (
    q.type !== 'order' &&
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'options' in raw &&
    Array.isArray((raw as { options: unknown }).options)
  ) {
    const opts = (raw as { options: string[] }).options;
    return opts.map((label, idx) => ({ label: String(label), value: idx }));
  }
  if (Array.isArray(raw)) {
    return raw.map((o, idx) => {
      if (typeof o === 'string') {
        if (q.question_key === 'p2') {
          const letters = ['A', 'B', 'C', 'D'];
          return { label: o, value: letters[idx] ?? idx };
        }
        if (q.question_key === 'p7') {
          const lower = o.toLowerCase();
          const value =
            o === 'Sí' || lower === 'sí' || lower === 'si' || lower === 'yes' || o === 'Sí'
              ? 'yes'
              : o === 'No' || lower === 'no'
                ? 'no'
                : o;
          return { label: o, value };
        }
        return { label: o, value: idx };
      }
      const obj = o as Record<string, unknown>;
      const label = String(obj.text ?? obj.label ?? obj.value ?? idx);
      const value = obj.value !== undefined ? obj.value : obj.text !== undefined ? obj.text : idx;
      return { label, value };
    });
  }
  return [];
}

function getOrderClientSteps(q: OnboardingQuestionPayload): string[] {
  const raw = coerceOptionsRaw(q.options);
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'client_steps' in raw) {
    const cs = (raw as { client_steps: unknown }).client_steps;
    if (Array.isArray(cs)) return cs.map(String);
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'steps' in raw) {
    const st = (raw as { steps: unknown }).steps;
    if (Array.isArray(st)) return st.map(String);
  }
  return [];
}

type Props = {
  visible: boolean;
  accessToken: string | null;
  onClose: () => void;
  /** Llamado tras guardar ELO en backend (perfil conviene refrescarlo fuera). */
  onCompleted: (eloRating: number) => void;
  /** ELO del perfil (`/players/me`) para mostrarlo si la API indica que la nivelación ya está hecha. */
  savedEloRating?: number | null;
};

const POOL_LABELS: Record<string, string> = {
  beginner: 'Iniciación',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  expert: 'Experto',
};

function poolLabel(pool: string): string {
  return POOL_LABELS[pool] ?? pool.replace(/_/g, ' ');
}

type ViewMode =
  | { kind: 'loading' }
  | { kind: 'already_done'; elo: number | null }
  | { kind: 'single'; question: OnboardingQuestionPayload; stepLabel: string }
  | {
      kind: 'phase2_intro';
      questions: OnboardingQuestionPayload[];
      eloPhase1: number;
      poolAssigned: string;
    }
  | { kind: 'phase2'; questions: OnboardingQuestionPayload[]; stepLabel: string }
  | { kind: 'done'; elo: number };

export function OnboardingLevelModal({
  visible,
  accessToken,
  onClose,
  onCompleted,
  savedEloRating = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  /** No incluir en deps del bootstrap: al guardar el padre refresca perfil y cambiaría `savedEloRating` y reiniciaría el modal. */
  const savedEloRatingRef = useRef(savedEloRating);
  savedEloRatingRef.current = savedEloRating;
  const [view, setView] = useState<ViewMode>({ kind: 'loading' });
  const [answers, setAnswers] = useState<OnboardingAnswerPayload[]>([]);
  const [singleSelected, setSingleSelected] = useState<unknown>(null);
  const [multiSelected, setMultiSelected] = useState<unknown[]>([]);
  const [phase2Values, setPhase2Values] = useState<Record<string, unknown>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string[]>>({});
  const orderDraftsRef = useRef(orderDrafts);
  orderDraftsRef.current = orderDrafts;
  const [submitting, setSubmitting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (view.kind !== 'single') return;
    const q = view.question;
    if (q.type !== 'order') return;
    setOrderDrafts((prev) => {
      if (prev[q.question_key]?.length) return prev;
      return { ...prev, [q.question_key]: [...getOrderClientSteps(q)] };
    });
  }, [view]);

  const resetLocal = useCallback(() => {
    setAnswers([]);
    setSingleSelected(null);
    setMultiSelected([]);
    setPhase2Values({});
    setOrderDrafts({});
    setSubmitting(false);
    setBootError(null);
    setView({ kind: 'loading' });
  }, []);

  const animateOpen = useCallback(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const animateClose = useCallback(
    (then?: () => void) => {
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) then?.();
      });
    },
    [translateY],
  );

  const applyNextState = useCallback(
    async (nextAnswers: OnboardingAnswerPayload[]) => {
      if (!accessToken) throw new Error('Sesión requerida');
      const state = await fetchOnboardingNext(accessToken, nextAnswers);
      if (state.type === 'complete') {
        setSubmitting(true);
        try {
          const { elo_rating } = await submitPlayerOnboarding(accessToken, nextAnswers);
          const eloNum = Number(elo_rating);
          setView({ kind: 'done', elo: Number.isFinite(eloNum) ? eloNum : 0 });
        } catch (e) {
          if (isAlreadyCompletedError(e)) {
            onCompleted(0);
            setView({ kind: 'already_done', elo: savedEloRatingRef.current ?? null });
            return;
          }
          const msg = e instanceof Error ? e.message : 'No se pudo guardar tu nivel';
          setBootError(msg);
          Alert.alert('Error', msg);
        } finally {
          setSubmitting(false);
        }
        return;
      }
      if (state.type === 'question') {
        setAnswers(nextAnswers);
        setSingleSelected(null);
        setMultiSelected([]);
        const n = nextAnswers.length + 1;
        setView({ kind: 'single', question: state.question, stepLabel: `Cuestionario oficial · Paso ${n}` });
        return;
      }
      setAnswers(nextAnswers);
      const drafts: Record<string, string[]> = {};
      for (const q of state.questions) {
        if (q.type === 'order') {
          drafts[q.question_key] = [...getOrderClientSteps(q)];
        }
      }
      setOrderDrafts(drafts);
      setPhase2Values({});
      if (!state.questions?.length) {
        try {
          setSubmitting(true);
          const { elo_rating } = await submitPlayerOnboarding(accessToken, nextAnswers);
          const eloNum = Number(elo_rating);
          setView({ kind: 'done', elo: Number.isFinite(eloNum) ? eloNum : 0 });
        } catch (e) {
          if (isAlreadyCompletedError(e)) {
            onCompleted(0);
            setView({ kind: 'already_done', elo: savedEloRatingRef.current ?? null });
            return;
          }
          const msg = e instanceof Error ? e.message : 'No se pudo guardar tu nivel';
          setBootError(msg);
          Alert.alert('Error', msg);
        } finally {
          setSubmitting(false);
        }
        return;
      }
      setView({
        kind: 'phase2_intro',
        questions: state.questions,
        eloPhase1: state.elo_phase1,
        poolAssigned: state.pool_assigned,
      });
    },
    [accessToken],
  );

  useEffect(() => {
    if (!visible) return;
    resetLocal();
    animateOpen();
    let cancelled = false;
    (async () => {
      try {
        if (!accessToken) {
          setBootError('Inicia sesión para continuar');
          setView({ kind: 'loading' });
          return;
        }
        const state = await fetchOnboardingNext(accessToken, []);
        if (cancelled) return;
        if (state.type === 'complete') {
          setView({ kind: 'already_done', elo: savedEloRatingRef.current ?? null });
          return;
        }
        if (state.type === 'question') {
          setView({ kind: 'single', question: state.question, stepLabel: 'Cuestionario oficial · Paso 1' });
        } else if (state.type === 'phase2') {
          const drafts: Record<string, string[]> = {};
          for (const q of state.questions) {
            if (q.type === 'order') {
              drafts[q.question_key] = [...getOrderClientSteps(q)];
            }
          }
          setOrderDrafts(drafts);
          if (!state.questions.length) {
            setBootError('No hay preguntas de Fase 2 disponibles. Cierra e intenta de nuevo o contacta al club.');
            return;
          }
          setView({
            kind: 'phase2_intro',
            questions: state.questions,
            eloPhase1: state.elo_phase1,
            poolAssigned: state.pool_assigned,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : 'Error al cargar');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, accessToken, resetLocal, animateOpen]);

  const handleClose = () => {
    animateClose(() => {
      onClose();
      resetLocal();
    });
  };

  const confirmSingleAndAdvance = async () => {
    if (view.kind !== 'single') return;
    const q = view.question;
    let value: unknown = null;
    if (q.type === 'order') {
      const steps = orderDrafts[q.question_key] ?? getOrderClientSteps(q);
      if (!steps.length) {
        Alert.alert('Orden', 'No hay pasos para ordenar.');
        return;
      }
      value = [...steps];
    } else if (q.type === 'multi') {
      if (multiSelected.length === 0) {
        Alert.alert('Selección', 'Elige al menos una opción.');
        return;
      }
      value = [...multiSelected];
    } else {
      if (singleSelected === null) {
        Alert.alert('Selección', 'Elige una opción para continuar.');
        return;
      }
      value = singleSelected;
    }
    const next = [...answers, { question_key: q.question_key, value }];
    try {
      setSubmitting(true);
      await applyNextState(next);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo avanzar');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMulti = (entry: OptionEntry) => {
    setMultiSelected((prev) => {
      const exists = prev.some((v) => v === entry.value);
      if (exists) return prev.filter((v) => v !== entry.value);
      return [...prev, entry.value];
    });
  };

  const moveOrderStep = (qKey: string, index: number, dir: -1 | 1) => {
    setOrderDrafts((prev) => {
      const arr = [...(prev[qKey] ?? [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return prev;
      const t = arr[index]!;
      arr[index] = arr[j]!;
      arr[j] = t;
      return { ...prev, [qKey]: arr };
    });
  };

  const submitPhase2 = async () => {
    if (view.kind !== 'phase2') return;
    if (!accessToken) {
      Alert.alert('Sesión', 'Tenés que iniciar sesión de nuevo.');
      return;
    }
    const nextVals: Record<string, unknown> = { ...phase2Values };
    for (const q of view.questions) {
      let v = nextVals[q.question_key];
      if (v === undefined && q.type === 'order') {
        v = orderDraftsRef.current[q.question_key] ?? getOrderClientSteps(q);
      }
      const orderEmpty = q.type === 'order' && Array.isArray(v) && v.length === 0;
      if (v === undefined || orderEmpty || (q.type === 'multi' && Array.isArray(v) && v.length === 0)) {
        Alert.alert(
          'Fase 2',
          'Falta completar alguna pregunta. En las de orden, tocá «Confirmar orden» después de ordenar (o reordená si no hay pasos visibles).',
        );
        return;
      }
      nextVals[q.question_key] = v;
    }
    const merged = [...answers, ...view.questions.map((q) => ({ question_key: q.question_key, value: nextVals[q.question_key]! }))];
    try {
      setSubmitting(true);
      const { elo_rating } = await submitPlayerOnboarding(accessToken, merged);
      const eloNum = Number(elo_rating);
      setView({ kind: 'done', elo: Number.isFinite(eloNum) ? eloNum : 0 });
    } catch (e) {
      if (isAlreadyCompletedError(e)) {
        onCompleted(0);
        setView({ kind: 'already_done', elo: savedEloRatingRef.current ?? null });
        return;
      }
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const setPhase2Single = (qKey: string, value: unknown) => {
    setPhase2Values((p) => ({ ...p, [qKey]: value }));
  };

  const setPhase2MultiToggle = (qKey: string, entry: OptionEntry) => {
    setPhase2Values((p) => {
      const cur = (p[qKey] as unknown[] | undefined) ?? [];
      const exists = cur.some((v) => v === entry.value);
      let next: unknown[];
      if (exists) next = cur.filter((v) => v !== entry.value);
      else next = [...cur, entry.value];
      return { ...p, [qKey]: next };
    });
  };

  const renderQuestionBody = (q: OnboardingQuestionPayload, mode: 'single_flow' | 'phase2') => {
    const entries = getOptionEntries(q);

    if (q.type === 'order') {
      const steps = orderDrafts[q.question_key] ?? getOrderClientSteps(q);
      const orderConfirmed =
        mode === 'phase2' &&
        Array.isArray(phase2Values[q.question_key]) &&
        (phase2Values[q.question_key] as unknown[]).length > 0;
      return (
        <View style={styles.block}>
          <Text style={styles.orderHint}>Ordena de arriba a abajo (1 = primero). Usa las flechas.</Text>
          {steps.length === 0 ? (
            <Text style={styles.orderEmptyWarn}>No se pudieron cargar los pasos. Cierra y abre de nuevo el cuestionario.</Text>
          ) : null}
          {steps.map((step, i) => (
            <View key={`${q.question_key}-${i}`} style={styles.orderRow}>
              <Text style={styles.orderIndex}>{i + 1}</Text>
              <Text style={styles.orderText}>{step}</Text>
              <Pressable onPress={() => moveOrderStep(q.question_key, i, -1)} style={styles.orderBtn}>
                <Ionicons name="chevron-up" size={18} color="#fff" />
              </Pressable>
              <Pressable onPress={() => moveOrderStep(q.question_key, i, 1)} style={styles.orderBtn}>
                <Ionicons name="chevron-down" size={18} color="#fff" />
              </Pressable>
            </View>
          ))}
          {mode === 'phase2' ? (
            <>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  const latest = orderDraftsRef.current[q.question_key] ?? getOrderClientSteps(q);
                  setPhase2Values((p) => ({ ...p, [q.question_key]: [...latest] }));
                }}
              >
                <Text style={styles.secondaryBtnText}>Confirmar orden</Text>
              </Pressable>
              {orderConfirmed ? <Text style={styles.orderConfirmed}>Orden registrado para enviar</Text> : null}
            </>
          ) : null}
        </View>
      );
    }

    if (q.type === 'multi') {
      const selected = mode === 'single_flow' ? multiSelected : ((phase2Values[q.question_key] as unknown[]) ?? []);
      return (
        <View style={styles.optionsCol}>
          {entries.map((e) => {
            const on = selected.some((v) => v === e.value);
            return (
              <Pressable
                key={String(e.label)}
                onPress={() => {
                  if (mode === 'single_flow') toggleMulti(e);
                  else setPhase2MultiToggle(q.question_key, e);
                }}
                style={[styles.optionBtn, on && styles.optionBtnSelected]}
              >
                <View style={[styles.checkOuter, on && styles.checkOuterOn]}>
                  {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.optionText}>{e.label}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    const selectedVal = mode === 'single_flow' ? singleSelected : phase2Values[q.question_key];
    return (
      <View style={styles.optionsCol}>
        {entries.map((e) => {
          const on = selectedVal === e.value;
          return (
            <Pressable
              key={String(e.label)}
              onPress={() => {
                if (mode === 'single_flow') setSingleSelected(e.value);
                else setPhase2Single(q.question_key, e.value);
              }}
              style={[styles.optionBtn, on && styles.optionBtnSelected]}
            >
              <View style={[styles.radioOuter, on && styles.radioOuterOn]}>{on ? <View style={styles.radioInner} /> : null}</View>
              <Text style={styles.optionText}>{e.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const footerPadding = (insets.bottom ?? 0) + 16;

  let inner: React.ReactNode = null;
  if (bootError) {
    inner = (
      <View style={styles.centerPad}>
        <Text style={styles.errorText}>{bootError}</Text>
        <Pressable style={styles.primaryWrap} onPress={handleClose}>
          <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
            <Text style={styles.primaryText}>Cerrar</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  } else if (view.kind === 'loading') {
    inner = (
      <View style={styles.centerPad}>
        <ActivityIndicator size="large" color="#F18F34" />
        <Text style={styles.muted}>Cargando cuestionario…</Text>
      </View>
    );
  } else if (view.kind === 'already_done') {
    inner = (
      <View style={styles.centerPad}>
        <Ionicons name="checkmark-circle" size={48} color="#34D399" style={{ marginBottom: 8 }} />
        <Text style={styles.alreadyDoneTitle}>Nivelación del club completada</Text>
        <Text style={styles.alreadyDoneBody}>
          El cuestionario oficial del club (el que viene del servidor) ya está registrado. No quedan pasos
          pendientes.
        </Text>
        {view.elo != null && Number.isFinite(view.elo) ? (
          <Text style={styles.alreadyDoneElo}>Tu ELO en perfil: {view.elo.toFixed(2)}</Text>
        ) : null}
        <Pressable style={styles.primaryWrap} onPress={handleClose}>
          <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
            <Text style={styles.primaryText}>Cerrar</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  } else if (view.kind === 'single') {
    inner = (
      <>
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>Nivelación del club · {view.stepLabel}</Text>
            <Pressable onPress={handleClose} style={styles.iconClose}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.questionTitle}>{view.question.text}</Text>
          {renderQuestionBody(view.question, 'single_flow')}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: footerPadding }]}>
          <Pressable disabled={submitting} onPress={confirmSingleAndAdvance} style={styles.primaryWrap}>
            <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Siguiente</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </>
    );
  } else if (view.kind === 'phase2_intro') {
    inner = (
      <>
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>Fase 2 de 2</Text>
            <Pressable onPress={handleClose} style={styles.iconClose}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.questionTitle}>Afinamos tu nivel con 5 preguntas técnicas</Text>
          <Text style={styles.phase2IntroBody}>
            Tras el cuestionario oficial, tu puntuación orientativa es{' '}
            <Text style={styles.phase2IntroElo}>{view.eloPhase1.toFixed(2)}</Text> (escala 0–7). El bloque siguiente
            está calibrado para el perfil «{poolLabel(view.poolAssigned)}».
          </Text>
          <Text style={styles.phase2IntroHint}>
            Responde con cuidado: estas respuestas ajustan tu ELO inicial antes de guardarlo en tu perfil.
          </Text>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: footerPadding }]}>
          <Pressable
            disabled={submitting}
            onPress={() =>
              setView({
                kind: 'phase2',
                questions: view.questions,
                stepLabel: `Fase 2 · ${view.questions.length} preguntas`,
              })
            }
            style={styles.primaryWrap}
          >
            <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
              <Text style={styles.primaryText}>Ir a las preguntas de Fase 2</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </>
    );
  } else if (view.kind === 'phase2') {
    inner = (
      <>
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>{view.stepLabel}</Text>
            <Pressable onPress={handleClose} style={styles.iconClose}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {view.questions.map((q, idx) => (
            <View key={q.question_key} style={styles.phase2Block}>
              <Text style={styles.phase2Label}>
                Pregunta {idx + 1} de {view.questions.length}
              </Text>
              <Text style={styles.questionTitle}>{q.text}</Text>
              {renderQuestionBody(q, 'phase2')}
            </View>
          ))}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: footerPadding }]}>
          <Pressable
            disabled={submitting}
            onPress={() => {
              void submitPhase2();
            }}
            style={styles.primaryWrap}
          >
            <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Calcular y guardar mi nivel</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </>
    );
  } else if (view.kind === 'done') {
    const eloLabel = Number.isFinite(view.elo) ? view.elo.toFixed(2) : '—';
    inner = (
      <View style={styles.doneRoot}>
        <Pressable style={[styles.iconClose, styles.doneClose]} onPress={handleClose}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.doneTitle}>Tu nivel inicial</Text>
        <Text style={styles.doneElo}>{eloLabel}</Text>
        <Text style={styles.doneSub}>
          Escala 0–7 · según tus respuestas (camino corto o completo). Ya puedes usar matchmaking y lecciones según las
          reglas del club.
        </Text>
        <Pressable
          style={styles.primaryWrap}
          onPress={() => {
            onCompleted(Number.isFinite(view.elo) ? view.elo : 0);
            handleClose();
          }}
        >
          <LinearGradient pointerEvents="none" colors={['#F18F34', '#E95F32']} style={styles.primaryGrad}>
            <Text style={styles.primaryText}>Listo</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }], paddingBottom: footerPadding }]}>
          {inner}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#151515',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: SCREEN_HEIGHT * 0.92,
    minHeight: SCREEN_HEIGHT * 0.42,
  },
  header: { paddingHorizontal: 16, paddingTop: 10 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  iconClose: { padding: 8, borderRadius: 10 },
  body: { maxHeight: SCREEN_HEIGHT * 0.58 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 12 },
  questionTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 14, lineHeight: 24 },
  optionsCol: { gap: 10 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  optionBtnSelected: { borderColor: 'rgba(241,143,52,0.55)', backgroundColor: 'rgba(241,143,52,0.12)' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: '#F18F34' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F18F34' },
  checkOuter: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOuterOn: { backgroundColor: '#F18F34', borderColor: '#F18F34' },
  optionText: { flex: 1, color: '#E5E7EB', fontSize: 14, lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  primaryWrap: { borderRadius: 14, overflow: 'hidden', width: '100%' },
  primaryGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  centerPad: { padding: 28, alignItems: 'center', gap: 16 },
  muted: { color: '#6B7280', fontSize: 13 },
  errorText: { color: '#FCA5A5', textAlign: 'center', fontSize: 14 },
  block: { marginBottom: 8 },
  orderHint: { color: '#9CA3AF', fontSize: 12, marginBottom: 10 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  orderIndex: { color: '#F18F34', fontWeight: '700', width: 22 },
  orderText: { flex: 1, color: '#E5E7EB', fontSize: 13 },
  orderBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
  },
  secondaryBtnText: { color: '#F18F34', fontWeight: '600', fontSize: 13 },
  orderConfirmed: { color: '#6EE7B7', fontSize: 13, fontWeight: '600', marginTop: 10 },
  orderEmptyWarn: { color: '#FCA5A5', fontSize: 13, marginBottom: 10 },
  phase2Block: { marginBottom: 22, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  phase2Label: { color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  phase2IntroBody: { color: '#9CA3AF', fontSize: 14, lineHeight: 22, marginBottom: 14 },
  phase2IntroElo: { color: '#F18F34', fontWeight: '800' },
  phase2IntroHint: { color: '#6B7280', fontSize: 13, lineHeight: 20 },
  alreadyDoneTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  alreadyDoneBody: { color: '#9CA3AF', fontSize: 14, lineHeight: 22, textAlign: 'center', paddingHorizontal: 8 },
  alreadyDoneElo: { color: '#F18F34', fontSize: 20, fontWeight: '800', marginTop: 8 },
  doneRoot: { padding: 24, alignItems: 'center' },
  doneClose: { alignSelf: 'flex-end', marginBottom: 8 },
  doneTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 8 },
  doneElo: { color: '#fff', fontSize: 44, fontWeight: '800', marginBottom: 12 },
  doneSub: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginBottom: 24, lineHeight: 20, paddingHorizontal: 8 },
});
