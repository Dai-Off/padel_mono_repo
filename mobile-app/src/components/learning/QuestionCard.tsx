import { View } from 'react-native';
import type { DailyLessonQuestion } from '../../api/dailyLessons';
import { TestClassicQuestion } from './TestClassicQuestion';
import { TrueFalseQuestion } from './TrueFalseQuestion';
import { MultiSelectQuestion } from './MultiSelectQuestion';
import { OrderSequenceQuestion } from './OrderSequenceQuestion';
import { MatchColumnsQuestion } from './MatchColumnsQuestion';

type Props = {
  question: DailyLessonQuestion;
  onAnswered: (correct: boolean, selectedAnswer: unknown) => void;
};

export function QuestionCard({ question, onAnswered }: Props) {
  const c = question.content as Record<string, unknown>;

  switch (question.type) {
    case 'test_classic':
      return (
        <TestClassicQuestion
          content={c as { question: string; options: string[]; correct_index: number; explanation?: string }}
          onAnswered={onAnswered}
        />
      );
    case 'true_false':
      return (
        <TrueFalseQuestion
          content={c as { statement: string; correct_answer: boolean; explanation?: string }}
          onAnswered={onAnswered}
        />
      );
    case 'multi_select':
      return (
        <MultiSelectQuestion
          content={c as { question: string; options: string[]; correct_indices: number[]; explanation?: string }}
          onAnswered={onAnswered}
        />
      );
    case 'order_sequence':
      return (
        <OrderSequenceQuestion
          content={c as { question?: string; steps: string[]; explanation?: string }}
          onAnswered={onAnswered}
        />
      );
    case 'match_columns':
      return (
        <MatchColumnsQuestion
          content={c as { pairs: { left: string; right: string }[]; explanation?: string }}
          onAnswered={onAnswered}
        />
      );
    default:
      return <View />;
  }
}
