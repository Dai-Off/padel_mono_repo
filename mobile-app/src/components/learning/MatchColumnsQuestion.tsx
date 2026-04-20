import { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
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

type ShuffledRight = { text: string; correctIndex: number; key: string };

export function MatchColumnsQuestion({ content, onAnswered }: Props) {
  const lefts = content.pairs.map((p) => p.left);

  // Barajar la columna derecha (indice estable para animar layout)
  const shuffledRights = useMemo<ShuffledRight[]>(() => {
    const indexed: ShuffledRight[] = content.pairs.map((p, i) => ({
      text: p.right,
      correctIndex: i,
      key: `r-${i}`,
    }));
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

  const matchedCount = matches.filter((m) => m !== null).length;
  const allMatched = matchedCount === lefts.length;

  // Orden derivado: cada fila derecha se alinea con el left en su posicion.
  // Los rights no emparejados se colocan (en orden estable) en los huecos restantes.
  const displayedRights = useMemo<ShuffledRight[]>(() => {
    const result: (ShuffledRight | null)[] = new Array(lefts.length).fill(null);
    const usedIndices = new Set<number>();
    matches.forEach((rightIdx, leftIdx) => {
      if (rightIdx !== null) {
        result[leftIdx] = shuffledRights[rightIdx];
        usedIndices.add(rightIdx);
      }
    });
    const unused = shuffledRights.filter((_, i) => !usedIndices.has(i));
    let u = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === null) {
        result[i] = unused[u++];
      }
    }
    return result.filter((r): r is ShuffledRight => r !== null);
  }, [matches, shuffledRights, lefts.length]);

  const handleLeftPress = (index: number) => {
    if (submitted) return;
    setSelectedLeft(index);
  };

  const handleRightPress = (shuffledRightIndex: number) => {
    if (submitted || selectedLeft === null) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMatches((prev) => {
      const next = [...prev];
      // Liberar si este right ya estaba asignado
      const existingLeft = next.findIndex((m) => m === shuffledRightIndex);
      if (existingLeft >= 0) next[existingLeft] = null;
      next[selectedLeft] = shuffledRightIndex;
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

  // Estilo del item izquierdo segun estado
  const leftItemStyle = (i: number) => {
    const isSelected = selectedLeft === i;
    const isMatched = matches[i] !== null;
    if (submitted && isMatched) {
      return isCorrectPair(i) ? styles.itemCorrect : styles.itemIncorrect;
    }
    if (isSelected) return styles.itemLeftSelected;
    if (isMatched) return styles.itemLeftMatched;
    return styles.item;
  };

  // Estilo del item derecho segun estado (el index aqui es del shuffledRights original)
  const rightItemStyle = (shuffledRightIdx: number) => {
    const isUsed = matches.includes(shuffledRightIdx);
    if (submitted && isUsed) {
      const leftIdx = matches.findIndex((m) => m === shuffledRightIdx);
      return leftIdx >= 0 && isCorrectPair(leftIdx) ? styles.itemCorrect : styles.itemIncorrect;
    }
    if (isUsed) return styles.itemRightMatched;
    return styles.item;
  };

  return (
    <View>
      <Text style={styles.question}>Empareja cada elemento</Text>
      <View style={styles.hintRow}>
        <Ionicons name="link-outline" size={12} color="#9CA3AF" />
        <Text style={styles.hint}>{matchedCount}/{lefts.length} EMPAREJADOS</Text>
      </View>

      <View style={styles.columns}>
        {/* Columna izquierda */}
        <View style={styles.column}>
          {lefts.map((left, i) => {
            const isMatched = matches[i] !== null;
            return (
              <Pressable key={`l-${i}`} onPress={() => handleLeftPress(i)} style={leftItemStyle(i)}>
                <Text style={[styles.itemNumber, isMatched && styles.itemNumberMatched]}>{i + 1}</Text>
                <Text style={styles.itemText} numberOfLines={3}>{left}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Columna derecha: usa displayedRights en orden derivado */}
        <View style={styles.column}>
          {displayedRights.map((right) => {
            // Encontrar el indice original en shuffledRights
            const shuffledRightIdx = shuffledRights.findIndex((r) => r.key === right.key);
            return (
              <Pressable
                key={right.key}
                onPress={() => handleRightPress(shuffledRightIdx)}
                style={({ pressed }) => [
                  rightItemStyle(shuffledRightIdx),
                  !submitted && pressed && styles.pressed,
                ]}
              >
                <Text style={styles.itemText} numberOfLines={3}>{right.text}</Text>
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

const BASE_ITEM = {
  padding: 12,
  borderRadius: 12,
  minHeight: 56,
  justifyContent: 'center' as const,
  borderWidth: 1,
};

const styles = StyleSheet.create({
  question: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  hint: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
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
    ...BASE_ITEM,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  itemLeftSelected: {
    ...BASE_ITEM,
    backgroundColor: 'rgba(241,143,52,0.18)',
    borderColor: '#F18F34',
    borderWidth: 2,
  },
  itemLeftMatched: {
    ...BASE_ITEM,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderColor: 'rgba(241,143,52,0.3)',
    borderRightWidth: 3,
    borderRightColor: '#F18F34',
  },
  itemRightMatched: {
    ...BASE_ITEM,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderColor: 'rgba(241,143,52,0.3)',
    borderLeftWidth: 3,
    borderLeftColor: '#F18F34',
  },
  itemCorrect: {
    ...BASE_ITEM,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  itemIncorrect: {
    ...BASE_ITEM,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemNumber: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemNumberMatched: {
    color: '#F18F34',
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
