import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DailyLessonQuestion } from '../../api/dailyLessons';
import { TestClassicQuestion } from './TestClassicQuestion';
import { TrueFalseQuestion } from './TrueFalseQuestion';
import { MultiSelectQuestion } from './MultiSelectQuestion';
import { OrderSequenceQuestion } from './OrderSequenceQuestion';
import { MatchColumnsQuestion } from './MatchColumnsQuestion';

type Props = {
  question: DailyLessonQuestion;
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
  onReplayVideo?: () => void;
};

export function QuestionCard({ question, onAnswered, onReplayVideo }: Props) {
  const [answered, setAnswered] = useState(false);
  const c = question.content as Record<string, unknown>;

  const handleAnswered = (correct: boolean, selectedAnswer: unknown) => {
    setAnswered(true);
    onAnswered(correct, selectedAnswer);
  };

  const questionComponent = (() => {
    switch (question.type) {
      case 'test_classic':
        return (
          <TestClassicQuestion
            content={c as { question: string; options: string[]; correct_index: number; explanation?: string }}
            onAnswered={handleAnswered}
          />
        );
      case 'true_false':
        return (
          <TrueFalseQuestion
            content={c as { statement: string; correct_answer: boolean; explanation?: string }}
            onAnswered={handleAnswered}
          />
        );
      case 'multi_select':
        return (
          <MultiSelectQuestion
            content={c as { question: string; options: string[]; correct_indices: number[]; explanation?: string }}
            onAnswered={handleAnswered}
          />
        );
      case 'order_sequence':
        return (
          <OrderSequenceQuestion
            content={c as { question?: string; steps: string[]; explanation?: string }}
            onAnswered={handleAnswered}
          />
        );
      case 'match_columns':
        return (
          <MatchColumnsQuestion
            content={c as { pairs: { left: string; right: string }[]; explanation?: string }}
            onAnswered={handleAnswered}
          />
        );
      default:
        return <View />;
    }
  })();

  return (
    <View>
      {question.has_video && question.video_url && onReplayVideo && !answered && (
        <Pressable
          onPress={onReplayVideo}
          style={({ pressed }) => [styles.replayBtn, pressed && styles.replayPressed]}
        >
          <Ionicons name="reload" size={14} color="#F18F34" />
          <Text style={styles.replayText}>Repetir video</Text>
        </Pressable>
      )}
      {questionComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  replayPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  replayText: {
    color: '#F18F34',
    fontSize: 13,
    fontWeight: '600',
  },
});
