import { useState } from 'react';
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

  const correctOption = content.options.find((o) => o.points === 2) ?? null;

  // Frame mostrado: si hay una opción seleccionada con reveal_frame → ese frame
  // (anima al seleccionar Y al deseleccionar). Si no, el frame inicial.
  const displayedFrame: PuzzleFrame = selected?.reveal_frame ?? content.initial_frame;

  const handleSelect = (opt: PuzzleOption) => {
    if (confirmed) return;
    setSelected((prev) => (prev?.id === opt.id ? null : opt));
  };

  const handleConfirm = () => {
    if (!selected || confirmed) return;
    setConfirmed(true);
    const correct = selected.points === 2;
    onAnswered(correct, { option_id: selected.id });
  };

  // Color del badge de cada opción según estado (igual color-scheme que en TestClassic).
  const badgeStyle = (opt: PuzzleOption) => {
    if (!confirmed) return selected?.id === opt.id ? styles.badgeSelected : styles.badge;
    if (opt.points === 2) return styles.badgeCorrect;
    if (selected?.id === opt.id) return styles.badgeIncorrect;
    return styles.badge;
  };
  const badgeTextStyle = (opt: PuzzleOption) => {
    if (!confirmed) return selected?.id === opt.id ? styles.badgeTextActive : styles.badgeText;
    if (opt.points === 2 || selected?.id === opt.id) return styles.badgeTextActive;
    return styles.badgeText;
  };

  return (
    <View>
      <Text style={styles.statement}>{content.statement}</Text>

      <PuzzleStage frame={displayedFrame} />

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
                selected.points === 2 ? styles.colorCorrect : styles.colorIncorrect,
              ]}
            >
              {String.fromCharCode(64 + selected.id)} · {selected.text}
            </Text>
            {selected.explanation ? (
              <Text style={styles.bubbleExplanation}>{selected.explanation}</Text>
            ) : null}
            {selected.points !== 2 && correctOption ? (
              <Text style={styles.bubbleCorrectHint}>
                Correcta: {String.fromCharCode(64 + correctOption.id)} — {correctOption.text}
              </Text>
            ) : null}
            {content.general_explanation ? (
              <Text style={styles.bubbleExplanation}>{content.general_explanation}</Text>
            ) : null}
          </>
        )}
      </View>

      {/* Barra inferior: A/B/C en horizontal + Confirmar */}
      <View style={styles.actionBar}>
        <View style={styles.optionsRow}>
          {content.options.map((opt) => {
            const letter = String.fromCharCode(64 + opt.id);
            const showCorrect = confirmed && opt.points === 2;
            const showWrong = confirmed && selected?.id === opt.id && opt.points !== 2;
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
  statement: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 8,
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
