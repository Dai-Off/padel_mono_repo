import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ExplanationCard } from './ExplanationCard';

type Props = {
  content: {
    question?: string;
    steps: string[];
    explanation?: string;
  };
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

export function OrderSequenceQuestion({ content, onAnswered }: Props) {
  // Barajar pasos al montar
  const shuffledSteps = useMemo(() => {
    const indexed = content.steps.map((step, i) => ({ step, correctIndex: i }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    return indexed;
  }, [content.steps]);

  const [available, setAvailable] = useState(shuffledSteps);
  const [ordered, setOrdered] = useState<typeof shuffledSteps>([]);
  const [submitted, setSubmitted] = useState(false);

  const addToOrder = (index: number) => {
    if (submitted) return;
    const item = available[index];
    setOrdered((prev) => [...prev, item]);
    setAvailable((prev) => prev.filter((_, i) => i !== index));
  };

  const removeFromOrder = (index: number) => {
    if (submitted) return;
    const item = ordered[index];
    setOrdered((prev) => prev.filter((_, i) => i !== index));
    setAvailable((prev) => [...prev, item]);
  };

  const handleSubmit = () => {
    if (submitted || ordered.length !== content.steps.length) return;
    setSubmitted(true);
    const selectedOrder = ordered.map((item) => item.correctIndex);
    const correct = ordered.every((item, i) => item.correctIndex === i);
    onAnswered(correct, selectedOrder);
  };

  const getOrderedItemStyle = (index: number) => {
    if (!submitted) return styles.orderedItem;
    if (ordered[index].correctIndex === index) return styles.orderedItemCorrect;
    return styles.orderedItemIncorrect;
  };

  const getNumberStyle = (index: number) => {
    if (!submitted) return styles.number;
    if (ordered[index].correctIndex === index) return styles.numberCorrect;
    return styles.numberIncorrect;
  };

  const getOrderedTextStyle = (index: number) => {
    if (!submitted) return styles.orderedText;
    if (ordered[index].correctIndex === index) return styles.orderedTextCorrect;
    return styles.orderedTextIncorrect;
  };

  return (
    <View>
      {content.question && <Text style={styles.question}>{content.question}</Text>}

      {ordered.length > 0 && (
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>TU ORDEN</Text>
          <View style={styles.items}>
            {ordered.map((item, i) => (
              <Pressable
                key={`o-${item.correctIndex}`}
                onPress={() => removeFromOrder(i)}
                style={getOrderedItemStyle(i)}
              >
                <View style={getNumberStyle(i)}>
                  <Text style={styles.numberText}>{i + 1}</Text>
                </View>
                <Text style={getOrderedTextStyle(i)}>{item.step}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {available.length > 0 && (
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>TOCA PARA ORDENAR</Text>
          <View style={styles.items}>
            {available.map((item, i) => (
              <Pressable
                key={`a-${item.correctIndex}`}
                onPress={() => addToOrder(i)}
                style={({ pressed }) => [styles.availableItem, pressed && styles.pressed]}
              >
                <View style={styles.bullet}>
                  <View style={styles.bulletDot} />
                </View>
                <Text style={styles.availableText}>{item.step}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!submitted && ordered.length === content.steps.length && (
        <Pressable onPress={handleSubmit} style={styles.submitButton}>
          <LinearGradient
            colors={['#F18F34', '#C46A20']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.submitText}>Comprobar orden</Text>
          </LinearGradient>
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
    marginBottom: 16,
  },
  zone: {
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  zoneLabel: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  items: {
    gap: 10,
  },
  orderedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
    gap: 10,
  },
  orderedItemCorrect: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    gap: 10,
  },
  orderedItemIncorrect: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    gap: 10,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCorrect: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberIncorrect: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  orderedText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  orderedTextCorrect: {
    flex: 1,
    color: '#10B981',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  orderedTextIncorrect: {
    flex: 1,
    color: '#EF4444',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  availableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bullet: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6B7280',
  },
  availableText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
