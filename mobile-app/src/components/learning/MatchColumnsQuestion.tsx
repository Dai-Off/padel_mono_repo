import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExplanationCard } from './ExplanationCard';

type Pair = { left: string; right: string };

type Props = {
  content: {
    pairs: Pair[];
    explanation?: string;
  };
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

export function MatchColumnsQuestion({ content, onAnswered }: Props) {
  const lefts = content.pairs.map((p) => p.left);

  // Barajar la columna derecha
  const shuffledRights = useMemo(() => {
    const indexed = content.pairs.map((p, i) => ({ text: p.right, correctIndex: i }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    return indexed;
  }, [content.pairs]);

  // matches[leftIndex] = shuffledRightIndex | null
  const [matches, setMatches] = useState<(number | null)[]>(
    () => new Array(lefts.length).fill(null),
  );
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const usedRights = new Set(matches.filter((m): m is number => m !== null));
  const allMatched = matches.every((m) => m !== null);

  const handleLeftPress = (index: number) => {
    if (submitted) return;
    setSelectedLeft(index);
  };

  const handleRightPress = (rightIndex: number) => {
    if (submitted || selectedLeft === null) return;
    setMatches((prev) => {
      const next = [...prev];
      // Liberar si este right ya estaba asignado
      const existingLeft = next.findIndex((m) => m === rightIndex);
      if (existingLeft >= 0) next[existingLeft] = null;
      next[selectedLeft] = rightIndex;
      return next;
    });
    setSelectedLeft(null);
  };

  const handleSubmit = () => {
    if (submitted || !allMatched) return;
    setSubmitted(true);
    const selectedMatches = matches.map(
      (rightIdx) => rightIdx !== null ? shuffledRights[rightIdx].correctIndex : -1,
    );
    const correct = matches.every(
      (rightIdx, leftIdx) => rightIdx !== null && shuffledRights[rightIdx].correctIndex === leftIdx,
    );
    onAnswered(correct, selectedMatches);
  };

  const isCorrectPair = (leftIdx: number) => {
    const rightIdx = matches[leftIdx];
    if (rightIdx === null) return false;
    return shuffledRights[rightIdx].correctIndex === leftIdx;
  };

  return (
    <View>
      <Text style={styles.question}>Empareja cada elemento</Text>
      <Text style={styles.hint}>SELECCIONA UN ELEMENTO DE CADA COLUMNA</Text>

      <View style={styles.columns}>
        {/* Columna izquierda */}
        <View style={styles.column}>
          {lefts.map((left, i) => {
            const isSelected = selectedLeft === i;
            const isMatched = matches[i] !== null;
            let style = styles.item;
            if (submitted && isMatched) {
              style = isCorrectPair(i) ? styles.itemCorrect : styles.itemIncorrect;
            } else if (isSelected) {
              style = styles.itemSelected;
            } else if (isMatched) {
              style = styles.itemMatched;
            }
            return (
              <Pressable key={`l-${i}`} onPress={() => handleLeftPress(i)} style={style}>
                <Text style={styles.itemNumber}>{i + 1}</Text>
                <Text style={styles.itemText} numberOfLines={2}>{left}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Columna derecha */}
        <View style={styles.column}>
          {shuffledRights.map((right, i) => {
            const isUsed = usedRights.has(i);
            let style = styles.item;
            if (submitted && isUsed) {
              const leftIdx = matches.findIndex((m) => m === i);
              style = leftIdx >= 0 && isCorrectPair(leftIdx) ? styles.itemCorrect : styles.itemIncorrect;
            } else if (isUsed) {
              style = styles.itemMatched;
            }
            return (
              <Pressable
                key={`r-${i}`}
                onPress={() => handleRightPress(i)}
                style={({ pressed }) => [style, !submitted && pressed && styles.pressed]}
              >
                <Text style={styles.itemText} numberOfLines={2}>{right.text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!submitted && allMatched && (
        <Pressable onPress={handleSubmit} style={styles.submitButton}>
          <View style={styles.submitInner}>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.submitText}>Comprobar</Text>
          </View>
        </Pressable>
      )}

      {submitted && content.explanation && (
        <ExplanationCard explanation={content.explanation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 4,
  },
  hint: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  columns: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
    gap: 8,
  },
  item: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 56,
    justifyContent: 'center',
  },
  itemSelected: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.4)',
    minHeight: 56,
    justifyContent: 'center',
  },
  itemMatched: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
    minHeight: 56,
    justifyContent: 'center',
  },
  itemCorrect: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    minHeight: 56,
    justifyContent: 'center',
  },
  itemIncorrect: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    minHeight: 56,
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemNumber: {
    color: '#F18F34',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemText: {
    color: '#D1D5DB',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 16,
  },
  submitInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F18F34',
    gap: 8,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
