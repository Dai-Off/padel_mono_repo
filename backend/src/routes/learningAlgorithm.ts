// ---------------------------------------------------------------------------
// Selection algorithm types
// ---------------------------------------------------------------------------

export interface QuestionRow {
  id: string;
  type: string;
  level: number;
  area: string;
  has_video: boolean;
  video_url: string | null;
  content: Record<string, unknown>;
}

export interface HistoryEntry {
  question_id: string;
  answered_correctly: boolean;
  answered_at: string;
}

interface ScoredQuestion {
  question: QuestionRow;
  weight: number;
}

// ---------------------------------------------------------------------------
// Selection algorithm
// ---------------------------------------------------------------------------

const PESO_BASE = 100;
export const LESSON_SIZE = 5;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function bonusFallada(history: HistoryEntry[]): number {
  if (!history.length) return 0;
  const failedOnce = history.some((h) => !h.answered_correctly);
  if (!failedOnce) return 0;
  const last = history[history.length - 1];
  return last.answered_correctly ? 25 : 50;
}

function bonusNovedad(history: HistoryEntry[]): number {
  return history.length === 0 ? 40 : 0;
}

function bonusTiempo(history: HistoryEntry[], now: Date): number {
  if (!history.length) return 30;
  const lastDate = new Date(history[history.length - 1].answered_at);
  return Math.min(daysBetween(lastDate, now) * 3, 30);
}

function penalizacionNivel(questionLevel: number, eloRating: number): number {
  const dist = Math.abs(questionLevel - eloRating);
  if (dist <= 0.5) return 0;
  return Math.min((dist - 0.5) * 40, 80);
}

function penalizacionRepeticion(history: HistoryEntry[]): number {
  return Math.min(history.length * 8, 60);
}

function computeWeight(
  q: QuestionRow,
  history: HistoryEntry[],
  eloRating: number,
  now: Date,
  ignoreLevelPenalty: boolean,
): number {
  return (
    PESO_BASE +
    bonusFallada(history) +
    bonusNovedad(history) +
    bonusTiempo(history, now) -
    (ignoreLevelPenalty ? 0 : penalizacionNivel(q.level, eloRating)) -
    penalizacionRepeticion(history)
  );
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickFromScored(scored: ScoredQuestion[]): QuestionRow[] {
  const selected: QuestionRow[] = [];
  const used = new Set<string>();
  const areas = new Set<string>();

  // First slot: prefer test_classic if any candidate has positive weight
  const firstClassic = scored.find((s) => s.question.type === 'test_classic');
  if (firstClassic) {
    selected.push(firstClassic.question);
    used.add(firstClassic.question.id);
    areas.add(firstClassic.question.area);
  }

  while (selected.length < LESSON_SIZE) {
    const remainingSlots = LESSON_SIZE - selected.length;
    const last = selected[selected.length - 1];
    // Force a new area if this is the last slot and we still only have one area
    const needNewArea = areas.size < 2 && remainingSlots === 1;

    const candidates = scored.filter((s) => !used.has(s.question.id));
    if (candidates.length === 0) break;

    const findFirst = (predicate: (q: QuestionRow) => boolean) =>
      candidates.find((c) => predicate(c.question));

    const next: ScoredQuestion =
      (needNewArea ? findFirst((q) => !areas.has(q.area)) : undefined) ??
      (last ? findFirst((q) => q.type !== last.type) : undefined) ??
      candidates[0];

    selected.push(next.question);
    used.add(next.question.id);
    areas.add(next.question.area);
  }

  return selected;
}

export function selectQuestions(
  questions: QuestionRow[],
  historyByQuestion: Map<string, HistoryEntry[]>,
  eloRating: number,
): QuestionRow[] {
  if (questions.length === 0) return [];

  const now = new Date();

  const buildScored = (ignoreLevelPenalty: boolean): ScoredQuestion[] =>
    questions
      .map((q) => ({
        question: q,
        weight: computeWeight(q, historyByQuestion.get(q.id) ?? [], eloRating, now, ignoreLevelPenalty),
      }))
      .sort((a, b) => b.weight - a.weight);

  let selected = pickFromScored(buildScored(false));

  // Fallback: not enough questions after applying level penalty → retry ignoring it
  if (selected.length < LESSON_SIZE && questions.length >= LESSON_SIZE) {
    selected = pickFromScored(buildScored(true));
  }

  // Final shuffle, keeping the first slot fixed (test_classic rule)
  if (selected.length > 1) {
    const rest = selected.slice(1);
    shuffleInPlace(rest);
    selected = [selected[0], ...rest];
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Content sanitization — remove correct answers before sending to client
// ---------------------------------------------------------------------------

export function sanitizeContent(type: string, content: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...content };
  switch (type) {
    case 'test_classic':
      delete clean.correct_index;
      break;
    case 'true_false':
      delete clean.correct_answer;
      break;
    case 'multi_select':
      delete clean.correct_indices;
      break;
    // match_columns and order_sequence: the correct order IS the stored order,
    // so we shuffle before sending
    case 'match_columns': {
      const pairs = clean.pairs as { left: string; right: string }[];
      if (Array.isArray(pairs)) {
        const rights = pairs.map((p) => p.right);
        // Fisher-Yates shuffle for the right column
        for (let i = rights.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rights[i], rights[j]] = [rights[j], rights[i]];
        }
        clean.lefts = pairs.map((p) => p.left);
        clean.rights_shuffled = rights;
        delete clean.pairs;
      }
      break;
    }
    case 'order_sequence': {
      const steps = clean.steps as string[];
      if (Array.isArray(steps)) {
        const shuffled = [...steps];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        clean.steps_shuffled = shuffled;
        delete clean.steps;
      }
      break;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------

export function checkAnswer(type: string, content: Record<string, unknown>, selectedAnswer: unknown): boolean {
  switch (type) {
    case 'test_classic':
      return selectedAnswer === (content as { correct_index: number }).correct_index;

    case 'true_false':
      return selectedAnswer === (content as { correct_answer: boolean }).correct_answer;

    case 'multi_select': {
      const correct = [...((content as { correct_indices: number[] }).correct_indices)].sort();
      const selected = Array.isArray(selectedAnswer) ? [...selectedAnswer].sort() : [];
      return JSON.stringify(correct) === JSON.stringify(selected);
    }

    case 'match_columns': {
      // Client sends array of right-side STRINGS corresponding to each left-side item in original order
      const pairs = (content as { pairs: { left: string; right: string }[] }).pairs;
      if (!Array.isArray(selectedAnswer) || selectedAnswer.length !== pairs.length) return false;
      return selectedAnswer.every((val, idx) => val === pairs[idx].right);
    }

    case 'order_sequence': {
      // Client sends array of step STRINGS in the order they chose
      const steps = (content as { steps: string[] }).steps;
      if (!Array.isArray(selectedAnswer) || selectedAnswer.length !== steps.length) return false;
      return selectedAnswer.every((val, idx) => val === steps[idx]);
    }

    default:
      return false;
  }
}

export function getCorrectAnswer(type: string, content: Record<string, unknown>): unknown {
  switch (type) {
    case 'test_classic':
      return (content as { correct_index: number }).correct_index;
    case 'true_false':
      return (content as { correct_answer: boolean }).correct_answer;
    case 'multi_select':
      return (content as { correct_indices: number[] }).correct_indices;
    case 'match_columns': {
      const pairs = (content as { pairs: { right: string }[] }).pairs;
      return pairs.map(p => p.right);
    }
    case 'order_sequence': {
      const steps = (content as { steps: string[] }).steps;
      return steps;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function timePenalty(responseTimeMs: number): number {
  if (responseTimeMs < 5000) return 0;
  if (responseTimeMs >= 10000) return 30;
  // Linear between 5000-10000
  return Math.round(((responseTimeMs - 5000) / 5000) * 30);
}
