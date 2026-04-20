import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ExplanationCard } from './ExplanationCard';

type Props = {
  content: {
    question: string;
    options: string[];
    correct_indices: number[];
    explanation?: string;
  };
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

export function MultiSelectQuestion({ content, onAnswered }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const toggleOption = (index: number) => {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSubmit = () => {
    if (submitted || selected.size === 0) return;
    setSubmitted(true);
    const selectedArray = [...selected].sort();
    const correct = selectedArray.join(',') === [...content.correct_indices].sort().join(',');
    onAnswered(correct, selectedArray);
  };

  const isCorrectOption = (index: number) => content.correct_indices.includes(index);

  const getOptionStyle = (index: number) => {
    if (!submitted) {
      return selected.has(index) ? styles.optionSelected : styles.option;
    }
    if (isCorrectOption(index)) return styles.optionCorrect;
    if (selected.has(index)) return styles.optionIncorrect;
    return styles.option;
  };

  const getCheckboxStyle = (index: number) => {
    if (!submitted) {
      return selected.has(index) ? styles.checkboxSelected : styles.checkbox;
    }
    if (isCorrectOption(index)) return styles.checkboxCorrect;
    if (selected.has(index)) return styles.checkboxIncorrect;
    return styles.checkbox;
  };

  const getTextStyle = (index: number) => {
    if (!submitted) return styles.optionText;
    if (isCorrectOption(index)) return styles.optionTextCorrect;
    if (selected.has(index)) return styles.optionTextIncorrect;
    return styles.optionText;
  };

  return (
    <View>
      <Text style={styles.question}>{content.question}</Text>
      <Text style={styles.hint}>SELECCIONA TODAS LAS CORRECTAS</Text>
      <View style={styles.options}>
        {content.options.map((option, i) => (
          <Pressable
            key={i}
            onPress={() => toggleOption(i)}
            style={({ pressed }) => [getOptionStyle(i), !submitted && pressed && styles.pressed]}
          >
            <View style={getCheckboxStyle(i)}>
              {(selected.has(i) || (submitted && isCorrectOption(i))) && (
                <Ionicons name="checkmark" size={12} color="#fff" />
              )}
            </View>
            <Text style={getTextStyle(i)}>{option}</Text>
          </Pressable>
        ))}
      </View>
      {!submitted && (
        <Pressable onPress={handleSubmit} style={styles.submitButton}>
          <LinearGradient
            colors={['#F18F34', '#C46A20']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.submitText}>
              Comprobar ({selected.size} seleccionadas)
            </Text>
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
    marginBottom: 4,
  },
  hint: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  options: {
    gap: 12,
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
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.3)',
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#F18F34',
    borderWidth: 2,
    borderColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCorrect: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxIncorrect: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  optionTextCorrect: {
    flex: 1,
    color: '#10B981',
    fontSize: 13,
    lineHeight: 18,
  },
  optionTextIncorrect: {
    flex: 1,
    color: '#EF4444',
    fontSize: 13,
    lineHeight: 18,
  },
  submitButton: {
    marginTop: 20,
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
