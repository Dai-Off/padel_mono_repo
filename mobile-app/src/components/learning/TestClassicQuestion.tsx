import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExplanationCard } from './ExplanationCard';

type Props = {
  content: {
    question: string;
    options: string[];
    correct_index: number;
    explanation?: string;
  };
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function TestClassicQuestion({ content, onAnswered }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  const handleSelect = (index: number) => {
    if (answered) return;
    setSelected(index);
    onAnswered(index === content.correct_index, index);
  };

  const getOptionStyle = (index: number) => {
    if (!answered) {
      return styles.option;
    }
    if (index === content.correct_index) return styles.optionCorrect;
    if (index === selected) return styles.optionIncorrect;
    return styles.option;
  };

  const getLetterStyle = (index: number) => {
    if (!answered) return styles.letter;
    if (index === content.correct_index) return styles.letterCorrect;
    if (index === selected) return styles.letterIncorrect;
    return styles.letter;
  };

  const getLetterTextStyle = (index: number) => {
    if (!answered) return styles.letterText;
    if (index === content.correct_index || index === selected) return styles.letterTextActive;
    return styles.letterText;
  };

  const getOptionTextStyle = (index: number) => {
    if (!answered) return styles.optionText;
    if (index === content.correct_index) return styles.optionTextCorrect;
    if (index === selected && index !== content.correct_index) return styles.optionTextIncorrect;
    return styles.optionText;
  };

  return (
    <View>
      <Text style={styles.question}>{content.question}</Text>
      <View style={styles.options}>
        {content.options.map((option, i) => (
          <Pressable
            key={i}
            onPress={() => handleSelect(i)}
            style={({ pressed }) => [getOptionStyle(i), !answered && pressed && styles.pressed]}
          >
            <View style={getLetterStyle(i)}>
              {answered && i === content.correct_index ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : answered && i === selected ? (
                <Ionicons name="close" size={14} color="#fff" />
              ) : (
                <Text style={getLetterTextStyle(i)}>{LETTERS[i]}</Text>
              )}
            </View>
            <Text style={getOptionTextStyle(i)}>{option}</Text>
          </Pressable>
        ))}
      </View>
      {answered && content.explanation && (
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
    marginBottom: 20,
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
  letterText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
  letterTextActive: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
});
