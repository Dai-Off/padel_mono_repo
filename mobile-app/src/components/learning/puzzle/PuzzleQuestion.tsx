import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExplanationCard } from '../ExplanationCard';
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

  // Frame mostrado: si confirmamos y la opción tiene reveal_frame → ese frame; sino el inicial.
  const displayedFrame: PuzzleFrame =
    confirmed && selected?.reveal_frame ? selected.reveal_frame : content.initial_frame;

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

  const tierStyle = (opt: PuzzleOption) => {
    if (!confirmed) {
      return selected?.id === opt.id ? styles.optionSelected : styles.option;
    }
    if (opt.points === 2) return styles.optionCorrect;
    if (selected?.id === opt.id) return styles.optionIncorrect;
    return styles.option;
  };

  const tierLetterStyle = (opt: PuzzleOption) => {
    if (!confirmed) {
      return selected?.id === opt.id ? styles.letterSelected : styles.letter;
    }
    if (opt.points === 2) return styles.letterCorrect;
    if (selected?.id === opt.id) return styles.letterIncorrect;
    return styles.letter;
  };

  const tierTextStyle = (opt: PuzzleOption) => {
    if (!confirmed) return styles.optionText;
    if (opt.points === 2) return styles.optionTextCorrect;
    if (selected?.id === opt.id) return styles.optionTextIncorrect;
    return styles.optionText;
  };

  return (
    <View>
      <Text style={styles.statement}>{content.statement}</Text>

      <PuzzleStage frame={displayedFrame} />

      <View style={styles.options}>
        {content.options.map((opt) => {
          const letter = String.fromCharCode(64 + opt.id);
          const showCorrectIcon = confirmed && opt.points === 2;
          const showWrongIcon = confirmed && selected?.id === opt.id && opt.points !== 2;
          return (
            <Pressable
              key={opt.id}
              onPress={() => handleSelect(opt)}
              disabled={confirmed}
              style={({ pressed }) => [tierStyle(opt), !confirmed && pressed && styles.pressed]}
            >
              <View style={tierLetterStyle(opt)}>
                {showCorrectIcon ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : showWrongIcon ? (
                  <Ionicons name="close" size={14} color="#fff" />
                ) : (
                  <Text style={confirmed && (opt.points === 2 || selected?.id === opt.id) ? styles.letterTextActive : styles.letterText}>
                    {letter}
                  </Text>
                )}
              </View>
              <Text style={tierTextStyle(opt)}>{opt.text}</Text>
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

      {confirmed && selected?.explanation && (
        <ExplanationCard explanation={selected.explanation} />
      )}
      {confirmed && content.general_explanation && (
        <ExplanationCard explanation={content.general_explanation} />
      )}
      {/* Por si el cliente quiere mostrar la correcta cuando falló: el árbol ya la trae. */}
      {confirmed && selected && selected.points !== 2 && correctOption && (
        <View style={styles.correctHint}>
          <Ionicons name="bulb-outline" size={14} color="#10B981" />
          <Text style={styles.correctHintText}>
            La opción correcta era {String.fromCharCode(64 + correctOption.id)}: {correctOption.text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statement: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 16,
  },
  options: {
    gap: 12,
    marginTop: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  optionSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 12,
  },
  optionCorrect: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    gap: 12,
  },
  optionIncorrect: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    gap: 12,
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  letter: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterSelected: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterCorrect: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterIncorrect: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: { color: '#6B7280', fontSize: 14, fontWeight: '700' },
  letterTextActive: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  optionText: { flex: 1, color: '#D1D5DB', fontSize: 13, lineHeight: 18 },
  optionTextCorrect: { flex: 1, color: '#10B981', fontSize: 13, lineHeight: 18 },
  optionTextIncorrect: { flex: 1, color: '#EF4444', fontSize: 13, lineHeight: 18 },
  confirmBtn: {
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#F18F34',
  },
  confirmBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.06)' },
  confirmBtnPressed: { opacity: 0.85 },
  confirmText: { color: '#6B7280', fontSize: 14, fontWeight: '700' },
  confirmTextActive: { color: '#fff', fontSize: 14, fontWeight: '700' },
  correctHint: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
  },
  correctHintText: { flex: 1, color: '#10B981', fontSize: 12, lineHeight: 16 },
});
