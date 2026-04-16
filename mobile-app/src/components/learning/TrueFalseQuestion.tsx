import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExplanationCard } from './ExplanationCard';

type Props = {
  content: {
    statement: string;
    correct_answer: boolean;
    explanation?: string;
  };
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

const OPTIONS = [
  { label: 'Verdadero', value: true },
  { label: 'Falso', value: false },
] as const;

export function TrueFalseQuestion({ content, onAnswered }: Props) {
  const [selected, setSelected] = useState<boolean | null>(null);
  const answered = selected !== null;

  const handleSelect = (value: boolean) => {
    if (answered) return;
    setSelected(value);
    onAnswered(value === content.correct_answer, value);
  };

  const getOptionStyle = (value: boolean) => {
    if (!answered) return styles.option;
    if (value === content.correct_answer) return styles.optionCorrect;
    if (value === selected) return styles.optionIncorrect;
    return styles.option;
  };

  const getIconStyle = (value: boolean) => {
    if (!answered) return styles.iconBox;
    if (value === content.correct_answer) return styles.iconBoxCorrect;
    if (value === selected) return styles.iconBoxIncorrect;
    return styles.iconBox;
  };

  const getTextStyle = (value: boolean) => {
    if (!answered) return styles.optionText;
    if (value === content.correct_answer) return styles.optionTextCorrect;
    if (value === selected) return styles.optionTextIncorrect;
    return styles.optionText;
  };

  return (
    <View>
      <Text style={styles.statement}>{content.statement}</Text>
      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <Pressable
            key={String(opt.value)}
            onPress={() => handleSelect(opt.value)}
            style={({ pressed }) => [getOptionStyle(opt.value), !answered && pressed && styles.pressed]}
          >
            <View style={getIconStyle(opt.value)}>
              {answered && opt.value === content.correct_answer ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : answered && opt.value === selected ? (
                <Ionicons name="close" size={14} color="#fff" />
              ) : (
                <Ionicons
                  name={opt.value ? 'checkmark-circle-outline' : 'close-circle-outline'}
                  size={16}
                  color="#6B7280"
                />
              )}
            </View>
            <Text style={getTextStyle(opt.value)}>{opt.label}</Text>
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
  statement: {
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
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCorrect: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxIncorrect: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  optionTextCorrect: {
    flex: 1,
    color: '#10B981',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  optionTextIncorrect: {
    flex: 1,
    color: '#EF4444',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
