import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PuzzleStage } from './PuzzleStage';
import type { PuzzleContent, PuzzleFrame, PuzzleOption } from '../../../types/puzzle';

type Props = {
  content: PuzzleContent;
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

export function PuzzleQuestion({ content, onAnswered }: Props) {
  const [selected, setSelected] = useState<PuzzleOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // Si el puzzle tiene intro_frame: arrancamos mostrándolo y al siguiente tick
  // cambiamos a initial_frame para disparar la animación. Solo se reproduce una
  // vez (al cargar o al pulsar "Repetir intro"). Después permanece estático.
  const [showingIntro, setShowingIntro] = useState<boolean>(!!content.intro_frame);
  // Se mantiene true mientras dura la animación intro→initial completa
  // (showingIntro + duración del frame destino). Lo usamos para ocultar los
  // badges A/B/C durante toda la transición, no solo el primer tick.
  const [introAnimating, setIntroAnimating] = useState<boolean>(!!content.intro_frame);
  useEffect(() => {
    if (!showingIntro) return;
    const raf = requestAnimationFrame(() => setShowingIntro(false));
    return () => cancelAnimationFrame(raf);
  }, [showingIntro]);
  useEffect(() => {
    if (!introAnimating) return;
    // Duración total: muestro intro (~1 tick) + animación hacia initial.
    const dur = content.initial_frame?.duration_ms ?? 1500;
    const t = setTimeout(() => setIntroAnimating(false), dur + 50);
    return () => clearTimeout(t);
  }, [introAnimating, content.initial_frame?.duration_ms]);
  const replayIntro = () => {
    if (!content.intro_frame || confirmed || selected) return;
    setShowingIntro(true);
    setIntroAnimating(true);
  };

  // Defensa contra content malformado (puzzle sin árbol mergeado, p. ej. fila huérfana
  // en learning_puzzles): renderizar mensaje en lugar de crashear.
  const hasValidContent =
    content &&
    Array.isArray(content.options) &&
    content.options.length > 0 &&
    content.initial_frame &&
    Array.isArray(content.initial_frame.players) &&
    content.initial_frame.ball;

  if (!hasValidContent) {
    return (
      <View>
        <Text style={styles.statement}>
          {content?.statement ?? 'Puzzle no disponible.'}
        </Text>
        <View style={styles.bubble}>
          <Text style={styles.bubbleHint}>
            El contenido de este puzzle está incompleto. Salta al siguiente.
          </Text>
        </View>
      </View>
    );
  }

  const correctOption = content.options.find((o) => o.is_correct) ?? null;

  // Frame mostrado: 3-frame flow.
  //   init       (selected === null)           → initial_frame
  //   select     (selected !== null && !confirmed) → selected.select_frame
  //   confirmed  (selected !== null && confirmed)  → selected.confirmation_frame
  // Si alguno de los frames de la opción falta, caemos al siguiente disponible.
  // Base frame: si estamos en fase intro, mostramos intro_frame (1 tick).
  // Después se cambia a initial_frame, lo que dispara la animación intro→initial.
  const baseFrame: PuzzleFrame = showingIntro && content.intro_frame
    ? content.intro_frame
    : content.initial_frame;
  const displayedFrame: PuzzleFrame =
    confirmed && selected?.confirmation_frame
      ? selected.confirmation_frame
      : selected?.select_frame ?? selected?.confirmation_frame ?? baseFrame;

  const handleSelect = (opt: PuzzleOption) => {
    if (confirmed) return;
    setSelected((prev) => (prev?.id === opt.id ? null : opt));
  };

  const handleConfirm = () => {
    if (!selected || confirmed) return;
    setConfirmed(true);
    onAnswered(selected.is_correct, { option_id: selected.id });
  };

  // Color del badge de cada opción según estado (igual color-scheme que en TestClassic).
  const badgeStyle = (opt: PuzzleOption) => {
    if (!confirmed) return selected?.id === opt.id ? styles.badgeSelected : styles.badge;
    if (opt.is_correct) return styles.badgeCorrect;
    if (selected?.id === opt.id) return styles.badgeIncorrect;
    return styles.badge;
  };
  const badgeTextStyle = (opt: PuzzleOption) => {
    if (!confirmed) return selected?.id === opt.id ? styles.badgeTextActive : styles.badgeText;
    if (opt.is_correct || selected?.id === opt.id) return styles.badgeTextActive;
    return styles.badgeText;
  };

  return (
    <View>
      <View style={styles.statementRow}>
        <Text style={[styles.statement, { flex: 1 }]}>{content.statement}</Text>
        {content.intro_frame && !selected && !confirmed && (
          <Pressable
            onPress={replayIntro}
            hitSlop={8}
            style={styles.replayBtn}
          >
            <Ionicons name="play-back" size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      <PuzzleStage
        frame={displayedFrame}
        state={confirmed ? 'confirmed' : selected ? 'select' : 'init'}
        options={content.options}
        selectedOptionId={selected?.id ?? null}
        onSelectOption={handleSelect}
        transitionKey={
          confirmed && selected
            ? `confirm-${selected.id}`
            : selected
              ? `select-${selected.id}`
              : showingIntro
                ? 'intro'
                : 'init'
        }
        prevFrame={
          confirmed && selected
            ? (selected.select_frame ?? content.initial_frame)
            : selected
              ? content.initial_frame
              : showingIntro
                ? null // durante el primer tick: no hay anterior, es la posición de partida
                : (content.intro_frame ?? null) // tras intro: el anterior es el intro
        }
        // Badges ocultos mientras se muestra/anima el intro: el usuario aún no
        // entiende qué decide. Aparecen con fade-in al terminar la animación
        // (introAnimating cubre showingIntro + duración del frame destino).
        badgesHidden={introAnimating}
      />

      {/* Texto del bocadillo: cambia según la fase */}
      <View style={styles.bubble}>
        {!selected && !confirmed && (
          <Text style={styles.bubbleHint}>Selecciona A, B o C abajo y luego confirma.</Text>
        )}
        {selected && !confirmed && (
          <>
            <Text style={styles.bubbleLabel}>
              {String.fromCharCode(64 + selected.id)} · {selected.text}
            </Text>
            <Text style={styles.bubbleHint}>Pulsa Confirmar para ver el resultado.</Text>
          </>
        )}
        {confirmed && selected && (
          <>
            <Text
              style={[
                styles.bubbleLabel,
                selected.is_correct ? styles.colorCorrect : styles.colorIncorrect,
              ]}
            >
              {String.fromCharCode(64 + selected.id)} · {selected.text}
            </Text>
            {selected.explanation ? (
              <Text style={styles.bubbleExplanation}>{selected.explanation}</Text>
            ) : null}
            {!selected.is_correct && correctOption ? (
              <Text style={styles.bubbleCorrectHint}>
                Correcta: {String.fromCharCode(64 + correctOption.id)} — {correctOption.text}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Barra inferior: A/B/C en horizontal + Confirmar */}
      <View style={styles.actionBar}>
        <View style={styles.optionsRow}>
          {content.options.map((opt) => {
            const letter = String.fromCharCode(64 + opt.id);
            const showCorrect = confirmed && opt.is_correct;
            const showWrong = confirmed && selected?.id === opt.id && !opt.is_correct;
            return (
              <Pressable
                key={opt.id}
                onPress={() => handleSelect(opt)}
                disabled={confirmed}
                style={({ pressed }) => [badgeStyle(opt), !confirmed && pressed && styles.pressed]}
              >
                {showCorrect ? (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                ) : showWrong ? (
                  <Ionicons name="close" size={18} color="#fff" />
                ) : (
                  <Text style={badgeTextStyle(opt)}>{letter}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {!confirmed && (
          <Pressable
            onPress={handleConfirm}
            disabled={!selected}
            style={({ pressed }) => [
              styles.confirmBtn,
              !selected && styles.confirmBtnDisabled,
              selected && pressed && styles.confirmBtnPressed,
            ]}
          >
            <Text style={selected ? styles.confirmTextActive : styles.confirmText}>Confirmar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const BADGE_SIZE = 44;

const styles = StyleSheet.create({
  statementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  statement: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
  },
  replayBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Bocadillo de texto contextual
  bubble: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 56,
  },
  bubbleHint: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 16,
  },
  bubbleLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 2,
  },
  bubbleExplanation: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  bubbleCorrectHint: {
    color: '#10B981',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    fontWeight: '600',
  },
  colorCorrect: { color: '#10B981' },
  colorIncorrect: { color: '#EF4444' },
  // Barra de acción inferior
  actionBar: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSelected: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 12,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCorrect: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIncorrect: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#9CA3AF', fontSize: 16, fontWeight: '800' },
  badgeTextActive: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F18F34',
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.06)' },
  confirmBtnPressed: { opacity: 0.85 },
  confirmText: { color: '#6B7280', fontSize: 14, fontWeight: '700' },
  confirmTextActive: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
